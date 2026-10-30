import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {RibbonDeploymentService} from '../src/services/ribbonDeployment.ts';
import {ribbonDeploymentTools} from '../src/tools/ribbonDeploymentTools.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';
import {customization,existingId} from './ribbon.fixture.mjs';
import {withFixture,submit,publish,imports,publishes,env,ids,csdl,successLog,solutionZip,manifest,add,tableId,publisherId,reply,effective} from './ribbonDeployment.fixture.mjs';
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);const p=toolErrorPayload(e);if(code)assert.equal(p.code,code);return p;}}
test('three deployment tools have schemas requiring both local packages and review scope flags',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const tool of ribbonDeploymentTools)ajv.compile(tool.inputSchema);
  const v=ajv.compile(ribbonDeploymentTools[0].inputSchema);assert.equal(v({sourceFilePath:'D:/source.zip',candidateFilePath:'D:/candidate.zip',logicalName:'demo_table',changes:[add]}),true);assert.equal(v({logical_name:'demo_table',changes:[add]}),false);assert.equal(v({source_file_path:'a',candidate_file_path:'b',logical_name:'demo_table',changes:[add],org_url:'https://evil.invalid'}),false);
});
test('import preview replays exact candidate and fresh whole-solution export baseline without importing or publishing',async()=>withFixture({},async f=>{
  const r=await f.service.import(f.args);assert.equal(r.dryRun,true);assert.equal(r.accepted,false);assert.equal(r.sourceBaseline,'fresh_export_payloads_matched');assert.match(r.scope,/entire_existing/);assert.equal(imports(f).length,0);assert.equal(publishes(f).length,0);
  assert.ok(f.calls.some(c=>c.path==='/ExportSolution'&&c.method==='POST'));assert.deepEqual(r.request.body.CustomizationFile,{sha256:r.candidateSha256,size:f.candidate.length});assert.equal(JSON.stringify(r).includes(f.candidate.toString('base64')),false);
}));
test('one async import returns receipt bound to package/target/caller and never polls or publishes automatically',async()=>withFixture({},async f=>{
  const r=await submit(f);assert.equal(r.accepted,true);assert.equal(r.completed,false);assert.equal(r.published,false);assert.equal(r.importReceipt.payload.candidateSha256,r.candidateSha256);assert.equal(r.importReceipt.payload.importJobId,r.importJobId);assert.match(r.importReceipt.mac,/^[a-f0-9]{64}$/);
  assert.equal(imports(f).length,1);assert.equal(publishes(f).length,0);assert.equal(f.calls.some(c=>c.path.startsWith('/asyncoperations(')),false);
  assert.equal(f.state.importBody.OverwriteUnmanagedCustomizations,false);assert.equal(f.state.importBody.PublishWorkflows,false);assert.equal(f.state.importBody.HoldingSolution,false);assert.equal(f.state.importBody.StageAndUpgrade,false);assert.deepEqual(f.state.importBody.ComponentParameters,[]);assert.equal(r.automaticPolling,false);
}));
test('an unchanged selected Ribbon is a no-op without a native import or fabricated receipt',async()=>withFixture({changes:[{operation:'set_visibility',button_id:existingId,visible:true}]},async f=>{
  const r=await submit(f);assert.equal(r.noChange,true);assert.equal(r.importSubmitted,false);assert.equal(r.accepted,false);assert.equal(r.importReceipt,undefined);assert.equal(imports(f).length,0);
}));
test('execution requires fingerprint, full package scope and explicit unprotected acceptance',async()=>withFixture({},async f=>{
  const p=await f.service.import(f.args);for(const extra of [{},{expected_hash:p.planHash},{expected_hash:p.planHash,allow_unprotected_write:true},{expected_hash:p.planHash,allow_full_solution_import:true}])await error(f.service.import({...f.args,dry_run:false,...extra}),'D365_SOLUTION_RIBBON_DEPLOY_REVIEW');assert.equal(imports(f).length,0);
}));
test('candidate tampering and changed structured edits fail before any CRM reads',async()=>withFixture({},async f=>{
  await writeFile(f.args.candidate_file_path,f.source);await error(f.service.import(f.args),'D365_SOLUTION_RIBBON_CANDIDATE_MISMATCH');assert.equal(f.calls.length,0);
}));
test('the importer is not an arbitrary existing-solution import backdoor',async()=>withFixture({},async f=>{
  await error(f.service.import({...f.args,changes:[{...add,function_name:'Demo.other'}]}),'D365_SOLUTION_RIBBON_CANDIDATE_MISMATCH');assert.equal(f.calls.length,0);
}));
for(const [label,options] of Object.entries({managed:{target:{ismanaged:true}},patch:{target:{_parentsolutionid_value:ids.job}},wrongVersion:{target:{version:'1.2.3.5'}},hidden:{target:{isvisible:false}},missing:{solutions:[]},
  wrongPublisher:{publisher:{uniquename:'OtherPublisher'}},wrongPrefix:{publisher:{customizationprefix:'other'}},noncustomizable:{table:{IsCustomizable:{Value:false}}},wrongTable:{table:{LogicalName:'account'}},missingMembership:{members:[]}}))test('target guard '+label+' blocks before import',async()=>withFixture(options,async f=>{
  await error(f.service.import(f.args));assert.equal(imports(f).length,0);assert.equal(publishes(f).length,0);
}));
test('a managed but customizable underlying table can receive an unmanaged Ribbon layer',async()=>withFixture({table:{IsManaged:true,IsCustomizable:{Value:true}}},async f=>{assert.equal((await submit(f)).accepted,true);}));
test('stale source payload, including unrelated XML and binaries, blocks whole-solution import',async()=>{
  for(const exportBytes of [solutionZip({customization:customization.replace('demo_preserved','demo_new_field')}),solutionZip({customization:customization.replace('Existing','Existing changed')})])await withFixture({exportBytes},async f=>{await error(f.service.import(f.args),'D365_SOLUTION_RIBBON_SOURCE_STALE');assert.equal(imports(f).length,0);});
});
test('fresh ZIP compression metadata is ignored while content and XML semantics remain checked',async()=>withFixture({exportBytes:solutionZip({method:0,descriptor:true})},async f=>{assert.equal((await submit(f)).accepted,true);}));
test('preflight export errors never claim an import was attempted or replay it',async()=>withFixture({request:c=>c.path==='/ExportSolution'?reply({message:'SECRET_EXPORT'},503):undefined},async f=>{
  const r=await error(f.service.import(f.args),'D365_SOLUTION_RIBBON_EXPORT_BASELINE');assert.equal(r.data.importSubmitted,false);assert.equal(r.data.accepted,false);assert.equal(r.outcome,'not_sent');assert.equal(imports(f).length,0);assert.equal(JSON.stringify(r).includes('SECRET_EXPORT'),false);
}));
test('caller and membership changes invalidate import review',async()=>withFixture({},async f=>{
  const p=await f.service.import(f.args);f.members[0].rootcomponentbehavior=0;await error(f.service.import({...f.args,dry_run:false,expected_hash:p.planHash,allow_full_solution_import:true,allow_unprotected_write:true}),'D365_SOLUTION_RIBBON_DEPLOY_CONFLICT');assert.equal(imports(f).length,0);
}));
test('a new native caller cannot publish a prior callers receipt',async()=>{
  let switched=false;await withFixture({request:c=>c.path==='/WhoAmI'&&switched?reply({OrganizationId:ids.org,UserId:ids.job,BusinessUnitId:ids.bu}):undefined},async f=>{
    const receipt=(await submit(f)).importReceipt;switched=true;await error(f.service.publish({...f.args,import_receipt:receipt}),'D365_SOLUTION_RIBBON_RECEIPT_TARGET');assert.equal(publishes(f).length,0);
  });
});
test('an unsupported native import contract never submits an unchecked fallback',async()=>withFixture({metadata:csdl.replace('Name="CustomizationFile" Type="Edm.Binary"','Name="CustomizationFile" Type="Edm.String"')},async f=>{
  await error(f.service.import(f.args),'D365_SOLUTION_NATIVE_CONTRACT_UNSUPPORTED');assert.equal(imports(f).length,0);
}));
for(const status of [400,403,429,500,503])test('import HTTP '+status+' retains acceptance phase/recovery ID without replay',async()=>withFixture({importStatus:status},async f=>{
  const r=await error(submit(f),'D365_SOLUTION_IMPORT_SUBMIT_FAILED');assert.equal(r.data.accepted,status>=500?null:false);assert.ok(r.data.importJobId);assert.equal(imports(f).length,1);assert.equal(publishes(f).length,0);assert.equal(JSON.stringify(r).includes('SECRET_IMPORT'),false);
}));
test('unknown import timeout is not automatically retried or published',async()=>withFixture({importError:new CrmRequestError('D365_TIMEOUT','SECRET',{outcome:'unknown'})},async f=>{
  const r=await error(submit(f),'D365_SOLUTION_IMPORT_SUBMIT_FAILED');assert.equal(r.data.accepted,null);assert.ok(r.data.importJobId);assert.equal(imports(f).length,1);assert.equal(r.data.importReceipt,undefined);
}));
test('malformed native acceptance keeps accepted=true and never mints a publish receipt',async()=>withFixture({importResponse:{}},async f=>{
  const r=await error(submit(f),'D365_SOLUTION_IMPORT_RECEIPT_INVALID');assert.equal(r.data.accepted,true);assert.equal(r.data.importReceipt,undefined);assert.ok(r.data.importJobId);assert.equal(imports(f).length,1);
}));
test('publish is separate, requires terminal native success and logs, and returns selected definition readback',async()=>withFixture({},async f=>{
  const receipt=(await submit(f)).importReceipt,p=await f.service.publish({...f.args,import_receipt:receipt});assert.equal(p.dryRun,true);assert.equal(p.published,false);assert.equal(publishes(f).length,0);assert.equal(p.pendingCustomizationContents,'not_read_or_locked');assert.match(p.scope,/entire_table/);assert.match(p.resourcePublication,/not_requested/);
  const r=await f.service.publish({...f.args,import_receipt:receipt,dry_run:false,expected_hash:p.planHash,allow_unprotected_write:true,allow_full_table_publish:true});
  assert.equal(r.published,true);assert.equal(r.importCompleted,true);assert.equal(r.readback.status,'matched');assert.equal(r.readback.uiVerified,false);assert.equal(r.deploymentVerified,false);assert.equal(imports(f).length,1);assert.equal(publishes(f).length,1);
  assert.equal(publishes(f)[0].body.ParameterXml,'<importexportxml><entities><entity>demo_table</entity></entities></importexportxml>');assert.equal(JSON.stringify(r).includes('SECRET_PARAMETER_LITERAL'),false);
}));
test('publish execution requires explicit whole-table scope and current review',async()=>withFixture({},async f=>{
  const receipt=(await submit(f)).importReceipt,args={...f.args,import_receipt:receipt},p=await f.service.publish(args);
  for(const extra of [{},{expected_hash:p.planHash},{expected_hash:p.planHash,allow_unprotected_write:true},{expected_hash:p.planHash,allow_full_table_publish:true}])await error(f.service.publish({...args,dry_run:false,...extra}),'D365_SOLUTION_RIBBON_DEPLOY_REVIEW');assert.equal(publishes(f).length,0);
}));
test('tampered receipts and another caller are rejected before publication',async()=>withFixture({},async f=>{
  const receipt=(await submit(f)).importReceipt,bad=structuredClone(receipt);bad.payload.candidateSha256='a'.repeat(64);const before=f.calls.length;
  await error(f.service.publish({...f.args,import_receipt:bad}),'D365_SOLUTION_RIBBON_RECEIPT');assert.equal(f.calls.length,before);
  const other=new RibbonDeploymentService(f.client,{...env,authType:'op_ifd'});await error(other.publish({...f.args,import_receipt:receipt}),'D365_SOLUTION_RIBBON_RECEIPT_TARGET');assert.equal(publishes(f).length,0);
}));
test('a receipt cannot be replayed across server processes and must not trigger a new import',async()=>withFixture({},async f=>{
  const receipt=(await submit(f)).importReceipt;
  const script="import {RibbonDeploymentService} from './src/services/ribbonDeployment.ts'; const receipt=JSON.parse(process.argv[1]); const client={requestWithResponse(){throw Error('NETWORK_MUST_NOT_RUN')}}; const service=new RibbonDeploymentService(client,{orgUrl:'https://crm.invalid/Demo',apiVersion:'v9.1',authType:'ad'}); service.publish({import_receipt:receipt}).then(()=>{process.exitCode=1}).catch(e=>{if(e.code!=='D365_SOLUTION_RIBBON_RECEIPT')process.exitCode=2});";
  execFileSync(process.execPath,['--require',fileURLToPath(new URL('./fixtures/deny-network.cjs',import.meta.url)),'--import','tsx','--input-type=module','-e',script,JSON.stringify(receipt)],{cwd:process.cwd(),timeout:10000,stdio:'pipe'});assert.equal(imports(f).length,1);
}));
for(const [label,options] of Object.entries({pending:{async:{statecode:2,statuscode:20}},failed:{async:{statecode:3,statuscode:31}},cancelled:{async:{statecode:3,statuscode:32}},wrongType:{async:{operationtype:10}},
  wrongSolution:{job:{solutionid:ids.job}},wrongName:{job:{solutionname:'Other'}},logFailure:{log:successLog.replace('result="success"','result="failure"')},unknownLog:{log:successLog.replace('result="success"','result="alien"')},
  emptyLog:{log:'<importexportxml/>'},unfinishedLog:{job:{completedon:null}},wrongManifest:{log:successLog.replace('TransferDemo','Other')}}))test('publication prerequisite '+label+' blocks PublishXml',async()=>withFixture(options,async f=>{
  const receipt=(await submit(f)).importReceipt;await error(f.service.publish({...f.args,import_receipt:receipt}));assert.equal(publishes(f).length,0);assert.equal(imports(f).length,1);
}));
test('progress 100 alone is not success and progress below 100 does not override verified terminal/log success',async()=>withFixture({job:{progress:80}},async f=>{
  assert.equal((await publish(f,(await submit(f)).importReceipt)).published,true);
}));
test('PublishXml contract must exist in current CSDL',async()=>withFixture({metadata:csdl.replace('<ActionImport Name="PublishXml"','<ActionImport Name="OtherPublish"')},async f=>{
  const receipt=(await submit(f)).importReceipt;await error(f.service.publish({...f.args,import_receipt:receipt}),'D365_SOLUTION_RIBBON_PUBLISH_UNSUPPORTED');assert.equal(publishes(f).length,0);
}));
test('non-Ribbon export drift after import blocks publication rather than publishing it silently',async()=>withFixture({},async f=>{
  const receipt=(await submit(f)).importReceipt;f.state.exportBytes=solutionZip({customization:customization.replace('demo_preserved','unrelated_changed_field')});
  await error(f.service.publish({...f.args,import_receipt:receipt}),'D365_SOLUTION_RIBBON_PUBLISH_BASELINE');assert.equal(publishes(f).length,0);assert.equal(imports(f).length,1);
}));
test('definition label ordering does not create a false readback difference',async()=>withFixture({},async f=>{
  const native=effective(f.candidate),swapped=native.replace(/(<Title languagecode="1033"[^>]*\/>)(<Title languagecode="2052"[^>]*\/>)/g,'$2$1');
  // Install the reordered native response without changing any label values.
  const original=f.client.requestWithResponse.bind(f.client);f.client.requestWithResponse=async(...args)=>args[0].startsWith('/RetrieveEntityRibbon(')?reply({CompressedEntityXml:(await import('./solutionTransfer.fixture.mjs')).archive({entries:[{name:'RibbonXml.xml',content:swapped}]}).toString('base64')}):original(...args);
  assert.equal((await f.service.verify(f.args)).readback.status,'matched');
}));
for(const status of [403,429,500])test('publish HTTP '+status+' never reimports or automatically republishes',async()=>withFixture({publishStatus:status},async f=>{
  const receipt=(await submit(f)).importReceipt,r=await error(publish(f,receipt),'D365_SOLUTION_RIBBON_PUBLISH_FAILED');assert.equal(r.data.published,status>=500?null:false);assert.equal(r.data.importCompleted,true);assert.equal(imports(f).length,1);assert.equal(publishes(f).length,1);assert.equal(JSON.stringify(r).includes('SECRET_PUBLISH'),false);
}));
test('publication accepted then failed readback keeps published=true and safe evidence',async()=>withFixture({readbackError:new CrmRequestError('D365_HTTP_ERROR','SECRET_READBACK',{status:403,outcome:'rejected'})},async f=>{
  const r=await error(publish(f,(await submit(f)).importReceipt),'D365_SOLUTION_RIBBON_PUBLISH_READBACK_FAILED');assert.equal(r.data.published,true);assert.equal(r.data.phase,'readback');assert.equal(r.outcome,undefined);assert.equal(imports(f).length,1);assert.equal(publishes(f).length,1);assert.equal(JSON.stringify(r).includes('SECRET_READBACK'),false);
}));
test('wrong effective button definition keeps publication evidence and reports mismatch',async()=>withFixture({publishedXml:'<RibbonDefinitions><RibbonDefinition/></RibbonDefinitions>'},async f=>{
  const r=await error(publish(f,(await submit(f)).importReceipt),'D365_SOLUTION_RIBBON_PUBLISH_READBACK_FAILED');assert.equal(r.data.published,true);assert.equal(r.data.readback.status,'inconclusive');assert.equal(publishes(f).length,1);
}));
test('read-only verification works without a receipt and never claims import, publication or runtime proof',async()=>withFixture({},async f=>{
  const before=await f.service.verify(f.args);assert.equal(before.readback.status,'inconclusive');f.state.published=true;
  const r=await f.service.verify(f.args);assert.equal(r.readback.status,'matched');assert.equal(r.imported,'not_proven_by_this_read');assert.equal(r.published,'not_proven_by_this_read');assert.equal(r.runtimeVerified,false);assert.equal(r.deploymentVerified,false);assert.equal(imports(f).length,0);assert.equal(publishes(f).length,0);assert.ok(f.calls.every(c=>c.method==='GET'));
}));
test('native action parameter or label mismatch cannot be reported as a definition match',async()=>withFixture({publishedXml:effective((await import('../src/services/ribbon.ts')).buildRibbonCandidate(solutionZip(),'demo_table',[{...add,function_name:'Demo.wrong'}]).candidate)},async f=>{
  f.state.published=true;const r=await f.service.verify(f.args);assert.equal(r.readback.status,'different');assert.ok(r.readback.items[0].checks.some(c=>c.property==='command_definition'&&c.status==='different'));
}));
test('cancellation and invalid aliases/paths prevent native submission',async()=>withFixture({},async f=>{
  const c=new AbortController();c.abort();await error(f.service.import(f.args,c.signal),'D365_REQUEST_ABORTED');await error(f.service.verify(f.args,c.signal),'D365_REQUEST_ABORTED');assert.equal(f.calls.length,0);
  await error(f.service.import({...f.args,logicalName:'other'}),'D365_SOLUTION_RIBBON_DEPLOY_INVALID');await error(f.service.import({...f.args,source_file_path:'relative.zip'}),'D365_SOLUTION_INVALID');assert.equal(f.calls.length,0);
}));
test('MCP dispatch forwards the shared cancellation signal for all three tools',async t=>{
  const signal=new AbortController().signal,mappings=[['import_ribbon_solution','import'],['publish_ribbon_solution','publish'],['verify_ribbon_deployment','verify']];
  for(const [,method] of mappings)t.mock.method(RibbonDeploymentService.prototype,method,async(_args,received)=>{assert.equal(received,signal);return {method};});
  const before={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{for(const [tool,method] of mappings)assert.equal((await handleToolCall(tool,{},{signal})).method,method);}finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: real request branch imports, independently publishes and reads definitions using mocked transport`,async t=>withFixture({},async f=>{
  t.mock.method(axios,'post',async()=>({data:{access_token:'offline-token',expires_in:3600}}));const config=readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:env.apiVersion,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'}),client=new D365AuthService(config);
  client.getAxiosInstance().defaults.adapter=async c=>{const url=new URL(c.url);assert.equal(url.origin,'https://crm.invalid');assert.ok(url.pathname.startsWith('/Demo/api/data/v9.1/'));const r=await f.client.requestWithResponse(decodeURI(url.pathname.replace('/Demo/api/data/v9.1',''))+url.search,c.method.toUpperCase(),c.data?JSON.parse(c.data):undefined,{signal:c.signal});return {config:c,status:r.status,statusText:'OK',data:r.data,headers:new AxiosHeaders(r.headers)};};
  const service=new RibbonDeploymentService(client,{...env,authType}),accepted=await submit(f,service),r=await publish(f,accepted.importReceipt,service);assert.equal(r.published,true);assert.equal(r.readback.status,'matched');assert.equal(imports(f).length,1);assert.equal(publishes(f).length,1);
}));
