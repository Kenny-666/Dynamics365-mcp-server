import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {SolutionService} from '../src/services/solution.ts';
import {solutionTools} from '../src/tools/solutionTools.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';
import {fixture,execute,writes,ids,env,addArgs,membership,nativeSolution,csdl,edge} from './solution.fixture.mjs';
const reply=data=>({data,status:200,headers:{}});
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);
  const result=toolErrorPayload(e);if(code)assert.equal(result.code,code);return result;}}
test('four tools have valid schemas and native object IDs are explicit',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const tool of solutionTools)ajv.compile(tool.inputSchema);
  const validate=ajv.compile(solutionTools[3].inputSchema);
  assert.equal(validate({solutionUniqueName:'TestSolution',componentId:ids.object,componentType:61}),true);
  assert.equal(validate({...addArgs,add_required_components:true}),false);assert.equal(validate({...addArgs,component_type:0}),false);
});
test('solution catalog combines exact filters and projects only catalog columns',async()=>{
  const f=fixture({solutions:[{...nativeSolution,password:'SECRET',description:'not selected'}]});
  const result=await f.service.list({solutionUniqueName:'TestSolution',solutionId:ids.solution,is_managed:false});
  assert.equal(result.items[0].password,undefined);assert.equal(result.items[0].description,undefined);assert.equal(result.paging.complete,true);
  const filter=f.calls[0].url.searchParams.get('$filter');assert.match(filter,/uniquename eq 'TestSolution'/);assert.match(filter,new RegExp('solutionid eq '+ids.solution));assert.match(filter,/ismanaged eq false/);
  assert.equal(writes(f).length,0);
});
test('membership lists distinguish row ID, object ID and root scope',async()=>{
  const f=fixture({members:[{...membership(),configuration:'SECRET'}]});
  const result=await f.service.listComponents({solution_unique_name:'TestSolution',component_id:ids.object,component_type:61});
  assert.equal(result.items[0].solutioncomponentid,ids.membership);assert.equal(result.items[0].objectid,ids.object);
  assert.equal(result.items[0].rootcomponentbehavior,1);assert.equal(JSON.stringify(result).includes('SECRET'),false);
  const filter=f.calls.at(-1).url.searchParams.get('$filter');assert.match(filter,new RegExp('_solutionid_value eq '+ids.solution));assert.match(filter,/componenttype eq 61/);
});
test('native paging follows safe absolute/root links and reports truncation honestly',async()=>{
  const rows=[membership(),membership({solutioncomponentid:ids.other,objectid:ids.required}),membership({solutioncomponentid:ids.container,objectid:ids.parent})];
  const f=fixture({request:call=>{
    if(call.path!=='/solutioncomponents')return undefined;
    const skip=Number(call.url.searchParams.get('$skiptoken')||0),page=rows.slice(skip,skip+1);
    const next=new URL(call.url);next.searchParams.set('$skiptoken',String(skip+1));
    return reply({value:page,...(skip+1<rows.length?{'@odata.nextLink':skip===0?next.href:next.pathname+next.search}:{})});
  }});
  const complete=await f.service.listComponents({solution_unique_name:'TestSolution',top:3,max_pages:5});
  assert.equal(complete.items.length,3);assert.equal(complete.paging.complete,true);assert.equal(complete.paging.pages,3);
  const truncated=await f.service.listComponents({solution_unique_name:'TestSolution',top:1,max_pages:5});assert.equal(truncated.items.length,1);assert.equal(truncated.paging.complete,false);
  const limited=await f.service.listComponents({solution_unique_name:'TestSolution',top:3,max_pages:1});assert.equal(limited.paging.complete,false);
  const paged=f.calls.filter(call=>call.path==='/solutioncomponents');
  assert.ok(paged.every(call=>!call.url.searchParams.has('$top')&&!call.url.searchParams.has('$skip')));
});
for(const direction of ['required','dependent','delete'])test(`${direction}: native dependency direction and no deletion authorization`,async()=>{
  const f=fixture(),result=await f.service.getDependencies({componentId:ids.object,componentType:61,direction});
  assert.equal(result.items[0].requiredcomponentobjectid,ids.required);assert.equal(result.direction,direction);assert.equal(result.canDelete,'not_assessed');
  assert.equal(result.transitiveClosure,'not_computed');assert.equal(result.paging.complete,true);assert.equal(writes(f).length,0);
  const call=f.calls.find(c=>c.path.startsWith('/Retrieve'));assert.equal(call.method,'GET');assert.equal(call.url.searchParams.get('@p1'),ids.object);assert.equal(call.url.searchParams.get('@p2'),'61');
});
test('empty dependencies do not prove permission or deployment/deletion readiness',async()=>{
  const f=fixture({edges:[]}),result=await f.service.getDependencies({component_id:ids.object,component_type:61,direction:'delete'});
  assert.equal(result.items.length,0);assert.equal(result.canDelete,'not_assessed');assert.match(result.note,/not deletion permission/);
});
test('native dependency records may omit dependencyid while preserving both endpoint identities',async()=>{
  const value={...edge};delete value.dependencyid;
  const result=await fixture({edges:[value]}).service.getDependencies({component_id:ids.object,component_type:61});
  assert.equal(result.count,1);assert.equal(result.items[0].dependencyid,undefined);assert.equal(result.items[0].dependentcomponentobjectid,ids.object);
});
test('default add preview reads actual object/CSDL/full baseline and sends no mutation',async()=>{
  const f=fixture(),result=await f.service.add(addArgs);
  assert.equal(result.dryRun,true);assert.equal(result.saved,false);assert.match(result.planHash,/^[a-f0-9]{64}$/);assert.equal(writes(f).length,0);
  assert.equal(result.component.source.webresourceid,ids.object);assert.equal(result.request.body.AddRequiredComponents,false);assert.equal(result.request.body.DoNotIncludeSubcomponents,true);
  assert.deepEqual(result.request.body.IncludedComponentSettingsValues,[]);assert.equal(result.requiredDependencies.items.length,1);
  assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.ok(f.calls.every(c=>!/[?&]\$select=[^&]*(?:content|configuration)/.test(c.endpoint)));
});
test('older CSDL without IncludedComponentSettingsValues omits the unsupported field',async()=>{
  const metadata=csdl.replace(/<Parameter Name="IncludedComponentSettingsValues"[^>]*\/>/,'');
  const f=fixture({metadata}),preview=await f.service.add(addArgs);assert.equal(preview.request.body.IncludedComponentSettingsValues,undefined);
  assert.equal((await execute(f)).saved,true);
});
for(const type of [1,2,9,10,14,26,60,61,90,91,92,93])test(`component type ${type}: verified native identity can be added and membership reread`,async()=>{
  const f=fixture({type}),args={...addArgs,component_type:type,...([2,14].includes(type)?{logical_name:'new_sample'}:{})};
  const result=await execute(f,args);assert.equal(result.saved,true);assert.equal(result.readback.status,'matched');assert.equal(result.responseSolutionComponentId,ids.membership);
  assert.equal(result.component.objectId,ids.object);assert.equal(writes(f).length,1);assert.equal(writes(f)[0].path,'/AddSolutionComponent');
  assert.equal(result.readback.membership[0].objectid,ids.object);assert.equal(result.exportContentsVerified,false);assert.equal(result.dependencyClosureVerified,false);
});
test('existing membership is a no-op preserving its current inclusion scope',async()=>{
  const f=fixture({members:[membership({rootcomponentbehavior:0})]}),result=await execute(f);
  assert.equal(result.noChange,true);assert.equal(result.saved,false);assert.equal(result.existingScopeUnchanged,true);assert.equal(writes(f).length,0);
});
test('implicit parent shells and concurrent deltas are observed without claiming attribution',async()=>{
  const f=fixture({extraMember:true}),result=await execute(f);
  assert.equal(result.observedChanges.added.length,2);assert.equal(result.observedChanges.attribution,'observed_between_nontransactional_reads');
  assert.ok(result.observedChanges.added.some(item=>item.rootcomponentbehavior===2));assert.equal(writes(f).length,1);
});
test('a managed source can be referenced in an unmanaged target without editing the source',async()=>{
  const f=fixture({source:{ismanaged:true}}),result=await execute(f);
  assert.equal(result.saved,true);assert.equal(result.component.source.ismanaged,true);assert.equal(result.solution.ismanaged,false);
  assert.ok(writes(f).every(call=>call.path==='/AddSolutionComponent'));
});
test('native Action id is a membership ID, not the supplied object GUID',async()=>{
  const f=fixture({response:{id:ids.object}}),result=await error(execute(f),'D365_SOLUTION_READBACK_FAILED');
  assert.equal(result.data.saved,true);assert.equal(result.data.component.objectId,ids.object);assert.equal(writes(f).length,1);
});
test('source GUID/type/parent mismatches and unsupported types block before any POST',async()=>{
  for(const [options,args] of [[{source:{webresourceid:ids.other}},addArgs],[{type:2,source:{EntityLogicalName:'account'}},{...addArgs,component_type:2,logical_name:'new_sample'}],
    [{type:9,source:{IsGlobal:false}},{...addArgs,component_type:9}],[{},{...addArgs,component_type:29}],
    [{},{...addArgs,logical_name:'new_sample'}],[{type:2},{...addArgs,component_type:2}],
    [{source:{name:null}},addArgs],[{},{...addArgs,component_id:ids.membership}],
    [{type:10,source:{RelationshipType:'Unknown'}},{...addArgs,component_type:10}]]){
    const f=fixture(options);await error(f.service.add(args));assert.equal(writes(f).length,0);
  }
});
test('managed/hidden/patch/system targets and ambiguous solutions are rejected',async()=>{
  for(const options of [{target:{ismanaged:true}},{target:{isvisible:false}},{target:{_parentsolutionid_value:ids.parent}},
    {target:{uniquename:'Default'}},{solutions:[]},{solutions:[nativeSolution,nativeSolution]}]){
    const f=fixture(options);await error(f.service.add(options.target?.uniquename?{...addArgs,solution_unique_name:'Default'}:addArgs));assert.equal(writes(f).length,0);
  }
});
test('current CSDL must expose expected add flags and dependency contract',async()=>{
  for(const metadata of [csdl.replace('Name="DoNotIncludeSubcomponents"','Name="UnknownFlag"'),
    csdl.replace('Name="ComponentType" Type="Edm.Int32"','Name="ComponentType" Type="Edm.String"'),
    csdl.replace('FunctionImport Name="RetrieveRequiredComponents"','FunctionImport Name="MissingImport"'),
    csdl.replaceAll('Microsoft.Dynamics.CRM','Other.App')]){
    const f=fixture({metadata});await error(f.service.add(addArgs));assert.equal(writes(f).length,0);
  }
});
test('actual execution needs planHash and explicit unprotected-write acceptance',async()=>{
  const f=fixture(),preview=await f.service.add(addArgs);
  await error(f.service.add({...addArgs,dry_run:false}),'D365_SOLUTION_CONCURRENCY');
  await error(f.service.add({...addArgs,dry_run:false,expected_hash:preview.planHash}),'D365_SOLUTION_CONCURRENCY');
  assert.equal(writes(f).length,0);
});
test('source, membership and required-dependency changes invalidate a preview',async()=>{
  for(const change of ['source','members','edges']){
    const options={},f=fixture(options),preview=await f.service.add(addArgs);
    if(change==='source')options.source={name:'Changed'};
    if(change==='members')f.members.push(membership({solutioncomponentid:ids.other,objectid:ids.required}));
    if(change==='edges')options.edges=[];
    await error(f.service.add({...addArgs,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true}),'D365_SOLUTION_CONFLICT');assert.equal(writes(f).length,0);
  }
});
test('incomplete baselines block add instead of assuming missing dependencies',async()=>{
  const f=fixture({request:call=>{
    if(!call.path.startsWith('/Retrieve'))return undefined;
    const next=new URL(call.url);next.searchParams.set('$skiptoken',String(Number(next.searchParams.get('$skiptoken')||0)+1));
    return reply({value:[], '@odata.nextLink':next.href});
  }});
  await error(f.service.add(addArgs),'D365_SOLUTION_INCOMPLETE');assert.equal(writes(f).length,0);
});
test('cross-service/path/filter/selection/alias continuation changes are never followed',async()=>{
  for(const mutate of [url=>{url.host='evil.invalid';},url=>{url.pathname='/Demo/api/data/v9.1/webresourceset';},
    url=>{url.searchParams.set('$filter','ismanaged eq true');},url=>{url.searchParams.set('$select','content');},url=>{url.hash='secret';},
    url=>{url.searchParams.append('$top','9999');}]){
    const f=fixture({request:call=>{
      if(call.path!=='/solutioncomponents')return undefined;const next=new URL(call.url);mutate(next);
      return reply({value:[], '@odata.nextLink':next.href});
    }});
    await error(f.service.listComponents({solution_unique_name:'TestSolution'}));assert.equal(f.calls.length,2);
  }
  const f=fixture({request:call=>{if(!call.path.startsWith('/Retrieve'))return undefined;const next=new URL(call.url);next.searchParams.set('@p1',ids.other);return reply({value:[], '@odata.nextLink':next.href});}});
  await error(f.service.getDependencies({component_id:ids.object,component_type:61}),'D365_SOLUTION_PAGING_SCOPE');assert.equal(f.calls.length,2);
});
test('cyclic pages, duplicate membership and malformed dependency endpoints fail closed',async()=>{
  for(const options of [{members:[membership(),membership()]},{members:[membership({_solutionid_value:ids.other})]},
    {request:call=>call.path==='/solutioncomponents'?reply({value:[], '@odata.nextLink':call.url.href}):undefined},
    {request:call=>call.path==='/solutioncomponents'?reply({value:{}}):undefined}]){
    const f=fixture(options);await error(f.service.listComponents({solution_unique_name:'TestSolution'}));
  }
  await error(fixture({edges:[{...edge,requiredcomponentobjectid:'bad'}]}).service.getDependencies({component_id:ids.object,component_type:61}));
});
test('post-add missing/incorrect scope, truncated or failed readback retains saved=true',async()=>{
  for(const options of [{noMembership:true},{type:1,added:{rootcomponentbehavior:0}},{readbackError:new Error('SECRET_PLATFORM_TEXT')},
    {afterWrite:({target})=>{target.version='2.0.0.0';}},{response:{id:'bad'}}]){
    const f=fixture(options),result=await error(execute(f,{...addArgs,component_type:options.type??61}),'D365_SOLUTION_READBACK_FAILED');
    assert.equal(result.data.saved,true);assert.equal(result.data.phase,'readback');assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('SECRET_PLATFORM_TEXT'),false);
    assert.equal(result.outcome,undefined);
  }
});
test('incomplete post-add inventory retains Action success and blocks a false membership confirmation',async()=>{
  const f=fixture({request:(call,state)=>{
    if(!state.wrote||call.path!=='/solutioncomponents')return undefined;
    const next=new URL(call.url);next.searchParams.set('$skiptoken',String(Number(next.searchParams.get('$skiptoken')||0)+1));
    return reply({value:[], '@odata.nextLink':next.href});
  }});
  const result=await error(execute(f),'D365_SOLUTION_READBACK_FAILED');
  assert.equal(result.data.saved,true);assert.equal(result.data.cause,'D365_SOLUTION_READBACK_INCOMPLETE');assert.equal(writes(f).length,1);
});
test('unknown or rejected add is never replayed and never loses phase evidence',async()=>{
  for(const [cause,saved] of [[new Error('SECRET_TRANSPORT'),null],[new CrmRequestError('D365_TIMEOUT','SECRET',{outcome:'unknown'}),null],
    [new CrmRequestError('D365_HTTP_ERROR','SECRET',{status:403,outcome:'rejected'}),false]]){
    const f=fixture({writeError:cause}),result=await error(execute(f),'D365_SOLUTION_ADD_FAILED');
    assert.equal(result.data.saved,saved);assert.equal(result.data.phase,'add');assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('SECRET'),false);
  }
});
test('read permission errors remain distinct from empty collections',async()=>{
  const f=fixture({request:()=>{throw new CrmRequestError('D365_HTTP_ERROR','SECRET',{status:403,outcome:'rejected'});}});
  const result=await error(f.service.list({}),'D365_SOLUTION_REQUEST_FAILED');assert.equal(result.data.sourceStatus,'forbidden');assert.equal(result.status,403);
});
test('strict aliases, IDs and bounds reject unsupported input before mutation',async()=>{
  for(const args of [{...addArgs,component_id:'not-guid'},{...addArgs,componentId:ids.other},{...addArgs,component_id:'00000000-0000-0000-0000-000000000000'},
    {...addArgs,add_required_components:true},{...addArgs,solution_unique_name:"x' or true"},{...addArgs,dry_run:'false'}]){
    const f=fixture();await error(f.service.add(args));assert.equal(writes(f).length,0);
  }
  await error(fixture().service.list({top:5001}));await error(fixture().service.getDependencies({component_id:ids.object,component_type:61,direction:'unknown'}));
});
test('cancellation propagates across every tool and cancels before writes',async()=>{
  const signal=new AbortController().signal,f=fixture();await execute(f,addArgs,signal);assert.ok(f.calls.every(call=>call.options.signal===signal));
  const controller=new AbortController();controller.abort();
  for(const [method,args] of [['list',{}],['listComponents',{solution_unique_name:'TestSolution'}],['getDependencies',{component_id:ids.object,component_type:61}],['add',addArgs]]){
    const f=fixture();await error(f.service[method](args,controller.signal));assert.equal(writes(f).length,0);
  }
});
test('MCP routes all solution tools and forwards cancellation',async t=>{
  const signal=new AbortController().signal;
  const mappings=[['list_solutions','list'],['list_solution_components','listComponents'],['get_solution_component_dependencies','getDependencies'],['add_solution_component','add']];
  for(const [,method] of mappings)t.mock.method(SolutionService.prototype,method,async(_args,received)=>{assert.equal(received,signal);return {method};});
  const saved={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{for(const [tool,method] of mappings)assert.equal((await handleToolCall(tool,{},{signal})).method,method);}
  finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: real request branch reads dependencies, adds and rereads membership`,async t=>{
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
  const service=new SolutionService(client,{...env,authType}),preview=await service.add(addArgs);
  const result=await service.add({...addArgs,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true});
  assert.equal(result.saved,true);assert.equal(result.readback.membership[0].objectid,ids.object);assert.equal(writes(f).length,1);
});
