import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {ApiOperationService} from '../src/services/apiOperation.ts';
import {OperationMetadata} from '../src/services/apiOperationMetadata.ts';
import {apiOperationTools} from '../src/tools/apiOperationTools.ts';
import {RecordService} from '../src/services/record.ts';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';
import {fixture,invoked,id,env,csdl,simple,wrap,parameter} from './apiOperation.fixture.mjs';
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);
  const result=toolErrorPayload(e);if(code)assert.equal(result.code,code);return result;}}
test('schemas expose signature discovery and preserve canonical/alias argument forms',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const tool of apiOperationTools)ajv.compile(tool.inputSchema);
  const validate=ajv.compile(apiOperationTools[1].inputSchema);
  assert.equal(validate({actionName:'new_Bound',binding:{collectionName:'accounts',id},parameters:{Text:'hello'}}),true);
  assert.equal(validate({action_name:'new_Run',endpoint:'https://evil.invalid'}),false);
});
test('discovery reads native XML and exposes bound overloads, type facets and import visibility',async()=>{
  const f=fixture(),result=await f.service.describe({action_name:'new_Bound'});
  assert.equal(result.signatures.length,2);assert.equal(result.signatures[0].bound,true);assert.equal(invoked(f).length,0);
  assert.equal(f.calls[0].options.headers.Accept,'application/xml');assert.match(result.metadataHash,/^[a-f0-9]{64}$/);
  const filtered=await f.service.describe({actionName:'new_Bound',binding:{collectionName:'accounts',id}});
  assert.equal(filtered.signatures.length,1);assert.equal(filtered.signatures[0].binding.type,'Microsoft.Dynamics.CRM.account');
  const type=await f.service.describe({action_name:'new_Complex'});assert.equal(type.directInputTypes[0].properties[0].name,'Count');
  assert.equal((await f.service.describe({action_name:'OnlyFilter'})).signatures[0].invocable,false);
});
test('legacy Action default invokes immediately and returns native data unchanged',async()=>{
  const f=fixture({result:{Legacy:'response'}});assert.deepEqual(await f.service.invoke({action_name:'new_Run',parameters:{Text:'hello'}}),{Legacy:'response'});
  assert.equal(invoked(f).length,1);assert.equal(invoked(f)[0].method,'POST');assert.equal(invoked(f)[0].endpoint,'/new_Run');
  assert.deepEqual(invoked(f)[0].data,{Text:'hello'});
  assert.match(invoked(f)[0].options.headers['Content-Type'],/IEEE754Compatible=true/);
});
test('native 204 is returned as null; details are explicit and do not claim business readback',async()=>{
  const f=fixture({status:204,result:null});assert.equal(await f.service.invoke({action_name:'new_Run',parameters:{Text:'ok'}}),null);
  const result=await f.service.invoke({action_name:'new_Run',parameters:{Text:'ok'},returnDetails:true});
  assert.equal(result.status,204);assert.equal(result.submitted,true);assert.equal(result.data,null);assert.equal(result.businessReadback,'not_performed');
});
test('preview withholds parameter values and URL query unless explicitly requested',async()=>{
  const f=fixture(),secret='secret-do-not-echo';
  const hidden=await f.service.invoke({actionName:'new_Search',isFunction:true,parameters:{Text:secret,Count:2},dryRun:true});
  assert.equal(hidden.executed,false);assert.equal(hidden.request.values,'withheld');assert.equal(hidden.request.endpoint,undefined);
  assert.equal(JSON.stringify(hidden).includes(secret),false);assert.equal(invoked(f).length,0);
  const visible=await f.service.invoke({action_name:'new_Search',is_function:true,parameters:{Text:secret,Count:2},dry_run:true,includeParameterValues:true});
  assert.equal(visible.request.values.Text,secret);assert.ok(visible.request.endpoint.includes('@p1') || visible.request.endpoint.includes('%40p1'));
});
test('single-entity binding selects the matching native overload and excludes binding parameter from body',async()=>{
  const f=fixture();await f.service.invoke({action_name:'mscrm.new_Bound',binding:{collection_name:'accounts',id:id.toUpperCase()},parameters:{Text:'ok'}});
  assert.equal(invoked(f)[0].endpoint,`/accounts(${id})/Microsoft.Dynamics.CRM.new_Bound`);assert.deepEqual(invoked(f)[0].data,{Text:'ok'});
});
test('collection binding uses entity set and normalizes entity references in the POST collection',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_Collection',binding:{collection_name:'accounts'},parameters:{Targets:[{'@odata.id':`accounts(${id})`}]}});
  assert.equal(invoked(f)[0].endpoint,'/accounts/Microsoft.Dynamics.CRM.new_Collection');
  assert.deepEqual(invoked(f)[0].data.Targets,[{'@odata.type':'Microsoft.Dynamics.CRM.account',accountid:id}]);
});
test('bound base-entity Function applies native inheritance and uses qualified name',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_BoundFunction',is_function:true,binding:{collection_name:'contacts',id},parameters:{Text:'a/b'}});
  const url=new URL(invoked(f)[0].endpoint,'https://crm.invalid');assert.match(url.pathname,/contacts\(.+\)\/Microsoft.Dynamics.CRM.new_BoundFunction\(Text=@p1\)/);
  assert.equal(url.searchParams.get('@p1'),"'a/b'");
});
test('Function aliases escape apostrophes and encode reserved characters/unicode without path injection',async()=>{
  const f=fixture(),text="O'Brien / ?&=+%#中文😀');/new_Secret";
  await f.service.invoke({action_name:'new_Search',is_function:true,parameters:{Text:text,Count:3}});
  const call=invoked(f)[0],url=new URL(call.endpoint,'https://crm.invalid');
  assert.equal(call.method,'GET');assert.equal(call.data,undefined);assert.equal(url.pathname,'/new_Search(Text=@p1,Count=@p2)');
  assert.equal(url.searchParams.get('@p1'),"'"+text.replace(/'/g,"''")+"'");assert.equal(url.searchParams.get('@p2'),'3');assert.equal(url.hash,'');
});
test('entity Function references are same-service relative URIs; Action references use real primary keys',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_Ref',is_function:true,parameters:{Target:{'@odata.id':`/contacts(${id})`}}});
  const url=new URL(invoked(f)[0].endpoint,'https://crm.invalid');assert.deepEqual(JSON.parse(url.searchParams.get('@p1')),{'@odata.id':`contacts(${id})`});
  await f.service.invoke({action_name:'new_Entity',parameters:{Target:{'@odata.id':`contacts(${id})`}}});
  assert.deepEqual(invoked(f)[1].data.Target,{'@odata.type':'Microsoft.Dynamics.CRM.contact',contactid:id});
});
test('entity partial data needs concrete type for abstract parameters and rejects navigation annotations',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_Entity',parameters:{Target:{'@odata.type':'#mscrm.account',name:'Example'}}});
  assert.deepEqual(invoked(f)[0].data.Target,{'@odata.type':'Microsoft.Dynamics.CRM.account',name:'Example'});
  for(const Target of [{name:'No concrete type'},{'@odata.type':'mscrm.account',missing:'x'},
    {'@odata.type':'mscrm.account','primarycontactid@odata.bind':`/contacts(${id})`},{'@odata.type':'mscrm.Config',Count:2}])
    await error(f.service.invoke({action_name:'new_Entity',parameters:{Target}}));
  assert.equal(invoked(f).length,1);
});
test('cross-org, navigation, alternate-key and incompatible entity references are rejected before invocation',async()=>{
  for(const reference of [`https://evil.invalid/accounts(${id})`,`accounts(${id})/contacts`,`accounts(name='x')`,`//evil.invalid/accounts(${id})`]){
    const f=fixture();await error(f.service.invoke({action_name:'new_Ref',is_function:true,parameters:{Target:{'@odata.id':reference}}}));assert.equal(invoked(f).length,0);
  }
  await error(fixture().service.invoke({action_name:'new_Entity',parameters:{Target:{'@odata.id':`contacts(${id})`,'@odata.type':'mscrm.account'}}}));
});
test('complex values validate required properties and serialize JSON in parameter aliases',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_Complex',is_function:true,parameters:{Config:{Count:2,Token:'a&b'}}});
  const actual=JSON.parse(new URL(invoked(f)[0].endpoint,'https://crm.invalid').searchParams.get('@p1'));
  assert.deepEqual(actual,{'@odata.type':'Microsoft.Dynamics.CRM.Config',Count:2,Token:'a&b'});
  for(const Config of [{Token:'x'},{Count:'2'},{Count:2,Extra:3}])await error(f.service.invoke({action_name:'new_Complex',is_function:true,parameters:{Config}}));
  assert.equal(invoked(f).length,1);
});
test('Int64/Decimal are exact strings in IEEE754 JSON; invalid precision and unsafe integers fail',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_Exact',parameters:{Large:'9223372036854775807',Amount:'1234567890123456.1234'}});
  assert.deepEqual(invoked(f)[0].data,{Large:'9223372036854775807',Amount:'1234567890123456.1234'});
  for(const parameters of [{Large:9007199254740992,Amount:'1.2'},{Large:'9223372036854775808',Amount:'1.2'},
    {Large:1,Amount:'1.00001'},{Large:1,Amount:'123456789012345678901'},{Large:1,Amount:'1e-7'}])await error(f.service.invoke({action_name:'new_Exact',parameters}));
  assert.equal(invoked(f).length,1);
});
test('native enum names and flags are validated and qualified in Function literals',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_Enums',is_function:true,parameters:{Rights:'Read, Write',Color:'Red'}});
  const url=new URL(invoked(f)[0].endpoint,'https://crm.invalid');assert.equal(url.searchParams.get('@p1'),"Microsoft.Dynamics.CRM.AccessRights'Read,Write'");
  for(const parameters of [{Rights:'Read,Read',Color:'Red'},{Rights:1,Color:'Red'},{Rights:'Read',Color:'Red,Blue'},{Rights:'Delete',Color:'Red'}])
    await error(f.service.invoke({action_name:'new_Enums',is_function:true,parameters}));
});
for(const [type,value,expected] of [['Edm.Boolean',true,'true'],['Edm.Byte',255,'255'],['Edm.SByte',-128,'-128'],['Edm.Int16',32767,'32767'],
  ['Edm.Int32',-2147483648,'-2147483648'],['Edm.Int64','-9223372036854775808','-9223372036854775808'],['Edm.Decimal','1.25','1.25'],
  ['Edm.Double',1.25,'1.25'],['Edm.Single',2,'2'],['Edm.Guid',id,id],['Edm.Date','2026-10-28','2026-10-28'],
  ['Edm.DateTimeOffset','2026-10-28T10:20:30+08:00','2026-10-28T10:20:30+08:00'],['Edm.TimeOfDay','23:59:59.123','23:59:59.123'],
  ['Edm.Duration','P1DT2H',"duration'P1DT2H'"],['Edm.Binary','YQ==',"binary'YQ'"],['Collection(Edm.Int32)',[1,2],'[1,2]']])
test(`${type}: native Function literal encoding`,async()=>{
  const f=fixture({metadata:simple(type)});await f.service.invoke({action_name:'Probe',is_function:true,parameters:{P:value}});
  assert.equal(new URL(invoked(f)[0].endpoint,'https://crm.invalid').searchParams.get('@p1'),expected);
});
test('invalid primitive/temporal values and oversized collections never invoke an operation',async()=>{
  for(const [type,value] of [['Edm.Boolean','true'],['Edm.Byte',256],['Edm.Int16',-32769],['Edm.Single',1e40],['Edm.Double',Infinity],
    ['Edm.Guid','not-guid'],['Edm.Binary','YR=='],['Edm.Date','2026-02-30'],['Edm.Date','0000-01-01'],
    ['Edm.DateTimeOffset','2026-10-28T10:20:30+14:01'],['Edm.DateTimeOffset','2026-10-28T24:00:00Z'],
    ['Edm.TimeOfDay','24:00:00'],['Edm.Duration','P'],['Collection(Edm.Int32)',Array(1001).fill(1)]]){
    const f=fixture({metadata:simple(type)});await error(f.service.invoke({action_name:'Probe',is_function:true,parameters:{P:value}}));assert.equal(invoked(f).length,0);
  }
});
test('missing, nullable, optional, unknown and binding parameters are treated distinctly',async()=>{
  const f=fixture();await f.service.invoke({action_name:'new_Run',parameters:{Text:'ok',Optional:null}});
  await f.service.invoke({action_name:'new_Optional',is_function:true,parameters:{Required:1}});
  for(const args of [{action_name:'new_Run',parameters:{Optional:'x'}},{action_name:'new_Run',parameters:{Text:null}},
    {action_name:'new_Search',is_function:true,parameters:{Text:'x'}},{action_name:'new_Run',parameters:{Text:'x',text:'bad'}},
    {action_name:'new_Bound',binding:{collection_name:'accounts',id},parameters:{Text:'x',entity:{}}}])await error(f.service.invoke(args));
  assert.equal(invoked(f).length,2);
});
test('ambiguous overloads require signature_id and discovery IDs select exact type',async()=>{
  const f=fixture();const rejected=await error(f.service.invoke({action_name:'new_Overload',is_function:true,parameters:{Value:1}}),'D365_OPERATION_AMBIGUOUS');
  assert.equal(rejected.data.signatures.length,2);assert.equal(invoked(f).length,0);
  const signatures=(await f.service.describe({action_name:'new_Overload'})).signatures;
  const selected=signatures.find(s=>s.parameters[0].type==='Edm.Int32');
  await f.service.invoke({action_name:'new_Overload',is_function:true,parameters:{Value:1},signatureId:selected.signatureId});
  assert.equal(invoked(f).length,1);
});
test('invalid binding, unexposed query functions and unsupported types cannot dispatch',async()=>{
  for(const args of [{action_name:'new_Bound',parameters:{Text:'x'}},{action_name:'new_Run',binding:{collection_name:'accounts',id},parameters:{Text:'x'}},
    {action_name:'new_Bound',binding:{collection_name:'contacts'},parameters:{Text:'x'}},
    {action_name:'new_Collection',binding:{collection_name:'accounts',id},parameters:{Targets:[]}},
    {action_name:'new_Bound',binding:{collection_name:'unknown',id},parameters:{Text:'x'}},{action_name:'OnlyFilter',is_function:true},
    {action_name:'new_Unsupported',parameters:{Value:'opaque'}},{action_name:'new_Run?target=x',parameters:{Text:'x'}}]){
    const f=fixture();await error(f.service.invoke(args));assert.equal(invoked(f).length,0);
  }
});
test('binding requires an actual entity type and a single native Guid key',async()=>{
  for(const metadata of [csdl.replace('EntityType="mscrm.account"','EntityType="mscrm.Config"'),
    csdl.replace('<Property Name="accountid" Type="Edm.Guid"','<Property Name="accountid" Type="Edm.String"')]){
    const f=fixture({metadata});await error(f.service.invoke({action_name:'new_Bound',binding:{collection_name:'accounts',id},parameters:{Text:'x'}}),'D365_OPERATION_BINDING_INVALID');
    assert.equal(invoked(f).length,0);
  }
});
test('expected_hash binds preview metadata, target and values without locking records',async()=>{
  const options={},f=fixture(options),args={action_name:'new_Run',parameters:{Text:'reviewed'}};
  const preview=await f.service.invoke({...args,dry_run:true});
  await error(f.service.invoke({...args,parameters:{Text:'changed'},expected_hash:preview.planHash}),'D365_OPERATION_CONFLICT');
  options.metadata=csdl+'<!-- changed service document -->';
  await error(f.service.invoke({...args,expected_hash:preview.planHash}),'D365_OPERATION_CONFLICT');assert.equal(invoked(f).length,0);
  options.metadata=csdl;await f.service.invoke({...args,expected_hash:preview.planHash});assert.equal(invoked(f).length,1);
});
test('DTD, malformed namespace/type metadata, cycles and token limits are rejected safely',async()=>{
  for(const metadata of ['<!DOCTYPE x><x/>','<edmx:Edmx>',csdl.replace('http://docs.oasis-open.org/odata/ns/edm','https://evil.invalid'),
    csdl.replace('Type="Edm.String"','Type="../../invoke"'),'<!---->'.repeat(500001)]){
    const f=fixture({metadata});await error(f.service.describe({action_name:'new_Run'}));assert.equal(invoked(f).length,0);
  }
  const cyclic=wrap(`<Action Name="Cycle">${parameter('P','mscrm.Loop')}</Action>`,'<ActionImport Name="Cycle" Action="mscrm.Cycle"/>',
    '<ComplexType Name="Loop" BaseType="mscrm.Loop"/>');
  await error(fixture({metadata:cyclic}).service.invoke({action_name:'Cycle',parameters:{P:{}}}),'D365_OPERATION_METADATA_INVALID');
});
test('Function URL length, input bounds and facet constraints fail before invocation',async()=>{
  const f=fixture();await error(f.service.invoke({action_name:'new_Search',is_function:true,parameters:{Text:'x'.repeat(40000),Count:1}}),'D365_OPERATION_LIMIT');
  await error(f.service.invoke({action_name:'new_Secret',parameters:{Password:'x'.repeat(1024*1024)}}),'D365_OPERATION_LIMIT');
  const limited=fixture({metadata:simple('Edm.String','MaxLength="3"')});await error(limited.service.invoke({action_name:'Probe',is_function:true,parameters:{P:'long'}}));
  assert.equal(invoked(f).length,0);assert.equal(invoked(limited).length,0);
});
test('cyclic/deep/non-JSON values, aliases and invalid Unicode fail before dispatch',async()=>{
  const cyclic={};cyclic.self=cyclic;let deep={};for(let index=0;index<30;index++)deep={next:deep};
  const f=fixture();
  for(const parameters of [cyclic,deep,{Text:1n},{Text:()=>{}}])await error(f.service.invoke({action_name:'new_Run',parameters}));
  await error(f.service.invoke({action_name:'new_Run',actionName:'new_Secret',parameters:{Text:'x'}}),'D365_OPERATION_INVALID');
  for(const Text of ['\ud800','\udc00'])await error(f.service.invoke({action_name:'new_Search',is_function:true,parameters:{Text,Count:1}}),'D365_OPERATION_TYPE_INVALID');
  assert.equal(invoked(f).length,0);
});
test('unexpected non-success responses never become successful receipts',async()=>{
  for(const [status,executed] of [[400,false],[503,null]]){
    const f=fixture({status}),result=await error(f.service.invoke({action_name:'new_Run',parameters:{Text:'ok'}}),'D365_OPERATION_FAILED');
    assert.equal(result.data.executed,executed);assert.equal(result.status,status);assert.equal(invoked(f).length,1);
  }
});
test('source-level RecordService callers share typed implementation even with data-only client',async()=>{
  const f=fixture(),record=new RecordService({makeRequest:f.client.makeRequest});
  assert.deepEqual(await record.callD365Action('new_Run',{Text:'ok'}),{Result:'ok'});
  await record.callD365Action('new_Search',{Text:"A'B",Count:1},true);
  assert.equal(new URL(invoked(f)[1].endpoint,'https://crm.invalid').searchParams.get('@p1'),"'A''B'");
});
test('metadata failure and platform/transport failures withhold parameter text and never replay POST',async()=>{
  const secret='password-never-return-me';
  const meta=fixture({metadataError:new Error(secret)});const result=await error(meta.service.invoke({action_name:'new_Secret',parameters:{Password:secret}}),'D365_OPERATION_METADATA_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(invoked(meta).length,0);
  for(const [cause,executed] of [[new CrmRequestError('D365_TIMEOUT',secret,{outcome:'unknown'}),null],
    [new CrmRequestError('D365_HTTP_ERROR',secret,{status:400,outcome:'rejected'}),false],[new Error(secret),null]]){
    const f=fixture({error:cause}),result=await error(f.service.invoke({action_name:'new_Secret',parameters:{Password:secret}}),'D365_OPERATION_FAILED');
    assert.equal(result.data.executed,executed);assert.equal(result.data.submitted,executed);assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(invoked(f).length,1);
  }
});
test('cancellation propagates on metadata and invocation, without a dispatch on pre-abort',async()=>{
  const controller=new AbortController();controller.abort();const f=fixture();
  await error(f.service.invoke({action_name:'new_Run',parameters:{Text:'x'}},controller.signal),'D365_OPERATION_METADATA_UNAVAILABLE');assert.equal(f.calls.length,0);
  const signal=new AbortController().signal,g=fixture();await g.service.invoke({action_name:'new_Run',parameters:{Text:'x'}},signal);
  assert.ok(g.calls.every(c=>c.options.signal===signal));
});
test('MCP routes discovery and legacy invocation with cancellation and binding arguments',async t=>{
  const signal=new AbortController().signal;
  t.mock.method(ApiOperationService.prototype,'describe',async (args,received)=>{assert.equal(received,signal);return {args};});
  t.mock.method(ApiOperationService.prototype,'invoke',async (args,received)=>{assert.equal(received,signal);return {args};});
  const saved={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{assert.equal((await handleToolCall('get_api_operation',{action_name:'new_Run'},{signal})).args.action_name,'new_Run');
    assert.equal((await handleToolCall('call_d365_api_action',{action_name:'new_Run',binding:{collection_name:'accounts',id}},{signal})).args.binding.id,id);}
  finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: actual request branch reads CSDL and sends bound Action plus encoded Function`,async t=>{
  t.mock.method(axios,'post',async()=>({data:{access_token:'offline-token',expires_in:3600}}));
  const config=readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,ENVIRONMENT_URL:env.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
    AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
  const client=new D365AuthService(config),f=fixture();
  client.getAxiosInstance().defaults.adapter=async config=>{
    const url=new URL(config.url);assert.equal(url.origin,'https://crm.invalid');assert.ok(url.pathname.startsWith('/Demo/api/data/v9.1/'));
    const response=await f.client.requestWithResponse(decodeURI(url.pathname.replace('/Demo/api/data/v9.1',''))+url.search,config.method.toUpperCase(),
      config.data?JSON.parse(config.data):undefined,{headers:Object.fromEntries(config.headers)});
    return {config,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};
  };
  const service=new ApiOperationService(client,{...env,authType});
  await service.invoke({action_name:'new_Bound',binding:{collection_name:'accounts',id},parameters:{Text:'hello'}});
  await service.invoke({action_name:'new_Search',is_function:true,parameters:{Text:"a'b/?&中文",Count:2}});
  assert.equal(invoked(f).length,2);assert.match(invoked(f)[0].endpoint,/Microsoft.Dynamics.CRM.new_Bound$/);
  assert.equal(new URL(invoked(f)[1].endpoint,'https://crm.invalid').searchParams.get('@p1'),"'a''b/?&中文'");
});
