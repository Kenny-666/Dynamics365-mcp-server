import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import { fixture,A,B,C,response,environment,writes } from './recordMutation.fixture.mjs';
import { CrmRequestError,toolErrorPayload } from '../src/errors.ts';
import { RecordService } from '../src/services/record.ts';
import { RecordMutationService } from '../src/services/recordMutation.ts';
import { recordMutationTools } from '../src/tools/recordMutationTools.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { CacheService } from '../src/services/cache.ts';
import { readConfig } from '../src/config.ts';
import { handleToolCall,tools } from '../src/tool_handler.ts';

const create = {collection_name:'accounts',data:{name:'After'}};
const update = {...create,id:A};
const upsert = {collection_name:'accounts',alternate_key:{accountnumber:'ABC'},data:{name:'After'}};
const related = {collection_name:'accounts',id:A,navigation_property:'primarycontactid',related_collection_name:'contacts',related_id:B};

test('create uses native POST, requests only its primary key and recognizes entity/header IDs', async () => {
  for (const format of ['entity','header']) {
    const f = fixture({request:c => c.method === 'POST'
      ? format === 'entity' ? response({accountid:A},201) : response(null,204,{'odata-entityid':environment.orgUrl + `/api/data/v9.1/accounts(${A})`}) : undefined});
    const result = await f.writer.execute('create',create);
    assert.equal(result.id,A);
    assert.equal(result.saved,true);
    assert.equal(result.created,true);
    assert.equal(writes(f.calls)[0].endpoint,'/accounts?$select=accountid');
    assert.equal(writes(f.calls)[0].options.headers.Prefer,'return=representation');
  }
});

test('missing create IDs preserve confirmed save and never trigger another create/readback', async () => {
  const f = fixture({request:c => c.method === 'POST' ? response() : undefined});
  const result = await f.writer.execute('create',create);
  assert.equal(result.saved,true);
  assert.equal(result.id,null);
  assert.equal(result.identityResolved,false);
  assert.equal(result.identityIssue,'D365_RECORD_ID_NOT_RETURNED');
  assert.equal(writes(f.calls).length,1);
  const withId = await f.writer.execute('create',{...create,data:{...create.data,accountid:C}});
  assert.equal(withId.id,C);
});

test('malformed successful write bodies are unknown outcomes, not trusted record objects', async () => {
  for (const body of ['<html>proxy response</html>',[],42]) {
    const f = fixture({request:c => c.method === 'POST' ? response(body,201) : undefined});
    await assert.rejects(f.writer.execute('create',create),error => {
      assert.equal(error.code,'D365_RECORD_RESPONSE_INVALID');
      assert.equal(error.details.outcome,'unknown');
      return true;
    });
    assert.equal(writes(f.calls).length,1);
  }
});

test('untrusted/conflicting create IDs report saved=true instead of returning a wrong identity', async () => {
  for (const reply of [response({accountid:A},201,{'odata-entityid':`https://evil.invalid/api/data/v9.1/accounts(${A})`}),
    response({accountid:A},201,{'odata-entityid':environment.orgUrl + `/api/data/v9.1/accounts(${B})`})]) {
    const f = fixture({request:c => c.method === 'POST' ? reply : undefined});
    await assert.rejects(f.writer.execute('create',create),error => {
      assert.equal(toolErrorPayload(error).data.saved,true);
      assert.equal(error.code,'D365_RECORD_ID_CONFLICT');
      return true;
    });
    assert.equal(writes(f.calls).length,1);
  }
});

test('update and delete carry the current ETag and never upsert a missing GUID', async () => {
  for (const kind of ['update','delete']) {
    const f = fixture();
    const result = await f.writer.execute(kind,kind === 'update' ? update : {collection_name:'accounts',id:A});
    assert.equal(writes(f.calls)[0].options.headers['If-Match'],'W/"10"');
    assert.equal(writes(f.calls)[0].method,kind === 'update' ? 'PATCH' : 'DELETE');
    assert.equal(result.concurrencyProtected,true);
    assert.equal(result.deleted,kind === 'delete');
    const absent = fixture({missing:true});
    await assert.rejects(absent.writer.execute(kind,kind === 'update' ? update : {collection_name:'accounts',id:A}));
    assert.equal(writes(absent.calls).length,0);
  }
});

test('a supplied stale ETag is never silently replaced and blocks before dispatch', async () => {
  const f = fixture();
  await assert.rejects(f.writer.execute('update',{...update,ifMatch:'W/"9"'}),{code:'D365_CONCURRENCY_CONFLICT'});
  assert.equal(writes(f.calls).length,0);
  const preview = await f.writer.execute('update',{...update,if_match:'W/"9"',dry_run:true});
  assert.equal(preview.canWrite,false);
  assert.equal(preview.blockedBy,'D365_CONCURRENCY_CONFLICT');
});

test('unsupported concurrency and missing ETags stop writes unless the precise fallback is explicit', async () => {
  const f = fixture({concurrency:false});
  await assert.rejects(f.writer.execute('update',update),{code:'D365_RECORD_CONCURRENCY_UNSUPPORTED'});
  assert.equal(writes(f.calls).length,0);
  const result = await f.writer.execute('update',{...update,allowUnprotectedWrite:true});
  assert.equal(result.concurrencyProtected,false);
  assert.equal(writes(f.calls)[0].options.headers['If-Match'],'*');
  await assert.rejects(f.writer.execute('update',{...update,allow_unprotected_write:true,if_match:'W/"10"'}),{code:'D365_RECORD_CONCURRENCY_UNSUPPORTED'});
  const noEtag = fixture({etag:null});
  await assert.rejects(noEtag.writer.execute('update',update),{code:'D365_RECORD_ETAG_REQUIRED'});
});

test('previews show environment/differences, redact sensitive fields and perform no write', async () => {
  const f = fixture();
  const result = await f.writer.execute('update',{...update,data:{name:'After',new_secret:'sensitive'},dryRun:true});
  assert.deepEqual(result.environment,environment);
  assert.deepEqual(result.changes.name,{beforeKnown:true,before:'Before',after:'After'});
  assert.equal(result.changes.new_secret.after,'[REDACTED]');
  assert.equal(JSON.stringify(result).includes('sensitive'),false);
  assert.equal(writes(f.calls).length,0);
});

test('save timeout/401/429/412 are not repeated and raw payloads/platform message text are withheld', async () => {
  for (const [status,outcome] of [[500,'unknown'],[401,'rejected'],[429,'rejected'],[412,'rejected']]) {
    const f = fixture({request:c => {
      if (c.method !== 'GET') throw new CrmRequestError('D365_HTTP_ERROR','sensitive-body',{status,outcome});
      return undefined;
    }});
    await assert.rejects(f.writer.execute('update',update),error => {
      assert.equal(error.details.status,status);
      assert.equal(toolErrorPayload(error).data.saved,outcome === 'unknown' ? 'unknown' : false);
      assert.equal(JSON.stringify(toolErrorPayload(error)).includes('sensitive-body'),false);
      return true;
    });
    assert.equal(writes(f.calls).length,1);
  }
});

test('an untyped transport failure after dispatch remains unknown, including deletion outcome', async () => {
  const f = fixture({request:c => {
    if (c.method === 'DELETE') throw new Error('untyped transport failure');
    return undefined;
  }});
  await assert.rejects(f.writer.execute('delete',{collection_name:'accounts',id:A}),error => {
    const payload = toolErrorPayload(error);
    assert.equal(payload.outcome,'unknown');
    assert.equal(payload.data.deleted,'unknown');
    return true;
  });
  assert.equal(writes(f.calls).length,1);
});

test('upsert validates one active alternate key and chooses a guarded update for an existing row', async () => {
  const f = fixture();
  const result = await f.writer.execute('upsert',upsert);
  assert.equal(result.created,false);
  assert.equal(writes(f.calls)[0].method,'PATCH');
  assert.match(writes(f.calls)[0].endpoint,/accounts\(accountnumber='ABC'\)/);
  assert.equal(writes(f.calls)[0].options.headers['If-Match'],'W/"10"');
  assert.ok(f.calls.some(c => c.endpoint.includes('/Keys?')));
});

test('absent upsert uses native conditional creation and never overwrites a concurrent create', async () => {
  const f = fixture({missing:true,request:c => c.method === 'PATCH' ? response(null,204,{
    'odata-entityid':environment.orgUrl + `/api/data/v9.1/accounts(${A})`}) : undefined});
  const result = await f.writer.execute('upsert',upsert);
  assert.equal(result.created,true);
  assert.equal(result.id,A);
  assert.equal(writes(f.calls)[0].options.headers['If-None-Match'],'*');
  const race = fixture({missing:true,request:c => {
    if (c.method === 'PATCH') throw new CrmRequestError('D365_CONCURRENCY_CONFLICT','race',{status:412,outcome:'rejected'});
    return undefined;
  }});
  await assert.rejects(race.writer.execute('upsert',upsert),{code:'D365_CONCURRENCY_CONFLICT'});
  assert.equal(writes(race.calls).length,1);
});

test('create_only and update_only keep their native existence semantics', async () => {
  const existing = fixture();
  const result = await existing.writer.execute('upsert',{...upsert,mode:'create_only',dry_run:true});
  assert.equal(result.canWrite,false);
  assert.equal(result.blockedBy,'D365_RECORD_ALREADY_EXISTS');
  assert.equal(writes(existing.calls).length,0);
  const absent = fixture({missing:true});
  await assert.rejects(absent.writer.execute('upsert',{...upsert,mode:'update_only'}));
  assert.equal(writes(absent.calls).length,0);
});

test('alternate-key strings escape apostrophes and URL delimiters without query injection', async () => {
  const f = fixture();
  await f.writer.execute('upsert',{...upsert,alternate_key:{accountnumber:"O'Brien = Ltd"}});
  const endpoint = writes(f.calls)[0].endpoint;
  assert.match(endpoint,/O''Brien%20%3D%20Ltd/);
  assert.equal(endpoint.includes('&'),false);
  assert.equal(endpoint.includes('#'),false);
});

test('typed integer/decimal/lookup/datetime alternate keys use native literals, not quoted numeric strings', async () => {
  for (const [type,value,expected] of [['Integer',42,'accountnumber=42'],['Picklist',2,'accountnumber=2'],
    ['Decimal','123.4500','accountnumber=123.4500'],['Lookup',B,'_accountnumber_value=' + B],
    ['DateTime','2026-10-26T01:02:03Z','accountnumber=2026-10-26T01%3A02%3A03.000Z']]) {
    const f = fixture({keyType:type});
    await f.writer.execute('upsert',{...upsert,alternate_key:{accountnumber:value}});
    assert.ok(writes(f.calls)[0].endpoint.includes(expected),writes(f.calls)[0].endpoint);
  }
});

test('unsafe large decimal numbers cannot silently round to the wrong alternate-key record', async () => {
  const f = fixture({keyType:'Decimal'});
  await assert.rejects(f.writer.execute('upsert',{...upsert,alternate_key:{accountnumber:Number.MAX_SAFE_INTEGER + 1}}));
  assert.equal(writes(f.calls).length,0);
  await f.writer.execute('upsert',{...upsert,alternate_key:{accountnumber:'9007199254740993.00'}});
  assert.match(writes(f.calls)[0].endpoint,/9007199254740993\.00/);
});

test('pending/undeclared/null/reserved or invalid calendar key values fail before any write', async () => {
  for (const options of [{keyStatus:'Pending'},{keyFields:['other']}]) {
    const f = fixture(options);
    await assert.rejects(f.writer.execute('upsert',upsert));
    assert.equal(writes(f.calls).length,0);
  }
  for (const value of [null,'a/b','a%2Fb','a+b','a&b','a#b','',Infinity]) {
    const f = fixture();
    await assert.rejects(f.writer.execute('upsert',{...upsert,alternate_key:{accountnumber:value}}));
    assert.equal(writes(f.calls).length,0);
  }
  const invalidDate = fixture({keyType:'DateTime'});
  await assert.rejects(invalidDate.writer.execute('upsert',{...upsert,alternate_key:{accountnumber:'2026-02-31T00:00:00Z'}}));
  assert.equal(writes(invalidDate.calls).length,0);
});

test('upsert rejects key changes and primary-key injection in its body', async () => {
  for (const data of [{accountnumber:'different'},{accountid:B},{newlookup:'x'}]) {
    if (Object.hasOwn(data,'newlookup')) continue;
    const f = fixture();
    await assert.rejects(f.writer.execute('upsert',{...upsert,data}));
    assert.equal(writes(f.calls).length,0);
  }
  const same = fixture();
  await same.writer.execute('upsert',{...upsert,data:{name:'After',accountnumber:'ABC'}});
  assert.deepEqual(writes(same.calls)[0].data,{name:'After'});
});

test('single-valued association uses one conditional lookup PATCH and validates the target collection', async () => {
  const f = fixture();
  const result = await f.writer.execute('associate',related);
  assert.equal(result.concurrencyProtected,true);
  assert.deepEqual(writes(f.calls)[0].data,{'primarycontactid@odata.bind':`/contacts(${B})`});
  assert.equal(writes(f.calls)[0].options.headers['If-Match'],'W/"10"');
  const wrong = fixture();
  await assert.rejects(wrong.writer.execute('associate',{...related,related_collection_name:'accounts'}));
  assert.equal(writes(wrong.calls).length,0);
});

test('CRM 9.1 disassociation deletes the navigation reference',async()=>{
  const f=fixture({request:call=>{
    if(call.method!=='DELETE')return undefined;
    assert.equal(call.endpoint,`/accounts(${A})/primarycontactid/$ref`);
    assert.equal(call.data,undefined);assert.equal(call.options.headers['If-Match'],undefined);return response();
  }});
  const result=await f.writer.execute('disassociate',related);assert.equal(result.saved,true);assert.equal(result.concurrencyProtected,false);assert.equal(writes(f.calls).length,1);
});

test('single-valued disassociation requires the expected current target and never deletes a related record', async () => {
  const f = fixture();
  await f.writer.execute('disassociate',related);
  assert.equal(writes(f.calls)[0].method,'DELETE');
  assert.equal(writes(f.calls)[0].endpoint,`/accounts(${A})/primarycontactid/$ref`);
  assert.equal(writes(f.calls)[0].data,undefined);
  const changed = fixture({lookupId:C});
  await assert.rejects(changed.writer.execute('disassociate',related),{code:'D365_RELATIONSHIP_TARGET_MISMATCH'});
  assert.equal(writes(changed.calls).length,0);
  const conditional = fixture();
  await assert.rejects(conditional.writer.execute('disassociate',{...related,if_match:'W/"10"'}),{code:'D365_RELATIONSHIP_CONCURRENCY_UNSUPPORTED'});
  assert.equal(writes(conditional.calls).length,0);
});

test('a successful write that does not clear a lookup fails readback without automatic replay',async()=>{
  const f=fixture({ignoreLookupClear:true});
  await assert.rejects(f.writer.execute('disassociate',related),error=>error.code==='D365_RELATIONSHIP_READBACK_MISMATCH'&&error.data.saved===true&&error.data.status===204&&error.data.relationshipVerified===false&&error.details.retryable===false);
  assert.equal(writes(f.calls).length,1);assert.equal(writes(f.calls)[0].method,'DELETE');
});

test('lookup clear readback errors retain confirmed write evidence',async()=>{
  const f=fixture({request:(call,calls)=>{if(call.method==='GET'&&calls.some(c=>c.method==='DELETE'))throw new CrmRequestError('D365_HTTP_ERROR','readback denied',{status:403});}});
  await assert.rejects(f.writer.execute('disassociate',related),error=>error.code==='D365_RELATIONSHIP_READBACK_FAILED'&&error.data.saved===true&&error.data.relationshipVerified===false&&error.details.status===403);
  assert.equal(writes(f.calls).length,1);
});

test('disassociation checks the specific navigation target, not just a polymorphic lookup GUID', async () => {
  const f = fixture({lookupId:B,navigationTarget:null});
  await assert.rejects(f.writer.execute('disassociate',related),{code:'D365_RELATIONSHIP_TARGET_MISMATCH'});
  assert.equal(writes(f.calls).length,0);
  const read = f.calls.find(call => call.method === 'GET' && call.endpoint.startsWith('/accounts('));
  assert.ok(new URL(read.endpoint,'https://crm.invalid').searchParams.get('$expand').includes('primarycontactid'));
});

test('collection membership requires explicit unprotected mode; parent ETags are never claimed as membership protection', async () => {
  const f = fixture();
  const args = {...related,navigation_property:'new_accounts_contacts'};
  await assert.rejects(f.writer.execute('associate',args),{code:'D365_RELATIONSHIP_CONCURRENCY_UNSUPPORTED'});
  assert.equal(writes(f.calls).length,0);
  const result = await f.writer.execute('associate',{...args,allow_unprotected_write:true});
  assert.equal(result.concurrencyProtected,false);
  assert.equal(writes(f.calls)[0].endpoint,`/accounts(${A})/new_accounts_contacts/$ref`);
  assert.equal(writes(f.calls)[0].data['@odata.id'],environment.orgUrl + `/api/data/v9.1/contacts(${B})`);
  await f.writer.execute('disassociate',{...args,allow_unprotected_write:true});
  assert.equal(writes(f.calls)[1].endpoint,`/accounts(${A})/new_accounts_contacts(${B})/$ref`);
  await assert.rejects(f.writer.execute('associate',{...args,allow_unprotected_write:true,if_match:'W/"10"'}));
});

test('nested OData references cannot escape the configured organization before any write', async () => {
  for (const value of ['https://evil.invalid/api/data/v9.1/contacts(' + B + ')','//evil.invalid/x','../outside','$1','/%241']) {
    const f = fixture();
    await assert.rejects(f.writer.execute('create',{...create,data:{'primarycontactid@odata.bind':value}}));
    assert.equal(writes(f.calls).length,0);
  }
});

test('invalid local parameters, aliases, unsupported table types and non-JSON data never dispatch writes', async () => {
  for (const args of [null,[],{...update,collection_name:'accounts/PublishAllXml'},{...update,id:'bad'},
    {...update,collectionName:'contacts'},{...update,if_match:'*'},{...update,dry_run:'false'},
    {...update,data:[]},{...update,data:{}},{...update,data:{number:NaN}},{...update,unknown:true}]) {
    const f = fixture();
    await assert.rejects(f.writer.execute('update',args));
    assert.equal(writes(f.calls).length,0);
  }
  const elastic = fixture({tableType:'Elastic'});
  await assert.rejects(elastic.writer.execute('create',create));
  assert.equal(writes(elastic.calls).length,0);
});

test('read-by-ID validation and RecordService write facade cannot retain the old unsafe write path', async () => {
  const f = fixture();
  const service = new RecordService(f.client,f.writer);
  await service.createNewRecord('accounts',{name:'After'});
  await service.updateExistingRecord('accounts',A,{name:'After'});
  await service.deleteRecordById('accounts',A);
  assert.equal(writes(f.calls).length,3);
  await assert.rejects(service.getRecordById('accounts',A,'name&$filter=1'));
  await assert.rejects(service.getRecordById('accounts','bad'));
  await assert.rejects(new RecordService(f.client).createNewRecord('accounts',{name:'x'}),{code:'D365_RECORD_WRITER_REQUIRED'});
});

test('all mutation schemas accept old names and canonical forms without duplicate registrations', () => {
  const ajv = new Ajv({strict:false,useDefaults:true});
  for (const tool of recordMutationTools) {
    const validate = ajv.compile(tool.inputSchema);
    const args = tool.name === 'create_new_record' ? create : tool.name === 'update_existing_record' ? update
      : tool.name === 'delete_record_by_id' ? {collectionName:'accounts',id:A}
        : tool.name === 'upsert_record_by_key' ? upsert
          : tool.name.includes('associate_records') ? related : {operations:[{operation:'create',arguments:create}]};
    assert.equal(validate(args),true,JSON.stringify(validate.errors));
    assert.equal(validate({}),false);
    assert.equal(tools.filter(t => t.name === tool.name).length,1);
  }
});

test('all single-record MCP mutation routes use the shared typed client and propagate cancellation', async t => {
  const f = fixture();
  const settings = {AUTH_TYPE:'online',ORG_URL:'https://crm.invalid',ENVIRONMENT_URL:'https://crm.invalid',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]]));
  t.mock.method(D365AuthService.prototype,'makeRequest',(...args) => args[0].startsWith('/accounts(') ? Promise.resolve({accountid:A}) : f.client.makeRequest(...args));
  t.mock.method(D365AuthService.prototype,'requestWithResponse',(...args) => f.client.requestWithResponse(...args));
  Object.assign(process.env,settings);
  try {
    assert.deepEqual(await handleToolCall('get_record_by_id',{collectionName:'accounts',id:A}),{accountid:A});
    await assert.rejects(handleToolCall('get_record_by_id',{collection_name:'accounts',collectionName:'contacts',id:A}));
    for (const [name,args] of [['create_new_record',create],['update_existing_record',update],
      ['delete_record_by_id',{collection_name:'accounts',id:A}],['upsert_record_by_key',upsert],
      ['associate_records',related],['disassociate_records',related]]) {
      assert.equal((await handleToolCall(name,{...args,dry_run:true})).dryRun,true);
    }
    const controller = new AbortController(); controller.abort();
    await assert.rejects(handleToolCall('create_new_record',create,{signal:controller.signal}),{code:'D365_REQUEST_ABORTED'});
    assert.equal(writes(f.calls).length,0);
  } finally {
    for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('Online, NTLM and IFD preserve native record payload/If-Match through the actual request layer', async t => {
  t.mock.method(axios,'post',async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const auth of ['online','op_ad','op_ifd']) {
    CacheService.flushExisting();
    const config = readConfig({AUTH_TYPE:auth,ORG_URL:environment.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
      AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
    const client = new D365AuthService(config), f = fixture();
    client.getAxiosInstance().defaults.adapter = async config => {
      const url = new URL(config.url), endpoint = url.pathname.replace('/Demo/api/data/v9.1','') + url.search;
      const method = config.method.toUpperCase();
      const headers = Object.fromEntries(config.headers);
      const result = endpoint.startsWith('/EntityDefinitions') ? response(await f.client.makeRequest(endpoint),200)
        : await f.client.requestWithResponse(endpoint,method,config.data ? JSON.parse(config.data) : undefined,{headers});
      return {config,status:result.status,statusText:String(result.status),data:result.data,headers:new AxiosHeaders(result.headers)};
    };
    const writer = new RecordMutationService(client,{...environment,authType:auth});
    const result = await writer.execute('update',update);
    assert.equal(result.concurrencyProtected,true);
    assert.equal(writes(f.calls)[0].options.headers['If-Match'],'W/"10"');
    assert.deepEqual(writes(f.calls)[0].data,{name:'After'});
  }
});
