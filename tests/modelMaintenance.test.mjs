import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {ModelMaintenanceService} from '../src/services/modelMaintenance.ts';
import {modelMaintenanceTools} from '../src/tools/modelMaintenanceTools.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';
import {fixture,execute,writes,fieldArgs,relationshipArgs,keyArgs,ids,env,label} from './modelMaintenance.fixture.mjs';
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);
  const result=toolErrorPayload(e);if(code)assert.equal(result.code,code);return result;}}
test('schemas support canonical/camel aliases and reject unknown schema mutations',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const tool of modelMaintenanceTools)ajv.compile(tool.inputSchema);
  const field=ajv.compile(modelMaintenanceTools[0].inputSchema);
  assert.equal(field({logicalName:'new_sample',attributeName:'new_title',solutionUniqueName:'TestSolution',patch:{maxLength:200}}),true);
  assert.equal(field({...fieldArgs,patch:{schema_name:'other'}}),false);
  const relation=ajv.compile(modelMaintenanceTools[1].inputSchema);assert.equal(relation({...relationshipArgs,patch:{entity1Menu:{order:300}}}),true);
});
test('field preview preserves complete native definition and strips transport/per-user labels',async()=>{
  const f=fixture(),result=await f.service.updateColumn(fieldArgs);
  assert.equal(result.dryRun,true);assert.equal(writes(f).length,0);assert.equal(result.request.method,'PUT');
  assert.equal(result.request.body.MaxLength,200);assert.deepEqual(result.request.body.CustomUnknownProperty,{keep:'this'});
  assert.equal(result.request.body.DisplayName.LocalizedLabels.length,2);assert.equal(result.request.body.DisplayName.UserLocalizedLabel,undefined);
  assert.equal(result.request.body['@odata.context'],undefined);assert.match(result.request.body['@odata.type'],/StringAttributeMetadata$/);
  assert.equal(result.request.headers['MSCRM.MergeLabels'],'true');assert.equal(result.concurrency,'unprotected_native_put');
  assert.match(result.planHash,/^[a-f0-9]{64}$/);assert.ok(f.calls.filter(c=>c.method==='GET').every(c=>c.options.headers.Consistency==='Strong'));
});
for(const [kind,patch] of [['String',{max_length:200}],['Memo',{max_length:2000}],['Integer',{min_value:-10,max_value:200}],
  ['Decimal',{min_value:-1,max_value:1000,precision:4}],['Money',{max_value:200,precision:4}],['DateTime',{format:'DateOnly'}],
  ['Boolean',{default_value:true}],['Picklist',{default_value:2}],['MultiSelectPicklist',{required_level:'Recommended'}]])
test(`${kind}: settings are applied by one PUT and read back without publication`,async()=>{
  const f=fixture({kind}),result=await execute(f,{...fieldArgs,patch},'updateColumn');
  assert.equal(result.saved,true);assert.equal(result.readback.status,'matched');assert.equal(result.publication,'not_requested');
  assert.equal(writes(f).length,1);assert.equal(writes(f)[0].method,'PUT');assert.equal(f.calls.some(c=>c.endpoint.includes('Publish')),false);
  assert.equal(writes(f)[0].options.headers['If-Match'],undefined);
  if(['Boolean','Picklist','MultiSelectPicklist'].includes(kind))assert.ok(writes(f)[0].body.OptionSet);
});
test('managed setting values preserve metadata flags and are verified',async()=>{
  const f=fixture(),result=await execute(f,{...fieldArgs,patch:{requiredLevel:'ApplicationRequired',isAuditEnabled:true,isValidForAdvancedFind:false}},'updateColumn');
  assert.equal(result.saved,true);const body=writes(f)[0].body;
  assert.equal(body.RequiredLevel.ManagedPropertyLogicalName,'keep-native-name');assert.equal(body.RequiredLevel.Value,'ApplicationRequired');
  assert.equal(body.IsAuditEnabled.Value,true);assert.equal(body.IsValidForAdvancedFind.Value,false);
  assert.equal(result.existingDataValidation,'not_scanned');
});
test('type-specific settings, unknown keys and conflicting aliases are rejected',async()=>{
  for(const [kind,patch] of [['String',{precision:3}],['Integer',{precision:3}],['DateTime',{date_time_behavior:'DateOnly'}],
    ['MultiSelectPicklist',{default_value:1}],['Boolean',{default_value:1}],['Picklist',{default_value:true}],['Picklist',{default_value:9}],
    ['String',{max_length:200,maxLength:300}],['String',{schema_name:'new_Other'}]]){
    const f=fixture({kind});await error(f.service.updateColumn({...fieldArgs,patch}));assert.equal(writes(f).length,0);
  }
});
test('text, range and precision reductions are blocked; bounds remain type-specific',async()=>{
  for(const [kind,patch,column] of [['String',{max_length:50}],['String',{max_length:4001}],['Memo',{max_length:1048577}],
    ['Integer',{min_value:10}],['Integer',{max_value:50}],['Integer',{min_value:0.5}],['Decimal',{min_value:null}],
    ['Decimal',{min_value:200,max_value:100}],['Money',{precision:1}],['Decimal',{precision:11}],['Money',{precision:4},{PrecisionSource:2}]]){
    const f=fixture({kind,column});await error(f.service.updateColumn({...fieldArgs,patch}));assert.equal(writes(f).length,0);
  }
});
test('unmanaged/custom/simple-storage and parent-provider guards fail closed',async()=>{
  for(const column of [{IsManaged:true},{IsManaged:undefined},{IsCustomAttribute:false},{IsPrimaryId:true},{IsPrimaryName:true},
    {IsLogical:true},{SourceType:1},{SourceType:2},{SourceType:undefined},{AttributeOf:'parent'},{AutoNumberFormat:'{SEQNUM:5}'},
    {IsCustomizable:{Value:false}},{SchemaName:'other_Title'}]){
    const f=fixture({column});await error(f.service.updateColumn(fieldArgs));assert.equal(writes(f).length,0);
  }
  for(const table of [{IsCustomizable:{Value:false}},{DataProviderId:ids.table}])await error(fixture({table}).service.updateColumn(fieldArgs));
});
test('managed property permissions, system-required level and DateOnly behavior are respected',async()=>{
  for(const [column,patch] of [[{RequiredLevel:{Value:'SystemRequired',CanBeChanged:true}},{required_level:'None'}],
    [{RequiredLevel:{Value:'None',CanBeChanged:false}},{required_level:'Recommended'}],
    [{IsAuditEnabled:{Value:false,CanBeChanged:false}},{is_audit_enabled:true}],
    [{CanModifyAdditionalSettings:{Value:false}},{max_length:200}]])await error(fixture({column}).service.updateColumn({...fieldArgs,patch}));
  const f=fixture({kind:'DateTime',column:{Format:'DateOnly',DateTimeBehavior:{Value:'DateOnly'}}});
  await error(f.service.updateColumn({...fieldArgs,patch:{format:'DateAndTime'}}));
});
test('no-change field settings and relationship settings send no PUT after review',async()=>{
  const f=fixture(),result=await execute(f,{...fieldArgs,patch:{max_length:100}},'updateColumn');
  assert.equal(result.noChange,true);assert.equal(result.saved,false);assert.equal(writes(f).length,0);
  const r=fixture(),relation=await execute(r,{...relationshipArgs,patch:{menu:{order:100}}},'updateRelationship');
  assert.equal(relation.noChange,true);assert.equal(writes(r).length,0);
});
test('execution requires preview planHash and explicit unprotected write for all maintenance tools',async()=>{
  for(const [method,args] of [['updateColumn',fieldArgs],['updateRelationship',relationshipArgs],['reactivateKey',keyArgs]]){
    const f=fixture(),preview=await f.service[method](args);
    await error(f.service[method]({...args,dry_run:false}),'D365_MODEL_CONCURRENCY');
    await error(f.service[method]({...args,dry_run:false,expected_hash:preview.planHash}),'D365_MODEL_CONCURRENCY');
    await error(f.service[method]({...args,dry_run:false,expected_hash:'0'.repeat(64),allow_unprotected_write:true}),'D365_MODEL_CONFLICT');
    assert.equal(writes(f).length,0);
  }
});
test('review binds the patch, native target and key index state',async()=>{
  const f=fixture(),preview=await f.service.updateColumn(fieldArgs);
  await error(f.service.updateColumn({...fieldArgs,patch:{max_length:300},dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true}),'D365_MODEL_CONFLICT');
  f.column.CustomUnknownProperty.keep='changed';
  await error(f.service.updateColumn({...fieldArgs,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true}),'D365_MODEL_CONFLICT');
  const k=fixture(),plan=await k.service.reactivateKey(keyArgs);k.key.EntityKeyIndexStatus='Pending';
  await error(k.service.reactivateKey({...keyArgs,dry_run:false,expected_hash:plan.planHash,allow_unprotected_write:true}),'D365_MODEL_CONFLICT');
});
test('column readback mismatch, choice drift and failure retain saved=true',async()=>{
  for(const options of [{afterWrite:({column})=>{column.MaxLength=201;}},{kind:'Boolean',afterWrite:({column})=>{column.OptionSet.TrueOption.Label.LocalizedLabels[0].Label='Changed';}},
    {readbackError:new Error('secret-platform-output')}]){
    const f=fixture(options),args=options.kind?{...fieldArgs,patch:{default_value:true}}:fieldArgs;
    const result=await error(execute(f,args,'updateColumn'));
    assert.equal(result.data.saved,true);assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('secret-platform-output'),false);
  }
});
test('readback tolerates native HasChanged and localized label order only',async()=>{
  const f=fixture({afterWrite:({column})=>{column.HasChanged=true;column.DisplayName.LocalizedLabels.reverse();}});
  assert.equal((await execute(f,fieldArgs,'updateColumn')).saved,true);
});
test('1:N relationship preview merges one menu language and preserves cascade/identity/unknown properties',async()=>{
  const f=fixture(),result=await f.service.updateRelationship({...relationshipArgs,patch:{menu:{label:[{language_code:1033,text:'Accounts'}]}}});
  const body=result.request.body;assert.equal(body.AssociatedMenuConfiguration.Label.LocalizedLabels.find(x=>x.LanguageCode===2052).Label,'中文');
  assert.equal(body.AssociatedMenuConfiguration.Label.LocalizedLabels.find(x=>x.LanguageCode===1033).Label,'Accounts');
  assert.equal(body.AssociatedMenuConfiguration.ViewId,ids.table);assert.equal(body.AssociatedMenuConfiguration.MenuId,'keep-menu-id');
  assert.equal(body.ReferencingAttribute,'new_accountid');assert.equal(body.UnknownNativeFlag,'preserve');
  assert.equal(body.CascadeConfiguration.Delete,'Restrict');assert.equal(writes(f).length,0);
});
test('1:N cascade patch preserves omitted native cascade values and saves once',async()=>{
  const f=fixture(),result=await execute(f,{...relationshipArgs,patch:{cascade:{assign:'Cascade',delete:'RemoveLink'}}},'updateRelationship');
  assert.equal(result.saved,true);assert.equal(result.publication,'not_requested');assert.equal(writes(f).length,1);
  assert.equal(writes(f)[0].body.CascadeConfiguration.Merge,'NoCascade');assert.equal(writes(f)[0].body.CascadeConfiguration.RollupView,'NoCascade');
  assert.match(result.cascadeImpact,/ownership_or_access/);assert.equal(f.calls.some(c=>c.endpoint.includes('/Attributes(')),false);
});
test('N:N supports independent per-side menus and preserves intersect/table identity',async()=>{
  const f=fixture({many:true}),result=await execute(f,{...relationshipArgs,patch:{entity1Menu:{order:400},entity_2_menu:{behavior:'DoNotDisplay'}}},'updateRelationship');
  assert.equal(result.saved,true);assert.equal(writes(f)[0].body.Entity1AssociatedMenuConfiguration.Order,400);
  assert.equal(writes(f)[0].body.Entity2AssociatedMenuConfiguration.Behavior,'DoNotDisplay');assert.equal(writes(f)[0].body.IntersectEntityName,'new_intersect');
});
test('relationship managed/menu/prefix/type boundaries and invalid cascades block PUT',async()=>{
  for(const [options,patch] of [[{relationship:{IsManaged:true}},{menu:{order:200}}],
    [{relationship:{IsCustomRelationship:false}},{menu:{order:200}}],
    [{relationship:{AssociatedMenuConfiguration:{Behavior:'UseLabel',IsCustomizable:false,Label:label()}}},{menu:{order:200}}],
    [{many:true},{cascade:{delete:'Restrict'}}],[{},{entity_1_menu:{order:200}}],[{},{cascade:{assign:'Active'}}],
    [{},{menu:{order:-1}}],[{},{menu:{group:'Other'}}],[{},{cascade:{}}],[{},{menu:{}}]]){
    const f=fixture(options);await error(f.service.updateRelationship({...relationshipArgs,patch}));assert.equal(writes(f).length,0);
  }
});
test('relationship readback verifies unchanged lookup identity and both native settings',async()=>{
  for(const afterWrite of [({relation})=>{relation.ReferencingAttribute='new_other';},({relation})=>{relation.CascadeConfiguration.Delete='Cascade';}]){
    const f=fixture({afterWrite});const result=await error(execute(f,relationshipArgs,'updateRelationship'),'D365_MODEL_READBACK_MISMATCH');
    assert.equal(result.data.saved,true);assert.equal(writes(f).length,1);
  }
});
test('Failed key preview uses native logical name and never recreates key',async()=>{
  const f=fixture(),result=await f.service.reactivateKey(keyArgs);
  assert.equal(result.canSubmit,true);assert.equal(result.submitted,false);assert.equal(result.request.path,'/ReactivateEntityKey');
  assert.deepEqual(result.request.body,{EntityKeyLogicalName:'new_referencekey',EntityLogicalName:'new_sample'});assert.equal(writes(f).length,0);
});
for(const [status,usable,operation] of [['Pending',false,'job_observed'],['InProgress',false,'job_observed'],['Active',true,'index_active']])
test(`reactivation accepts Action and observes ${status} without claiming early activation`,async()=>{
  const f=fixture({indexAfter:status}),result=await execute(f,keyArgs,'reactivateKey');
  assert.equal(result.submitted,true);assert.equal(result.jobLinkConfirmed,true);assert.equal(result.operationStatus,operation);
  assert.equal(result.index.usableForAlternateKeyOperations,usable);assert.equal(result.canSubmit,false);
  assert.equal(writes(f).length,1);assert.equal(writes(f)[0].endpoint,'/ReactivateEntityKey');assert.equal(f.calls.some(c=>c.endpoint.startsWith('/asyncoperations')),false);
});
test('Active/Pending/InProgress/Unknown key previews block resubmission',async()=>{
  for(const state of ['Active','Pending','InProgress','Unknown']){
    const f=fixture({key:{EntityKeyIndexStatus:state}}),preview=await f.service.reactivateKey(keyArgs);
    assert.equal(preview.canSubmit,false);assert.equal(preview.blockedBy,'INDEX_NOT_FAILED');
    await error(f.service.reactivateKey({...keyArgs,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true}),'D365_MODEL_KEY_STATE');assert.equal(writes(f).length,0);
  }
});
test('Action acceptance with delayed metadata remains separate from a new job confirmation',async()=>{
  const f=fixture({delay:true}),result=await execute(f,keyArgs,'reactivateKey');
  assert.equal(result.submitted,true);assert.equal(result.jobLinkConfirmed,false);assert.equal(result.operationStatus,'accepted_new_job_not_confirmed');
  assert.equal(result.index.status,'Failed');assert.equal(result.canSubmit,false);assert.equal(writes(f).length,1);
});
test('numeric Failed/Active states and case-only job ID changes preserve index/job distinction',async()=>{
  const f=fixture({key:{EntityKeyIndexStatus:3,AsyncJob:'ABCDEFAB-ABCD-ABCD-ABCD-ABCDEFABCDEF'},indexAfter:2,jobAfter:'abcdefab-abcd-abcd-abcd-abcdefabcdef'});
  const result=await execute(f,keyArgs,'reactivateKey');
  assert.equal(result.submitted,true);assert.equal(result.index.status,'Active');assert.equal(result.index.usableForAlternateKeyOperations,true);
  assert.equal(result.jobLinkConfirmed,false);assert.equal(result.operationStatus,'accepted_new_job_not_confirmed');
});
test('new index job failure and readback identity changes retain submitted=true',async()=>{
  for(const options of [{indexAfter:'Failed'},{readbackError:new Error('secret')},{afterWrite:({key})=>{key.KeyAttributes=['other'];}}]){
    const f=fixture(options),result=await error(execute(f,keyArgs,'reactivateKey'));
    assert.equal(result.data.submitted,true);assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('secret'),false);
    if(options.indexAfter)assert.equal(result.code,'D365_MODEL_KEY_INDEX_FAILED');
  }
});
test('key scope, native identity, managed metadata and paging fail closed',async()=>{
  for(const options of [{key:{IsManaged:true}},{key:{IsCustomizable:{Value:false}}},{key:{EntityLogicalName:'account'}},
    {key:{LogicalName:undefined}},{keyNext:true},{table:{DataProviderId:ids.table}}]){
    const f=fixture(options);await error(f.service.reactivateKey(keyArgs));assert.equal(writes(f).length,0);assert.equal(f.calls.some(c=>c.endpoint.includes('evil')),false);
  }
});
test('metadata PUT rejection/unknown and Action rejection/unknown are never replayed',async()=>{
  for(const [cause,saved] of [[new CrmRequestError('D365_HTTP_ERROR','secret',{status:400,outcome:'rejected'}),false],
    [new CrmRequestError('D365_TIMEOUT','secret',{outcome:'unknown'}),null],[new Error('secret'),null]]){
    for(const [method,args,field] of [['updateColumn',fieldArgs,'saved'],['updateRelationship',relationshipArgs,'saved'],['reactivateKey',keyArgs,'submitted']]){
      const f=fixture({writeError:cause}),result=await error(execute(f,args,method));
      assert.equal(result.data[field],saved);assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('secret'),false);
    }
  }
});
test('all maintenance paths propagate cancellation and send no write on pre-abort',async()=>{
  const controller=new AbortController();controller.abort();
  for(const [method,args] of [['updateColumn',fieldArgs],['updateRelationship',relationshipArgs],['reactivateKey',keyArgs]]){
    const f=fixture();await error(f.service[method](args,controller.signal),'D365_REQUEST_ABORTED');assert.equal(writes(f).length,0);
  }
});
test('handler routes all maintenance tools and cancellation',async t=>{
  const signal=new AbortController().signal;for(const method of ['updateColumn','updateRelationship','reactivateKey'])t.mock.method(ModelMaintenanceService.prototype,method,
    async (_args,received)=>{assert.equal(received,signal);return {method};});
  const saved={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{for(const [tool,method] of [['update_model_column_settings','updateColumn'],['update_model_relationship','updateRelationship'],['reactivate_model_key','reactivateKey']])
    assert.equal((await handleToolCall(tool,{},{signal})).method,method);}
  finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: actual request branch sends full metadata PUT and native key Action`,async t=>{
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
  const service=new ModelMaintenanceService(client,{...env,authType});
  for(const [method,args] of [['updateColumn',fieldArgs],['updateRelationship',relationshipArgs],['reactivateKey',keyArgs]]){
    const preview=await service[method](args);const result=await service[method]({...args,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true});
    assert.equal(result.saved ?? result.submitted,true);
  }
  assert.equal(writes(f).length,3);assert.equal(writes(f)[0].options.headers['MSCRM.MergeLabels'],'true');
});
