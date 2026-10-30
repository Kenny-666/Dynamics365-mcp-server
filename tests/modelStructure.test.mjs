import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import { fixture,one,many,key,id,jobId,env,isMutation,nativeKey,nativeRelation,text } from './modelStructure.fixture.mjs';
import { ModelStructureService } from '../src/services/modelStructure.ts';
import { modelStructureTools } from '../src/tools/modelStructureTools.ts';
import { tools,handleToolCall } from '../src/tool_handler.ts';
import { CrmRequestError,toolErrorPayload } from '../src/errors.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { CacheService } from '../src/services/cache.ts';
import { readConfig } from '../src/config.ts';

const writes = f => f.calls.filter(isMutation);
async function failure(promise) {
  try { await promise; assert.fail('Expected an error'); } catch (error) { assert.ok(error instanceof CrmRequestError,error.stack); return toolErrorPayload(error); }
}

test('1:N preview uses native read-only eligibility actions, deep Lookup and non-cascading defaults', async () => {
  const f = fixture(),result = await f.service.createRelationship(one);
  assert.equal(result.dryRun,true); assert.equal(result.saved,false); assert.equal(writes(f).length,0);
  assert.deepEqual(result.eligibility.map(row => row.action),['CanBeReferenced','CanBeReferencing']);
  assert.equal(result.request.body.ReferencedAttribute,'accountid'); assert.equal(result.request.body.Lookup.SchemaName,'new_AccountId');
  assert.equal(result.request.body.Lookup['@odata.type'],'Microsoft.Dynamics.CRM.LookupAttributeMetadata');
  assert.equal(result.request.body.CascadeConfiguration.Delete,'Restrict'); assert.equal(result.request.body.CascadeConfiguration.Assign,'NoCascade');
  assert.equal(result.request.headers['MSCRM.SolutionUniqueName'],'TestSolution'); assert.equal(result.publication,'not_requested');
});

test('1:N native creation saves once and independently verifies Lookup identity, type, target and labels', async () => {
  const f = fixture(),result = await f.service.createRelationship({...one,dry_run:false});
  assert.equal(result.saved,true); assert.equal(result.readback.status,'matched'); assert.equal(result.readback.lookup.status,'matched');
  assert.equal(result.readback.lookup.logicalName,'new_accountid'); assert.equal(writes(f).length,1);
  assert.equal(f.calls.some(call => call.endpoint.endsWith('/Microsoft.Dynamics.CRM.LookupAttributeMetadata')),true);
  assert.equal(f.calls.some(call => call.endpoint === '/PublishXml'),false);
});

test('explicit cascade behavior remains visible in preview and native save', async () => {
  const f = fixture(),result = await f.service.createRelationship({...one,cascade:{delete:'Cascade',assign:'Cascade',share:'Cascade'},dry_run:false});
  assert.equal(result.saved,true); const body = writes(f)[0].body;
  assert.equal(body.CascadeConfiguration.Delete,'Cascade'); assert.equal(body.CascadeConfiguration.Assign,'Cascade'); assert.equal(body.CascadeConfiguration.Unshare,'NoCascade');
});

test('CRM 9.1 merge cascade normalization does not misreport a saved relationship', async () => {
  const f = fixture({relationship:{CascadeConfiguration:{Assign:'NoCascade',Delete:'Restrict',Merge:'Cascade',Reparent:'NoCascade',Share:'NoCascade',Unshare:'NoCascade'}}});
  const result = await f.service.createRelationship({...one,dry_run:false});
  assert.equal(result.saved,true); assert.equal(result.readback.status,'matched');
});

test('N:N creates intersect and both native menu definitions after each participation check', async () => {
  const f = fixture(),result = await f.service.createRelationship({...many,dryRun:false,intersectEntityName:'new_CustomLink'});
  assert.equal(result.saved,true); assert.equal(writes(f).length,1);
  assert.deepEqual(result.eligibility.map(row => row.table),['account','contact']);
  const body = writes(f)[0].body; assert.equal(body['@odata.type'],'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata');
  assert.equal(body.IntersectEntityName,'new_customlink'); assert.equal(body.Entity1AssociatedMenuConfiguration.Behavior,'UseCollectionName');
  assert.equal(result.readback.lookup,undefined);
});

test('self-referential 1:N is allowed when eligible; N:N self-reference stops without custom navigation support', async () => {
  const f = fixture(); assert.equal((await f.service.createRelationship({...one,referencing_entity:'account',dry_run:false})).saved,true);
  const bad = fixture(); assert.equal((await failure(bad.service.createRelationship({...many,entity_2:'account'}))).code,'D365_MODEL_UNSUPPORTED'); assert.equal(writes(bad).length,0);
});

test('native relationship read casts explicit type and detects missing, ambiguous or mismatched definitions', async () => {
  const f = fixture({existingRelation:true}); const read = await f.service.getRelationship({schemaName:'new_account_sample'});
  assert.equal(read.definition.MetadataId,id); assert.equal(read.publication,'not_determined'); assert.equal(writes(f).length,0);
  assert.equal((await failure(fixture().service.getRelationship({schema_name:'new_account_sample'}))).code,'D365_MODEL_NOT_FOUND');
  for (const relationship of [{SchemaName:'wrong'},{RelationshipType:'unknown'},{MetadataId:jobId}]) {
    const bad = fixture({existingRelation:true,relationship}); assert.equal((await failure(bad.service.getRelationship({schema_name:'new_account_sample'}))).code,'D365_MODEL_RESPONSE_INVALID');
  }
});

test('existing relationship, Lookup or intersect name prevents creation rather than updating another component', async () => {
  for (const [options,args] of [[{existingRelation:true},one],[{lookupExists:true},one],[{intersectExists:true},many]]) {
    const f = fixture(options); assert.equal((await failure(f.service.createRelationship({...args,dry_run:false}))).code,'D365_MODEL_EXISTS'); assert.equal(writes(f).length,0);
  }
});

test('false/unknown managed participation settings stop relationships before schema mutation', async () => {
  for (const [table,args] of [[{IsCustomizable:{Value:false}},one],[{CanCreateAttributes:{Value:false}},one],
    [{CanBePrimaryEntityInRelationship:null},one],[{CanBeRelatedEntityInRelationship:{Value:false}},one],[{CanBeInManyToMany:{Value:false}},many]]) {
    const f = fixture({table}); assert.equal((await failure(f.service.createRelationship(args))).code,'D365_MODEL_MANAGED_PROPERTY'); assert.equal(writes(f).length,0);
  }
});

test('native eligibility false, missing response, forbidden and unsupported are not bypassed', async () => {
  const denied = fixture({eligible:false}); assert.equal((await failure(denied.service.createRelationship(one))).code,'D365_MODEL_RELATIONSHIP_INELIGIBLE');
  const missing = fixture({request:({endpoint}) => endpoint === '/CanBeReferenced' ? {status:200,data:{}} : undefined});
  assert.equal((await failure(missing.service.createRelationship(one))).code,'D365_MODEL_RESPONSE_INVALID');
  for (const status of [403,404]) {
    const f = fixture({request:({endpoint}) => {if (endpoint.startsWith('/Can')) throw new CrmRequestError('D365_HTTP_ERROR','hidden-secret',{status,outcome:'rejected'});}});
    const error = await failure(f.service.createRelationship({...one,dry_run:false}));
    assert.equal(error.code,'D365_MODEL_ELIGIBILITY_UNAVAILABLE'); assert.equal(error.outcome,'not_sent'); assert.equal(error.data.issue.status,status);
    assert.equal(writes(f).length,0); assert.doesNotMatch(JSON.stringify(error),/hidden-secret/);
  }
});

test('strict relationship arguments reject wrong-kind properties, prefix conflicts and unsupported cascading', async () => {
  for (const args of [{...one,entity1:'contact'},{...many,lookup:one.lookup},{...one,lookup:undefined},{...one,type:'bad'},
    {...one,schema_name:'other_Link'},{...one,lookup:{...one.lookup,schema_name:'other_Lookup'}},{...many,intersect_entity_name:'other_link'},
    {...one,cascade:{delete:'NoCascade'}},{...one,cascade:{assign:'Restrict'}},{...one,cascade:{unknown:'Cascade'}},
    {...one,referencedEntity:'contact'},{...one,lookup:{...one.lookup,required_level:'SystemRequired'}},{...one,unknown:1}]) {
    const f = fixture(); assert.match((await failure(f.service.createRelationship(args))).code,/D365_MODEL_(INVALID|PREFIX)/); assert.equal(writes(f).length,0);
  }
});

test('post-save relationship/Lookup mismatches retain saved=true with no automatic replay', async () => {
  for (const options of [{relationship:{ReferencedEntity:'contact'}},{column:{Targets:['contact']}},{column:{LogicalName:'wrong'}},
    {column:{AttributeType:'String'}},{column:{DisplayName:{LocalizedLabels:[]}}},{relationship:{ReferencingAttribute:'wrong'}}]) {
    const f = fixture(options),error = await failure(f.service.createRelationship({...one,dry_run:false}));
    assert.equal(error.data.saved,true); assert.match(error.code,/D365_MODEL_READBACK_(FAILED|MISMATCH)/); assert.equal(writes(f).length,1);
  }
});

test('creation readback failure preserves save and cancellation after mutation is not a failed save', async () => {
  const controller = new AbortController();
  const f = fixture({request:call => {if (isMutation(call)) controller.abort();}});
  const error = await failure(f.service.createRelationship({...one,dry_run:false},controller.signal));
  assert.equal(error.data.saved,true); assert.equal(error.code,'D365_MODEL_READBACK_FAILED'); assert.equal(writes(f).length,1);
});

test('key preview validates fields without scanning records or starting an index', async () => {
  const f = fixture(),result = await f.service.createKey(key);
  assert.equal(result.dryRun,true); assert.equal(result.saved,false); assert.equal(writes(f).length,0);
  assert.equal(result.request.path,"/EntityDefinitions(LogicalName='new_sample')/Keys");
  assert.equal(result.request.body['@odata.type'],'Microsoft.Dynamics.CRM.EntityKeyMetadata');
  assert.deepEqual(result.request.body.KeyAttributes,['new_reference']); assert.equal(result.index.usableForAlternateKeyOperations,false);
  assert.equal(result.existingDataUniqueness,'not_scanned'); assert.equal(result.indexSizeValidation,'platform');
  assert.equal(f.calls.every(call => call.method === 'GET'),true);
});

for (const type of ['String','Integer','Decimal','DateTime','Lookup','Picklist']) {
  test(type + ' alternate-key column is supported and native Pending is not usable', async () => {
    const f = fixture({column:{AttributeType:type}}),result = await f.service.createKey({...key,dry_run:false});
    assert.equal(result.saved,true); assert.equal(result.readback.status,'matched'); assert.equal(result.index.status,'Pending');
    assert.equal(result.index.usableForAlternateKeyOperations,false); assert.equal(result.index.asyncJobId,jobId);
    assert.equal(writes(f).length,1); assert.equal(f.calls.some(call => call.endpoint === '/PublishXml'),false);
  });
}

test('composite key detects identical field sets regardless of ordering, including failed indexes', async () => {
  const existing = {...nativeKey,KeyAttributes:['new_a','new_b'],EntityKeyIndexStatus:'Failed'};
  const f = fixture({keys:[existing]}); const error = await failure(f.service.createKey({...key,schema_name:'new_OtherKey',key_attributes:['new_b','new_a'],dry_run:false}));
  assert.equal(error.code,'D365_MODEL_EXISTS'); assert.equal(writes(f).length,0);
});

test('ten native keys, unsupported types, field security and virtual tables stop key creation', async () => {
  const keys = Array.from({length:10},(_,i) => ({...nativeKey,MetadataId:`${String(i).padStart(8,'0')}-1111-1111-1111-111111111111`,SchemaName:'new_key' + i,KeyAttributes:['new_field' + i]}));
  for (const [options,code] of [[{keys},'KEY_LIMIT'],[{column:{AttributeType:'Memo'}},'UNSUPPORTED'],[{column:{AttributeType:'Money'}},'UNSUPPORTED'],
    [{column:{IsSecured:true}},'KEY_FIELD_SECURITY'],[{column:{IsSecured:null}},'KEY_FIELD_SECURITY'],[{table:{DataProviderId:jobId}},'UNSUPPORTED'],
    [{table:{IsCustomizable:{Value:false}}},'MANAGED_PROPERTY']]) {
    const f = fixture(options); assert.equal((await failure(f.service.createKey({...key,dry_run:false}))).code,'D365_MODEL_' + code); assert.equal(writes(f).length,0);
  }
});

test('invalid key fields, aliases, labels and schema names fail before mutation', async () => {
  for (const extra of [{key_attributes:[]},{key_attributes:Array(17).fill('new_a')},{key_attributes:['new_a','NEW_A']},
    {key_attributes:['bad/path']},{key_attributes:[null]},{schema_name:'other_key'},{display_name:[]},{keyAttributes:['other']},{dry_run:'false'},{unknown:1}]) {
    const f = fixture(); assert.match((await failure(f.service.createKey({...key,...extra}))).code,/D365_MODEL_(INVALID|PREFIX)/); assert.equal(writes(f).length,0);
  }
});

test('partial, malformed or duplicate native key collections do not become empty/no-duplicate evidence', async () => {
  const values = [{value:[],'@odata.nextLink':'https://evil.invalid'},{value:[null]},{value:[nativeKey,nativeKey]},
    {value:[{...nativeKey,KeyAttributes:['new_a','new_a']}]},{value:[{...nativeKey,EntityLogicalName:'wrong'}]},
    {value:[{...nativeKey,MetadataId:'bad'}]},{value:42}];
  for (const data of values) {
    const f = fixture({request:({endpoint}) => endpoint.endsWith('/Keys') ? {status:200,data} : undefined});
    assert.match((await failure(f.service.createKey(key))).code,/D365_MODEL_(RESPONSE_INVALID|INVALID)/); assert.equal(writes(f).length,0);
  }
});

test('native enum/numeric states distinguish pending, in-progress, active, failed and unknown', async () => {
  for (const [raw,status,ready] of [[0,'Pending',false],[1,'InProgress',false],[2,'Active',true],[3,'Failed',false],
    ['Pending','Pending',false],['InProgress','InProgress',false],['Active','Active',true],['Failed','Failed',false],['FutureState','Unknown',false],[undefined,'Unknown',false]]) {
    const f = fixture({keys:[{...nativeKey,EntityKeyIndexStatus:raw}]});
    const result = await f.service.getKey({logicalName:'new_sample',schemaName:'new_ReferenceKey'});
    assert.equal(result.index.status,status); assert.equal(result.index.usableForAlternateKeyOperations,ready); assert.equal(writes(f).length,0);
  }
});

test('failed index after successful native creation is an MCP error retaining the saved key and job link', async () => {
  const f = fixture({indexState:'Failed'}),error = await failure(f.service.createKey({...key,dry_run:false}));
  assert.equal(error.code,'D365_MODEL_KEY_INDEX_FAILED'); assert.equal(error.data.saved,true); assert.equal(error.data.index.status,'Failed');
  assert.equal(error.data.index.asyncJobId,jobId); assert.equal(writes(f).length,1);
});

test('native Active readback is usable; unknown state never fabricates activation', async () => {
  for (const [indexState,ready] of [['Active',true],['future',false]]) {
    const f = fixture({indexState}),result = await f.service.createKey({...key,dry_run:false});
    assert.equal(result.saved,true); assert.equal(result.index.usableForAlternateKeyOperations,ready);
  }
});

test('key readback detects missing definition, changed column set, missing labels and invalid job IDs', async () => {
  for (const override of [{value:[]},{value:[{...nativeKey,KeyAttributes:['new_other']}]},{value:[{...nativeKey,DisplayName:null}]},
    {value:[{...nativeKey,AsyncJob:'invalid'}]}]) {
    const f = fixture({request:({endpoint,method,calls}) => endpoint.endsWith('/Keys') && method === 'GET' && calls.some(isMutation) ? {status:200,data:override} : undefined});
    const error = await failure(f.service.createKey({...key,dry_run:false}));
    assert.equal(error.data.saved,true); assert.match(error.code,/D365_MODEL_READBACK_(FAILED|MISMATCH)/); assert.equal(writes(f).length,1);
  }
});

test('job projection is opt-in, excludes text/data, and preserves key evidence when permission differs', async () => {
  const f = fixture({keys:[nativeKey]}); const plain = await f.service.getKey({logical_name:'new_sample',schema_name:'new_ReferenceKey'});
  assert.equal(plain.job.status,'not_requested'); assert.equal(f.calls.some(call => call.endpoint.startsWith('/asyncoperations')),false);
  const read = await f.service.getKey({logical_name:'new_sample',schema_name:'new_ReferenceKey',include_job:true});
  assert.equal(read.job.status,'retrieved'); assert.equal(read.job.data.errorcode,0); assert.doesNotMatch(JSON.stringify(read),/hidden-message|hidden-data/);
  const denied = fixture({keys:[nativeKey],request:({endpoint}) => {if (endpoint.startsWith('/asyncoperations')) throw new CrmRequestError('D365_HTTP_ERROR','secret',{status:403});}});
  const partial = await denied.service.getKey({logical_name:'new_sample',schema_name:'new_ReferenceKey',includeJob:true});
  assert.equal(partial.index.status,'Active'); assert.equal(partial.job.status,'forbidden'); assert.doesNotMatch(JSON.stringify(partial),/secret/);
});

test('job link missing or zero remains unlinked and key absence is not an inactive index', async () => {
  for (const AsyncJob of [undefined,null,'00000000-0000-0000-0000-000000000000']) {
    const f = fixture({keys:[{...nativeKey,AsyncJob}]});
    const result = await f.service.getKey({logical_name:'new_sample',schema_name:'new_ReferenceKey',include_job:true}); assert.equal(result.job.status,'not_linked');
  }
  assert.equal((await failure(fixture().service.getKey({logical_name:'new_sample',schema_name:'new_ReferenceKey'}))).code,'D365_MODEL_NOT_FOUND');
});

test('unknown/rejected schema writes remain distinct and never retry create or publish', async () => {
  for (const [outcome,saved] of [['unknown',null],['rejected',false]]) {
    for (const [args,method] of [[one,'createRelationship'],[key,'createKey']]) {
      const f = fixture({request:call => {if (isMutation(call)) throw new CrmRequestError('D365_TIMEOUT','hidden-secret',{outcome});}});
      const error = await failure(f.service[method]({...args,dry_run:false}));
      assert.equal(error.code,'D365_MODEL_WRITE_FAILED'); assert.equal(error.data.saved,saved); assert.equal(writes(f).length,1);
      assert.doesNotMatch(JSON.stringify(error),/hidden-secret/);
    }
  }
});

test('cancellation before a request sends nothing and propagates the signal to every eligibility/read/write', async () => {
  const controller = new AbortController(); controller.abort(); const f = fixture();
  assert.equal((await failure(f.service.createKey(key,controller.signal))).code,'D365_REQUEST_ABORTED'); assert.equal(f.calls.length,0);
  const live = new AbortController(),g = fixture(); await g.service.createRelationship({...one,dry_run:false},live.signal);
  assert.equal(g.calls.every(call => call.options.signal === live.signal),true);
});

test('solution restrictions and key prefix are enforced using shared metadata infrastructure', async () => {
  for (const method of ['createKey','createRelationship']) {
    const f = fixture({solution:{ismanaged:true}});
    assert.equal((await failure(f.service[method](method === 'createKey' ? key : one))).code,'D365_MODEL_SOLUTION'); assert.equal(writes(f).length,0);
  }
});

test('new schemas compile with aliases and defaults enabled and every route is registered once', () => {
  const samples = {get_model_relationship:{schemaName:'new_account_sample'},create_model_relationship:{...one,dryRun:false},
    get_model_key:{logicalName:'new_sample',schemaName:'new_ReferenceKey',includeJob:true},create_model_key:key};
  const ajv = new Ajv({strict:false,useDefaults:true});
  for (const tool of modelStructureTools) {
    const validate = ajv.compile(tool.inputSchema); assert.equal(validate(samples[tool.name]),true,JSON.stringify(validate.errors));
    if (tool.name === 'create_model_relationship') {
      assert.equal(validate(many),true,JSON.stringify(validate.errors));
      assert.equal(validate({...one,lookup:undefined}),false);
      assert.equal(validate({...many,entity_2:undefined}),false);
    }
    assert.equal(validate({unknown:true}),false); assert.equal(tools.filter(item => item.name === tool.name).length,1);
    assert.equal(tool.annotations.readOnlyHint,tool.name.startsWith('get_'));
  }
});

test('all four shared MCP routes propagate cancellation and permit previews without schema mutations', async t => {
  const f = fixture({existingRelation:true,keys:[nativeKey]});
  const settings = {AUTH_TYPE:'online',ORG_URL:env.orgUrl,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]])); Object.assign(process.env,settings);
  const createFixture = fixture(),controller = new AbortController(); let activeFixture = f;
  t.mock.method(D365AuthService.prototype,'requestWithResponse',(...a) => activeFixture.client.requestWithResponse(...a));
  try {
    assert.ok((await handleToolCall('get_model_relationship',{schema_name:'new_account_sample'},{signal:controller.signal})).definition);
    assert.ok((await handleToolCall('get_model_key',{logical_name:'new_sample',schema_name:'new_ReferenceKey'},{signal:controller.signal})).index);
    // Route create calls to the fresh fixture for all preflight endpoints.
    activeFixture = createFixture;
    assert.equal((await handleToolCall('create_model_relationship',one,{signal:controller.signal})).dryRun,true);
    assert.equal((await handleToolCall('create_model_key',key,{signal:controller.signal})).dryRun,true);
    assert.equal([...f.calls,...createFixture.calls].every(call => call.options.signal === controller.signal),true);
    assert.equal([...f.calls,...createFixture.calls].filter(isMutation).length,0);
  } finally { for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('Online, NTLM and IFD native transport preserves eligibility/create paths, solution header and key async state', async t => {
  t.mock.method(axios,'post',async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const authType of ['online','op_ad','op_ifd']) {
    CacheService.flushExisting();
    const config = readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
      AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
    const client = new D365AuthService(config),f = fixture();
    client.getAxiosInstance().defaults.adapter = async config => {
      const url = new URL(config.url),endpoint = url.pathname.replace('/Demo/api/data/v9.1','') + url.search,method = config.method.toUpperCase();
      if (isMutation({endpoint,method})) assert.equal(config.headers.get('MSCRM.SolutionUniqueName'),'TestSolution');
      const response = await f.client.requestWithResponse(endpoint,method,config.data ? JSON.parse(config.data) : undefined,{headers:config.headers});
      return {config,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};
    };
    const service = new ModelStructureService(client,{...env,authType});
    assert.equal((await service.createRelationship({...one,dry_run:false})).saved,true);
    assert.equal((await service.createKey({...key,dry_run:false})).index.status,'Pending');
    assert.equal(writes(f).length,2);
  }
});
