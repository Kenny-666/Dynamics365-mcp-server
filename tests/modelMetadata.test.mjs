import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import { ModelMetadataService } from '../src/services/modelMetadata.ts';
import { modelMetadataTools } from '../src/tools/modelMetadataTools.ts';
import { CrmRequestError,toolErrorPayload } from '../src/errors.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { CacheService } from '../src/services/cache.ts';
import { readConfig } from '../src/config.ts';
import { tools,handleToolCall } from '../src/tool_handler.ts';

const id = '11111111-1111-1111-1111-111111111111';
const env = {orgUrl:'https://crm.invalid/Demo',authType:'online',apiVersion:'v9.1'};
const text = value => [{language_code:1033,text:value}];
const nativeLabel = value => ({LocalizedLabels:[{LanguageCode:1033,Label:value},{LanguageCode:2052,Label:'中文'}],UserLocalizedLabel:{LanguageCode:1033,Label:value}});
const table = {MetadataId:id,LogicalName:'new_sample',SchemaName:'new_Sample',DisplayName:nativeLabel('Sample'),
  DisplayCollectionName:nativeLabel('Samples'),Description:nativeLabel('Description'),OwnershipType:'UserOwned',
  IsCustomizable:{Value:true,CanBeChanged:false},CanCreateAttributes:{Value:true},IsRenameable:{Value:true},CanModifyAdditionalSettings:{Value:true},
  IsAuditEnabled:{Value:false},HasNotes:true,IsManaged:false,EntitySetName:'new_samples','@odata.context':'https://crm.invalid/metadata'};
const column = {MetadataId:id,LogicalName:'new_title',SchemaName:'new_Title',AttributeType:'String',AttributeTypeName:{Value:'StringType'},
  '@odata.type':'#Microsoft.Dynamics.CRM.StringAttributeMetadata',IsCustomizable:{Value:true},IsManaged:false,
  DisplayName:nativeLabel('Title'),Description:nativeLabel('Old description'),RequiredLevel:{Value:'None',CanBeChanged:true},
  MaxLength:150,FormatName:{Value:'Text'},IsAuditEnabled:{Value:false},CustomUnknownProperty:'keep-me'};
const columnArgs = {logical_name:'new_sample',schema_name:'new_Title',display_name:text('Title'),type:'String',solution_unique_name:'TestSolution'};
const tableArgs = {schema_name:'new_Sample',display_name:text('Sample'),display_collection_name:text('Samples'),
  primary_name:{schema_name:'new_Name',display_name:text('Name')},solution_unique_name:'TestSolution'};
const updateArgs = {logical_name:'new_sample',attribute_name:'new_title',solution_unique_name:'TestSolution',display_name:text('Changed')};
function fixture(options = {}) {
  const calls = []; let tableMeta = structuredClone(table),fieldMeta = structuredClone(column);
  const client = {
    async requestWithResponse(endpoint,method = 'GET',body,requestOptions = {}) {
      calls.push({endpoint,method,body,options:requestOptions});
      if (requestOptions.signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled',{outcome:'not_sent'});
      const custom = await options.request?.({endpoint,method,body,options:requestOptions,calls});
      if (custom !== undefined) return custom;
      if (method !== 'GET') {
        if (method === 'POST' && endpoint !== '/PublishXml') {
          Object.assign(endpoint.includes('/Attributes') ? fieldMeta : tableMeta,structuredClone(body));
        }
        if (method === 'PUT') {
          const target = endpoint.includes('/Attributes(') ? fieldMeta : tableMeta;
          Object.assign(target,structuredClone(body));
          for (const key of ['DisplayName','DisplayCollectionName','Description']) {
            if (body[key]) target[key].LocalizedLabels = [...body[key].LocalizedLabels,{LanguageCode:2052,Label:'中文'}].filter((row,i,list) => list.findIndex(item => item.LanguageCode === row.LanguageCode) === i);
          }
        }
        return {status:204,data:null,headers:{'odata-entityid':env.orgUrl + '/api/data/v9.1/EntityDefinitions(' + id + ')'}};
      }
      if (endpoint.startsWith('/solutions?')) return {status:200,headers:{},data:{value:[{
        solutionid:id,uniquename:'TestSolution',ismanaged:false,publisherid:{publisherid:id,customizationprefix:'new'},...options.solution}]}};
      if (endpoint.includes('?')) return {status:200,headers:{},data:{value:options.exists ? [{LogicalName:'new_title'}] : []}};
      if (endpoint.startsWith('/EntityDefinitions(')) return {status:200,headers:{},data:structuredClone(endpoint.includes('/Attributes(') ? {...fieldMeta,...options.column} : {...tableMeta,...options.table})};
      throw new Error('Unexpected endpoint ' + endpoint);
    },
    async makeRequest(...args) { return (await client.requestWithResponse(...args)).data; },
  };
  return {client,calls,service:new ModelMetadataService(client,env)};
}
async function failure(promise) {
  try { await promise; assert.fail('Expected failure'); } catch (error) {
    assert.ok(error instanceof CrmRequestError,error.stack); return toolErrorPayload(error);
  }
}
const writes = f => f.calls.filter(call => call.method !== 'GET');

test('complete definition read uses strong consistency, derived cast and a stable fingerprint', async () => {
  const f = fixture(),a = await f.service.get({logicalName:'new_sample',attributeName:'new_title'});
  assert.match(a.definitionHash,/^[a-f0-9]{64}$/);
  assert.equal(a.definition.MaxLength,150);
  assert.equal(a.definition.CustomUnknownProperty,'keep-me');
  assert.equal(a.definition.DisplayName.UserLocalizedLabel,undefined);
  assert.equal(a.definition['@odata.type'],'Microsoft.Dynamics.CRM.StringAttributeMetadata');
  assert.equal(a.publication,'not_determined');
  assert.equal(f.calls.at(-1).endpoint.endsWith('/Microsoft.Dynamics.CRM.StringAttributeMetadata'),true);
  assert.equal(f.calls.every(call => call.options.headers.Consistency === 'Strong'),true);
  assert.equal(a.definitionHash,(await f.service.get({logical_name:'new_sample',attribute_name:'new_title'})).definitionHash);
});

test('table preview includes primary name, ownership, publisher prefix and native solution header without writes', async () => {
  const f = fixture(),result = await f.service.create(tableArgs,'table');
  assert.equal(result.dryRun,true); assert.equal(result.saved,false); assert.equal(result.publication,'not_requested');
  assert.equal(result.request.path,'/EntityDefinitions'); assert.equal(result.request.method,'POST');
  assert.equal(result.request.headers['MSCRM.SolutionUniqueName'],'TestSolution');
  assert.equal(result.request.body.Attributes[0].IsPrimaryName,true);
  assert.equal(result.request.body.Attributes[0].FormatName.Value,'Text');
  assert.equal(result.request.body.HasNotes,false); assert.equal(result.formPlacement,'not_performed');
  assert.equal(writes(f).length,0);
});

for (const [type,extra,expected] of [['String',{max_length:80},{MaxLength:80}],['Memo',{max_length:8000},{Format:'TextArea',MaxLength:8000}],
  ['Integer',{min_value:-10,max_value:100},{MinValue:-10,Format:'None'}],['Decimal',{min_value:0,max_value:100,precision:3},{Precision:3}]]) {
  test(type + ': create uses native derived metadata, saves once and reads back without publication', async () => {
    const f = fixture({column:{AttributeType:type}});
    const result = await f.service.create({...columnArgs,type,...extra,dry_run:false},'column');
    assert.equal(result.saved,true); assert.equal(result.readback.status,'matched');
    const [write] = writes(f); assert.equal(writes(f).length,1); assert.equal(write.method,'POST');
    assert.equal(write.body['@odata.type'],'Microsoft.Dynamics.CRM.' + type + 'AttributeMetadata');
    for (const [key,value] of Object.entries(expected)) assert.equal(write.body[key],value);
    assert.equal(f.calls.some(call => call.endpoint === '/PublishXml'),false);
  });
}

test('table creation reads back the deterministic logical name and retains the confirmed save', async () => {
  const f = fixture(); const result = await f.service.create({...tableArgs,dryRun:false},'table');
  assert.equal(result.saved,true); assert.equal(result.logicalName,'new_sample'); assert.equal(result.readback.metadataId,id);
  assert.equal(writes(f).length,1);
});

test('schema prefix mismatch in table, primary name or column fails without a write', async () => {
  for (const [kind,args] of [['table',{...tableArgs,schema_name:'other_Sample'}],['table',{...tableArgs,primary_name:{...tableArgs.primary_name,schema_name:'other_Name'}}],['column',{...columnArgs,schema_name:'other_Title'}]]) {
    const f = fixture(); assert.equal((await failure(f.service.create({...args,dry_run:false},kind))).code,'D365_MODEL_PREFIX'); assert.equal(writes(f).length,0);
  }
});

test('missing/managed solution or hidden publisher stops creation', async () => {
  for (const solution of [{ismanaged:true},{ismanaged:null},{publisherid:null},{publisherid:{customizationprefix:'bad_prefix'}}]) {
    const f = fixture({solution}); assert.equal((await failure(f.service.create(columnArgs,'column'))).code,'D365_MODEL_SOLUTION'); assert.equal(writes(f).length,0);
  }
  const f = fixture({request:({endpoint}) => endpoint.startsWith('/solutions?') ? {status:200,data:{value:[]}} : undefined});
  assert.equal((await failure(f.service.create(columnArgs,'column'))).code,'D365_MODEL_SOLUTION');
});

test('duplicates and ambiguous/truncated lookups never become metadata upserts', async () => {
  const f = fixture({exists:true}); assert.equal((await failure(f.service.create({...columnArgs,dry_run:false},'column'))).code,'D365_MODEL_EXISTS');
  assert.equal(writes(f).length,0);
  for (const value of [{value:[{},{}]},{value:[],'@odata.nextLink':'https://evil.invalid'},{value:42}]) {
    const bad = fixture({request:({endpoint}) => endpoint.includes('/Attributes?') ? {status:200,data:value} : undefined});
    assert.equal((await failure(bad.service.create(columnArgs,'column'))).code,'D365_MODEL_RESPONSE_INVALID'); assert.equal(writes(bad).length,0);
  }
});

test('parent managed properties must explicitly allow customization and adding columns', async () => {
  for (const table of [{CanCreateAttributes:{Value:false}},{CanCreateAttributes:null},{IsCustomizable:{Value:false}}]) {
    const f = fixture({table}); assert.equal((await failure(f.service.create(columnArgs,'column'))).code,'D365_MODEL_MANAGED_PROPERTY'); assert.equal(writes(f).length,0);
  }
});

test('multilingual label validation rejects duplicates, blank labels and read-only label properties', async () => {
  for (const display_name of [[],[{language_code:0,text:'A'}],text(' '),[...text('A'),...text('B')],
    [{language_code:1033,text:'A',UserLocalizedLabel:'bad'}],text('x'.repeat(101))]) {
    const f = fixture(); assert.equal((await failure(f.service.create({...columnArgs,display_name},'column'))).code,'D365_MODEL_INVALID'); assert.equal(writes(f).length,0);
  }
});

test('column type-specific limits, impossible ranges and unsupported types fail without writes', async () => {
  for (const extra of [{type:'Lookup'},{max_length:4001},{precision:2},{min_value:0},{type:'Memo',max_length:1048577},
    {type:'Integer',min_value:1.5},{type:'Integer',max_value:2147483648},{type:'Integer',precision:2},
    {type:'Decimal',precision:11},{type:'Decimal',min_value:10,max_value:1},{type:'Decimal',max_value:Infinity},
    {required_level:'SystemRequired'},{dry_run:'false'},{logical_name:"account')/../../evil"}]) {
    const f = fixture(); const error = await failure(f.service.create({...columnArgs,...extra,dry_run:extra.dry_run ?? false},'column'));
    assert.match(error.code,/D365_MODEL_(INVALID|UNSUPPORTED)/); assert.equal(writes(f).length,0);
  }
});

test('label preview preserves complete retrieved settings, merges language labels and never writes', async () => {
  const f = fixture(),preview = await f.service.updateLabels(updateArgs);
  assert.equal(preview.dryRun,true); assert.equal(writes(f).length,0);
  assert.equal(preview.request.method,'PUT'); assert.equal(preview.request.headers['MSCRM.MergeLabels'],'true');
  assert.equal(preview.request.body.MaxLength,150); assert.equal(preview.request.body.IsAuditEnabled.Value,false);
  assert.equal(preview.request.body.CustomUnknownProperty,'keep-me');
  assert.equal(preview.request.body.DisplayName.UserLocalizedLabel,undefined);
  assert.equal(preview.changes.DisplayName.before.LocalizedLabels.length,2);
  assert.equal(preview.changes.DisplayName.merge.LocalizedLabels.length,1);
  assert.equal(preview.concurrency,'unprotected_native_put');
});

test('label execution requires a matching preview fingerprint and explicit unprotected PUT acknowledgement', async () => {
  for (const extra of [{},{allow_unprotected_write:true},{expected_hash:'a'.repeat(64),allow_unprotected_write:true}]) {
    const f = fixture(); const error = await failure(f.service.updateLabels({...updateArgs,...extra,dry_run:false}));
    assert.match(error.code,/D365_MODEL_(CONCURRENCY|CONFLICT)/); assert.equal(writes(f).length,0);
  }
  const f = fixture(),preview = await f.service.updateLabels(updateArgs);
  const error = await failure(f.service.updateLabels({...updateArgs,expected_hash:preview.definitionHash,dry_run:false}));
  assert.equal(error.code,'D365_MODEL_CONCURRENCY'); assert.equal(writes(f).length,0);
});

test('label PUT preserves other settings and readback includes unchanged languages', async () => {
  const f = fixture(),preview = await f.service.updateLabels(updateArgs);
  const result = await f.service.updateLabels({...updateArgs,expectedHash:preview.definitionHash,allowUnprotectedWrite:true,dryRun:false});
  assert.equal(result.saved,true); assert.equal(writes(f).length,1); assert.equal(writes(f)[0].method,'PUT');
  const read = await f.service.get({logical_name:'new_sample',attribute_name:'new_title'});
  assert.deepEqual(read.definition.DisplayName.LocalizedLabels,[{LanguageCode:1033,Label:'Changed'},{LanguageCode:2052,Label:'中文'}]);
  assert.equal(read.definition.MaxLength,150);
});

test('table labels honor rename and additional-settings restrictions; attribute labels honor customizability', async () => {
  for (const [options,extra] of [[{table:{IsRenameable:{Value:false}}},{attribute_name:undefined}],
    [{table:{CanModifyAdditionalSettings:{Value:false}}},{attribute_name:undefined,display_name:undefined,description:text('New')}],
    [{column:{IsCustomizable:{Value:false}}},{}]]) {
    const f = fixture(options); assert.equal((await failure(f.service.updateLabels({...updateArgs,...extra}))).code,'D365_MODEL_MANAGED_PROPERTY');
  }
  const f = fixture(),result = await f.service.updateLabels({...updateArgs,attribute_name:undefined,display_collection_name:text('New Samples')});
  assert.equal(result.request.body.HasNotes,true); assert.equal(result.request.body.OwnershipType,'UserOwned');
  assert.equal(result.request.body['@odata.context'],undefined);
});

test('label updates cannot change schema/type, clear all changes, or apply collection labels to columns', async () => {
  for (const extra of [{schema_name:'new_Other'},{type:'Memo'},{display_name:undefined},{display_collection_name:text('Bad')},
    {expected_hash:'bad'},{allow_unprotected_write:'true'},{displayName:text('Conflict')}]) {
    const f = fixture(); assert.equal((await failure(f.service.updateLabels({...updateArgs,...extra}))).code,'D365_MODEL_INVALID'); assert.equal(writes(f).length,0);
  }
});

test('identity mismatch, unsupported derived type and partial definition are rejected', async () => {
  for (const options of [{table:{LogicalName:'wrong'}},{table:{MetadataId:'bad'}},{column:{AttributeType:'Picklist'}},
    {column:{'Options@odata.nextLink':'https://evil.invalid'}},{column:{Nested:{'@odata.nextLink':'https://evil.invalid'}}}]) {
    const f = fixture(options); const error = await failure(f.service.get({logical_name:'new_sample',attribute_name:'new_title'}));
    assert.match(error.code,/D365_MODEL_(RESPONSE_INVALID|UNSUPPORTED)/);
  }
});

test('oversized metadata is refused before a full-definition write', async () => {
  const f = fixture({column:{Huge:'x'.repeat(2 * 1024 * 1024)}});
  assert.equal((await failure(f.service.updateLabels(updateArgs))).code,'D365_MODEL_RESPONSE_INVALID'); assert.equal(writes(f).length,0);
});

test('unknown POST outcome is not retried or automatically published and does not serialize transport secrets', async () => {
  const f = fixture({request:({method}) => {if (method !== 'GET') throw new CrmRequestError('D365_TIMEOUT','password=hidden transport-secret',{outcome:'unknown',status:504});}});
  const error = await failure(f.service.create({...columnArgs,dry_run:false},'column'));
  assert.equal(error.code,'D365_MODEL_WRITE_FAILED'); assert.equal(error.outcome,'unknown'); assert.equal(error.data.saved,null);
  assert.equal(writes(f).length,1); assert.doesNotMatch(JSON.stringify(error),/hidden|transport-secret/);
});

test('rejected write retains false save state and is not retried', async () => {
  const f = fixture({request:({method}) => {if (method !== 'GET') throw new CrmRequestError('D365_HTTP_ERROR','forbidden',{outcome:'rejected',status:403});}});
  const error = await failure(f.service.create({...tableArgs,dry_run:false},'table'));
  assert.equal(error.data.saved,false); assert.equal(error.outcome,'rejected'); assert.equal(writes(f).length,1);
});

test('readback failure after successful save preserves saved=true and never replays creation', async () => {
  const f = fixture({request:({method,endpoint,calls}) => {
    if (method === 'GET' && endpoint.includes('/Attributes(') && calls.some(call => call.method === 'POST')) throw new CrmRequestError('D365_HTTP_ERROR','hidden',{status:403});
  }});
  const error = await failure(f.service.create({...columnArgs,dry_run:false},'column'));
  assert.equal(error.code,'D365_MODEL_READBACK_FAILED'); assert.equal(error.data.saved,true);
  assert.equal(error.data.publication,'not_requested'); assert.equal(writes(f).length,1);
});

test('confirmed save with different native values reports readback mismatch without replay', async () => {
  const f = fixture({column:{MaxLength:99}});
  const error = await failure(f.service.create({...columnArgs,max_length:80,dry_run:false},'column'));
  assert.equal(error.code,'D365_MODEL_READBACK_MISMATCH'); assert.equal(error.data.saved,true);
  assert.deepEqual(error.data.readback.properties,['MaxLength']); assert.equal(writes(f).length,1);
});

test('publish preview exposes whole-table scope and execution sends only one scoped PublishXml', async () => {
  const f = fixture(),preview = await f.service.publish({logical_name:'new_sample'});
  assert.match(preview.scope,/other_pending_columns_forms_views_and_ribbon/); assert.equal(writes(f).length,0);
  assert.equal(preview.request.body.ParameterXml,'<importexportxml><entities><entity>new_sample</entity></entities></importexportxml>');
  const result = await f.service.publish({logicalName:'new_sample',dryRun:false});
  assert.equal(result.publication,'published'); assert.equal(result.modelDrivenUi,'not_verified');
  assert.equal(writes(f).length,1); assert.equal(writes(f)[0].endpoint,'/PublishXml');
});

test('publish rejection and unknown outcomes are distinct and never replay a metadata save', async () => {
  for (const outcome of ['unknown','rejected']) {
    const f = fixture({request:({method}) => {if (method !== 'GET') throw new CrmRequestError('D365_HTTP_ERROR','failure',{outcome,status:outcome === 'unknown' ? 503 : 403});}});
    const error = await failure(f.service.publish({logical_name:'new_sample',dry_run:false}));
    assert.equal(error.code,'D365_MODEL_PUBLISH_FAILED'); assert.equal(error.data.publication,outcome === 'unknown' ? 'unknown' : 'failed');
    assert.equal(writes(f).length,1); assert.equal(writes(f)[0].endpoint,'/PublishXml');
  }
});

test('cancelled preflight sends nothing; cancellation after save retains saved evidence', async () => {
  const controller = new AbortController(); controller.abort(); const f = fixture();
  assert.equal((await failure(f.service.create(columnArgs,'column',controller.signal))).code,'D365_REQUEST_ABORTED'); assert.equal(f.calls.length,0);
  const live = new AbortController();
  const after = fixture({request:({method}) => {if (method === 'POST') live.abort();}});
  const error = await failure(after.service.create({...columnArgs,dry_run:false},'column',live.signal));
  assert.equal(error.data.saved,true); assert.equal(writes(after).length,1);
  assert.equal(after.calls.every(call => call.options.signal === live.signal),true);
});

test('successful metadata writes invalidate existing metadata caches', async () => {
  const cache = CacheService.getInstance(); cache.set('test-model-metadata','old');
  const f = fixture(); await f.service.publish({logical_name:'new_sample',dry_run:false});
  assert.equal(cache.get('test-model-metadata'),undefined);
});

test('five schemas compile, accept nested aliases, reject unknowns and are registered exactly once', () => {
  const ajv = new Ajv({strict:false,useDefaults:true});
  const samples = {get_model_definition:{logicalName:'new_sample'},create_model_table:{...tableArgs,primary_name:{schemaName:'new_Name',displayName:text('Name')}},
    create_model_column:{...columnArgs,dryRun:false},update_model_labels:updateArgs,publish_model_table:{logicalName:'new_sample',dry_run:false}};
  for (const tool of modelMetadataTools) {
    const validate = ajv.compile(tool.inputSchema); assert.equal(validate(samples[tool.name]),true,JSON.stringify(validate.errors));
    assert.equal(validate({unknown:1}),false); assert.equal(tools.filter(item => item.name === tool.name).length,1);
    assert.equal(tool.annotations.readOnlyHint,tool.name === 'get_model_definition');
  }
});

test('all five MCP routes propagate cancellation and use shared native request client', async t => {
  const f = fixture(); const settings = {AUTH_TYPE:'online',ORG_URL:env.orgUrl,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]])); Object.assign(process.env,settings);
  t.mock.method(D365AuthService.prototype,'requestWithResponse',(...a) => f.client.requestWithResponse(...a));
  const controller = new AbortController();
  try {
    for (const [name,args] of Object.entries({get_model_definition:{logical_name:'new_sample'},create_model_table:tableArgs,
      create_model_column:columnArgs,update_model_labels:updateArgs,publish_model_table:{logical_name:'new_sample'}})) {
      const result = await handleToolCall(name,args,{signal:controller.signal}); assert.ok(result.environment);
    }
    assert.equal(f.calls.every(call => call.options.signal === controller.signal),true); assert.equal(writes(f).length,0);
  } finally { for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('Online, NTLM and IFD actual request layer preserves metadata PUT, solution header and MergeLabels', async t => {
  t.mock.method(axios,'post',async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const authType of ['online','op_ad','op_ifd']) {
    CacheService.flushExisting();
    const config = readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
      AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
    const client = new D365AuthService(config),f = fixture();
    client.getAxiosInstance().defaults.adapter = async config => {
      const url = new URL(config.url),endpoint = url.pathname.replace('/Demo/api/data/v9.1','') + url.search;
      const method = config.method.toUpperCase();
      if (method === 'PUT') { assert.equal(config.headers.get('MSCRM.MergeLabels'),'true'); assert.equal(config.headers.get('MSCRM.SolutionUniqueName'),'TestSolution'); }
      const response = await f.client.requestWithResponse(endpoint,method,config.data ? JSON.parse(config.data) : undefined,{headers:config.headers});
      return {config,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};
    };
    const service = new ModelMetadataService(client,{...env,authType}); const preview = await service.updateLabels(updateArgs);
    assert.equal((await service.updateLabels({...updateArgs,dry_run:false,expected_hash:preview.definitionHash,allow_unprotected_write:true})).saved,true);
    assert.equal(writes(f).length,1);
  }
});
