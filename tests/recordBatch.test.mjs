import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import axios,{AxiosHeaders} from 'axios';
import { fixture,A,B,response,multipart,writes,environment } from './recordMutation.fixture.mjs';
import { CrmRequestError,toolErrorPayload } from '../src/errors.ts';
import { parseBatch } from '../src/services/recordBatchWire.ts';
import { RecordBatchService } from '../src/services/recordBatch.ts';
import { RecordMutationService } from '../src/services/recordMutation.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { readConfig } from '../src/config.ts';
import { CacheService } from '../src/services/cache.ts';
import { handleToolCall } from '../src/tool_handler.ts';

const create = {operation:'create',arguments:{collection_name:'accounts',data:{name:'After'}}};
const update = {operation:'update',arguments:{collection_name:'accounts',id:A,data:{name:'After'}}};
const remove = {operation:'delete',arguments:{collection_name:'accounts',id:B}};
const failure = (id,status = 400) => ({id,status,body:{error:{code:'0x80040220',message:'sensitive-platform-text'}}});
async function failed(promise) {
  try { await promise; assert.fail('Expected an error'); } catch (error) {
    assert.ok(error instanceof CrmRequestError,error.stack);
    return toolErrorPayload(error);
  }
}

test('native wire parser handles quoted boundaries, empty 204 headers and JSON bodies', () => {
  const input = multipart([{id:1,status:204},{id:2,status:201,body:{accountid:A}}]);
  const result = parseBatch(input.data,input.headers['content-type']);
  assert.equal(result.length,2);
  assert.equal(result[0].response.status,204);
  assert.deepEqual(result[1].response.data,{accountid:A});
  assert.notEqual(result[0].changeSet,result[1].changeSet);
});

test('wire parser rejects truncated envelopes, duplicate headers, invalid status/IDs and wrong body types', () => {
  const valid = multipart([{id:1,status:204}]);
  for (const body of [multipart([{id:1,status:204}],{close:false}).data,
    valid.data.replace('Content-ID: 1','Content-ID: one'),
    valid.data.replace('Content-ID: 1','Content-ID: 1\r\nContent-ID: 2'),
    valid.data.replace('204 Result','202 Accepted'),
    multipart([{id:1,status:204,body:{unexpected:true}}]).data]) {
    assert.throws(() => parseBatch(body,valid.headers['content-type']),{code:'D365_BATCH_RESPONSE_INVALID'});
  }
  assert.throws(() => parseBatch({},valid.headers['content-type']));
  assert.throws(() => parseBatch(valid.data,'application/json'));
});

test('ordinary batch preflights all requests then emits one independent changeset per operation', async () => {
  const f = fixture();
  const result = await f.batch.execute({operations:[create,update,remove]},false);
  const sent = writes(f.calls);
  assert.equal(sent.length,1);
  assert.equal(sent[0].endpoint,'/$batch');
  assert.equal([...sent[0].data.matchAll(/^Content-Type: multipart\/mixed; boundary=changeset_/gm)].length,3);
  assert.match(sent[0].data,/PATCH https:\/\/crm.invalid\/Demo\/api\/data\/v9.1\/accounts/);
  assert.match(sent[0].data,/If-Match: W\/"10"/);
  assert.ok(sent[0].data.includes('\r\n'));
  assert.equal(result.success,true);
  assert.deepEqual(result.items.map(item => item.status),['succeeded','succeeded','succeeded']);
  assert.equal(result.items[0].id,A);
  assert.equal(result.items[0].httpStatus,201);
  assert.equal(result.committed,null);
});

test('transaction uses exactly one native changeset and confirms commit only after complete success', async () => {
  const f = fixture();
  const result = await f.batch.execute({operations:[create,update]},true);
  assert.equal([...writes(f.calls)[0].data.matchAll(/^Content-Type: multipart\/mixed; boundary=changeset_/gm)].length,1);
  assert.equal(result.transaction,true);
  assert.equal(result.committed,true);
  assert.equal(result.items.length,2);
  assert.equal(writes(f.calls).length,1);
});

test('ordinary known failure preserves earlier success and classifies native stopped tails separately', async () => {
  const f = fixture({request:c => c.endpoint === '/$batch' ? multipart([{id:1,status:201,body:{accountid:A}},failure(2)]) : undefined});
  const error = await failed(f.batch.execute({operations:[create,update,remove]},false));
  assert.equal(error.code,'D365_BATCH_NOT_COMPLETE');
  assert.deepEqual(error.data.items.map(item => item.status),['succeeded','failed','not_executed']);
  assert.equal(error.data.items[0].saved,true);
  assert.equal(error.data.items[1].httpStatus,400);
  assert.equal(error.data.summary.succeeded,1);
  assert.equal(JSON.stringify(error).includes('sensitive-platform-text'),false);
});

test('ordinary chunking preserves global Content-ID correlation and reports progress', async () => {
  const f = fixture(), events = [];
  const result = await f.batch.execute({operations:[create,update,remove],chunk_size:1},false,
    {onProgress:async (progress,total) => events.push([progress,total])});
  assert.equal(writes(f.calls).length,3);
  assert.equal(result.chunksSent,3);
  assert.match(writes(f.calls)[1].data,/Content-ID: 2/);
  assert.match(writes(f.calls)[2].data,/Content-ID: 3/);
  assert.deepEqual(events.slice(0,3),[[1,3],[2,3],[3,3]]);
});

test('known rejection stops future chunks by default and permits explicit continue-on-error', async () => {
  for (const continue_on_error of [false,true]) {
    let batchCount = 0;
    const f = fixture({request:c => {
      if (c.endpoint === '/$batch' && ++batchCount === 1) return multipart([failure(1)]);
      return undefined;
    }});
    const error = await failed(f.batch.execute({operations:[create,update],chunk_size:1,continue_on_error},false));
    assert.equal(writes(f.calls).length,continue_on_error ? 2 : 1);
    assert.equal(error.data.items[1].status,continue_on_error ? 'succeeded' : 'not_sent');
    if (continue_on_error) assert.equal(writes(f.calls)[0].options.headers.Prefer,'odata.continue-on-error');
  }
});

test('transaction rejection reports the entire group uncommitted rather than leaving partial successes', async () => {
  const f = fixture({request:c => c.endpoint === '/$batch' ? multipart([failure(2)]) : undefined});
  const error = await failed(f.batch.execute({operations:[create,update,remove]},true));
  assert.equal(error.data.committed,false);
  assert.deepEqual(error.data.items.map(item => item.status),['not_committed','failed','not_committed']);
  assert.equal(error.data.summary.succeeded,0);
  assert.equal(writes(f.calls).length,1);
});

test('an unlabelled transaction error does not invent which operation failed', async () => {
  const f = fixture({request:c => c.endpoint === '/$batch' ? multipart([failure(null)],{ids:false,nested:false}) : undefined});
  const error = await failed(f.batch.execute({operations:[create,update]},true));
  assert.equal(error.data.committed,false);
  assert.deepEqual(error.data.items.map(item => item.status),['not_committed','not_committed']);
  assert.equal(error.data.issues[0].errors[0].status,400);
});

test('transaction server errors and transport timeouts retain unknown commit and never fall back', async () => {
  for (const mode of ['part500','timeout']) {
    const f = fixture({request:c => {
      if (c.endpoint !== '/$batch') return undefined;
      if (mode === 'part500') return multipart([failure(1,500)]);
      throw new CrmRequestError('D365_REQUEST_TIMEOUT','timeout',{outcome:'unknown'});
    }});
    const error = await failed(f.batch.execute({operations:[create,update]},true));
    assert.equal(error.data.committed,null);
    assert.deepEqual(error.data.items.map(item => item.status),['unknown','unknown']);
    assert.equal(writes(f.calls).length,1);
  }
});

test('unknown ordinary results always stop future chunks even when continue-on-error was requested', async () => {
  const f = fixture({request:c => c.endpoint === '/$batch' ? multipart([failure(1,500)]) : undefined});
  const error = await failed(f.batch.execute({operations:[create,update],chunk_size:1,continue_on_error:true},false));
  assert.deepEqual(error.data.items.map(item => item.status),['unknown','not_sent']);
  assert.equal(writes(f.calls).length,1);
});

test('a response with wrong IDs or mismatched changeset grouping becomes unknown, never a false commit', async () => {
  for (const input of [multipart([{id:99,status:204}],{atomic:true}),
    multipart([{id:1,status:204},{id:1,status:204}],{atomic:true}),
    multipart([{id:1,status:204},{id:2,status:204}])]) {
    const f = fixture({request:c => c.endpoint === '/$batch' ? input : undefined});
    const error = await failed(f.batch.execute({operations:[create,update]},true));
    assert.equal(error.data.committed,null);
    assert.deepEqual(error.data.items.map(item => item.status),['unknown','unknown']);
  }
  const wrongOrdinary = fixture({request:c => c.endpoint === '/$batch' ? multipart([{id:1,status:204},{id:2,status:204}],{atomic:true}) : undefined});
  const error = await failed(wrongOrdinary.batch.execute({operations:[create,update]},false));
  assert.equal(error.data.items.every(item => item.status === 'unknown'),true);
});

test('truncated multipart data and missing continued responses cannot skip unreported operations', async () => {
  for (const input of [multipart([{id:1,status:204}],{close:false}),multipart([failure(1)])]) {
    const f = fixture({request:c => c.endpoint === '/$batch' ? input : undefined});
    const error = await failed(f.batch.execute({operations:[create,update],continue_on_error:true},false));
    assert.equal(error.data.items[1].status,'unknown');
    assert.equal(writes(f.calls).length,1);
  }
});

test('all local validation and metadata/concurrency checks complete before the first batch write', async () => {
  const f = fixture();
  await assert.rejects(f.batch.execute({operations:[create,{operation:'delete',arguments:{collection_name:'accounts',id:'bad'}}]},false));
  assert.equal(f.calls.length,0);
  const unsupported = fixture({concurrency:false});
  const error = await failed(unsupported.batch.execute({operations:[create,update]},false));
  assert.equal(error.code,'D365_BATCH_PREFLIGHT_BLOCKED');
  assert.equal(error.data.chunksSent,0);
  assert.equal(writes(unsupported.calls).length,0);
});

test('batch previews remain read-only and show blocked operations without requesting raw HTTP', async () => {
  const f = fixture({concurrency:false});
  const result = await f.batch.execute({operations:[create,update],dryRun:true},true);
  assert.equal(result.canWrite,false);
  assert.equal(result.operations[1].blockedBy,'D365_RECORD_CONCURRENCY_UNSUPPORTED');
  assert.equal(writes(f.calls).length,0);
  const exists = fixture();
  const createOnly = await exists.batch.execute({operations:[{operation:'upsert',arguments:{collection_name:'accounts',
    alternate_key:{accountnumber:'ABC'},data:{name:'After'},mode:'create_only'}}],dry_run:true},false);
  assert.equal(createOnly.operations[0].blockedBy,'D365_RECORD_ALREADY_EXISTS');
  await assert.rejects(f.batch.execute({operations:[{operation:'http',arguments:{method:'POST',url:'PublishAllXml'}}]},true));
});

test('cancellation between chunks leaves completed outcomes intact and never dispatches remaining chunks', async () => {
  const controller = new AbortController(), f = fixture();
  const error = await failed(f.batch.execute({operations:[create,update,remove],chunk_size:1},false,
    {signal:controller.signal,onProgress:async progress => { if (progress === 1) controller.abort(); }}));
  assert.equal(error.data.cancelled,true);
  assert.deepEqual(error.data.items.map(item => item.status),['succeeded','not_sent','not_sent']);
  assert.equal(writes(f.calls).length,1);
});

test('in-flight cancellation reports the current chunk unknown and later chunks not sent', async () => {
  const controller = new AbortController();
  const f = fixture({request:c => {
    if (c.endpoint === '/$batch') { controller.abort(); throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled',{outcome:'unknown'}); }
    return undefined;
  }});
  const error = await failed(f.batch.execute({operations:[create,update],chunk_size:1},false,{signal:controller.signal}));
  assert.deepEqual(error.data.items.map(item => item.status),['unknown','not_sent']);
  assert.equal(error.data.cancelled,true);
});

test('preflight cancellation sends no write and reports all operations not sent', async () => {
  const controller = new AbortController(); controller.abort();
  const f = fixture();
  const error = await failed(f.batch.execute({operations:[create]},false,{signal:controller.signal}));
  assert.equal(error.data.cancelled,true);
  assert.equal(error.data.chunksSent,0);
  assert.equal(f.calls.length,0);
});

test('failure to deliver progress cannot erase confirmed successful writes', async () => {
  const f = fixture();
  assert.equal((await f.batch.execute({operations:[create]},false,{onProgress:async () => { throw new Error('disconnected progress'); }})).success,true);
});

test('a committed transaction with an untrusted returned ID reports the identity issue without claiming rollback', async () => {
  const f = fixture({request:c => c.endpoint === '/$batch' ? multipart([{id:1,status:201,body:{accountid:A},
    headers:{'OData-EntityId':`https://evil.invalid/api/data/v9.1/accounts(${A})`}}],{atomic:true}) : undefined});
  const error = await failed(f.batch.execute({operations:[create]},true));
  assert.equal(error.data.committed,true);
  assert.equal(error.data.items[0].status,'succeeded_with_issue');
  assert.equal(error.data.items[0].saved,true);
});

test('large later chunks fail wire-size checks before an earlier smaller chunk can be sent', async () => {
  const f = fixture();
  const large = {operation:'create',arguments:{collection_name:'accounts',data:{name:'x'.repeat(10 * 1024 * 1024 - 256)}}};
  await assert.rejects(f.batch.execute({operations:[create,large],chunk_size:1},false),{code:'D365_BATCH_TOO_LARGE'});
  assert.equal(writes(f.calls).length,0);
});

test('aggregate operation payload is bounded even when each separate chunk could fit', async () => {
  const f = fixture();
  const large = {operation:'create',arguments:{collection_name:'accounts',data:{name:'x'.repeat(6 * 1024 * 1024)}}};
  await assert.rejects(f.batch.execute({operations:[large,large],chunk_size:1},false),{code:'D365_RECORD_INVALID'});
  assert.equal(f.calls.length,0);
});

test('batch count/operation limits and transaction options cannot silently enable chunking or nested dry runs', async () => {
  for (const [args,transaction] of [[{operations:[]},false],[{operations:Array(101).fill(create)},false],
    [{operations:[create],chunk_size:0},false],[{operations:[create],chunk_size:1},true],
    [{operations:[{...create,arguments:{...create.arguments,dry_run:true}}]},false]]) {
    const f = fixture();
    await assert.rejects(f.batch.execute(args,transaction));
    assert.equal(writes(f.calls).length,0);
  }
});

test('both batch MCP routes expose previews and use the configured writer', async t => {
  const f = fixture();
  const settings = {AUTH_TYPE:'online',ORG_URL:environment.orgUrl,ENVIRONMENT_URL:environment.orgUrl,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]]));
  t.mock.method(D365AuthService.prototype,'makeRequest',(...args) => f.client.makeRequest(...args));
  t.mock.method(D365AuthService.prototype,'requestWithResponse',(...args) => f.client.requestWithResponse(...args));
  Object.assign(process.env,settings);
  try {
    for (const name of ['execute_record_batch','execute_record_transaction']) {
      assert.equal((await handleToolCall(name,{operations:[create],dry_run:true})).dryRun,true);
    }
    assert.equal(writes(f.calls).length,0);
  } finally {
    for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('Online, NTLM and IFD transmit multipart wire text without JSON quoting through the actual transport', async t => {
  t.mock.method(axios,'post',async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const auth of ['online','op_ad','op_ifd']) {
    CacheService.flushExisting();
    const config = readConfig({AUTH_TYPE:auth,ORG_URL:environment.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
      AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
    const client = new D365AuthService(config), f = fixture();
    client.getAxiosInstance().defaults.adapter = async config => {
      const url = new URL(config.url), endpoint = url.pathname.replace('/Demo/api/data/v9.1','') + url.search;
      const headers = Object.fromEntries(config.headers), method = config.method.toUpperCase();
      const result = endpoint.startsWith('/EntityDefinitions') ? response(await f.client.makeRequest(endpoint),200)
        : await f.client.requestWithResponse(endpoint,method,config.data,{headers});
      return {config,status:result.status,statusText:String(result.status),data:result.data,headers:new AxiosHeaders(result.headers)};
    };
    const batch = new RecordBatchService(new RecordMutationService(client,{...environment,authType:auth}));
    const result = await batch.execute({operations:[create,create]},true);
    assert.equal(result.committed,true);
    const request = writes(f.calls)[0];
    assert.equal(typeof request.data,'string');
    assert.ok(request.data.startsWith('--batch_'));
    assert.match(request.options.headers['Content-Type'],/^multipart\/mixed; boundary=batch_/);
    assert.equal(writes(f.calls).length,1);
  }
});
