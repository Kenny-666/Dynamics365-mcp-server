import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {digest} from '../src/services/apiOperationMetadata.ts';
import {compareSolutionSnapshots,SolutionSnapshotService} from '../src/services/solutionSnapshot.ts';
import {snapshotDigest,validateSnapshot} from '../src/services/solutionSnapshotValues.ts';
import {SolutionImportLogService} from '../src/services/solutionImportLog.ts';
import {SolutionVerificationService} from '../src/services/solutionVerification.ts';
import {solutionVerificationTools} from '../src/tools/solutionVerificationTools.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';
import {fixture,capture,env,ids,guid,label,logXml,writes,reply} from './solutionVerification.fixture.mjs';
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);const p=toolErrorPayload(e);if(code)assert.equal(p.code,code);return p;}}
const compare=(source,target,options={})=>compareSolutionSnapshots({source_snapshot:source,target_snapshot:target,...options});
const rehash=s=>{s.snapshotHash=snapshotDigest(s);return s;};
const component=(s,type)=>s.components.find(c=>c.componentType===type);
test('four read-only tools expose valid schemas and aliases without defaults masking conflicts',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const t of solutionVerificationTools){ajv.compile(t.inputSchema);assert.equal(t.annotations.readOnlyHint,true);}
  const validate=ajv.compile(solutionVerificationTools[0].inputSchema);assert.equal(validate({solutionUniqueName:'TransferDemo'}),true);assert.equal(validate({solution_unique_name:'TransferDemo',top:201}),false);
  assert.equal(ajv.compile(solutionVerificationTools[3].inputSchema)({importJobId:ids.job,includeText:false}),true);
});
test('capture reads five selected profiles without returning code, DLL bytes, settings or per-user labels',async()=>{
  const f=fixture(),s=await capture(f);assert.equal(s.format,'d365.solution.snapshot.v1');assert.equal(s.components.length,5);assert.equal(s.coverage.definitionReadsComplete,true);assert.equal(s.coverage.inventoryComplete,true);assert.equal(s.coverage.membershipStable,true);assert.equal(s.coverage.atomic,false);assert.equal(s.coverage.nestedComponentsExpanded,false);
  assert.equal(validateSnapshot(s),s);assert.equal(writes(f).length,0);assert.equal(f.calls.filter(c=>c.path==='/solutioncomponents').length,2);
  const output=JSON.stringify(s);for(const forbidden of ['SECRET_','console.log','inert-not-a-DLL','UserLocalizedLabel','CanBeChanged'])assert.equal(output.includes(forbidden),false);
  for(const type of [61,91])assert.match(component(s,type).definition.contentSha256,/^[a-f0-9]{64}$/);
  assert.ok(f.calls.every(c=>!c.path.startsWith('/RetrieveUnpublished')&&!c.path.startsWith('/Publish')));
});
test('different environment and object/member/label GUIDs do not cause false component differences',async()=>{
  const a=await capture(fixture()),b=await capture(fixture({variant:1})),result=await compare(a,b);
  assert.notEqual(a.identity.organizationId,b.identity.organizationId);assert.notEqual(a.solution.solutionid,b.solution.solutionid);assert.equal(result.selectedScopeCheck,'matched');assert.equal(result.matched.length,5);assert.equal(result.knownDifferences,0);assert.equal(result.deploymentVerified,false);
});
test('label language and option value order is canonical; transport metadata and user labels are ignored',async()=>{
  const f=fixture({variant:1});for(const source of Object.values(f.sources))for(const value of Object.values(source))if(value?.LocalizedLabels)value.LocalizedLabels.reverse();
  f.sources[9].Options.reverse();const a=await capture(fixture()),b=await capture(f),result=await compare(a,b);assert.equal(result.selectedScopeCheck,'matched');assert.match(result.note,/Option display order/);
});
for(const [type,changes,path] of [[1,{OwnershipType:'OrganizationOwned'},'/OwnershipType'],[1,{IsAuditEnabled:{Value:false}},'/IsAuditEnabled'],
  [9,{DisplayName:label('Changed')},'/DisplayName/LocalizedLabels'],[10,{ReferencingAttribute:'demo_other'},'/ReferencingAttribute'],
  [61,{content:Buffer.from('changed code').toString('base64')},'/contentSha256'],[91,{version:'1.2.3.5'},'/version']])test(`type ${type}: selected change is mapped to portable component and property path ${path}`,async()=>{
  const source=await capture(fixture()),target=await capture(fixture({variant:1,sources:{[type]:changes}})),r=await compare(source,target);
  assert.equal(r.selectedScopeCheck,'different');assert.equal(r.changed.length,1);assert.equal(r.changed[0].componentType,type);assert.ok(r.changed[0].paths.includes(path));assert.notEqual(r.changed[0].source.objectId,r.changed[0].target.objectId);assert.equal(r.deploymentVerified,false);
});
test('missing and extra membership use portable keys rather than environment IDs',async()=>{
  const source=fixture(),target=fixture({variant:1});target.members.splice(3,1);const extra={...target.members[0],solutioncomponentid:guid(9999,1),objectid:guid(1,1)};target.members.push(extra);
  // The duplicate table is ambiguous, and the known missing Web Resource is still visible.
  const result=await compare(await capture(source),await capture(target));assert.equal(result.selectedScopeCheck,'inconclusive');assert.equal(result.missingInTarget.length,1);assert.match(result.missingInTarget[0].key,/61:/);assert.ok(result.ambiguousKeys.includes('1:demo_table'));
});
test('managed target state can be explicitly expected without ignoring version differences',async()=>{
  const a=await capture(fixture()),b=await capture(fixture({variant:1,solution:{ismanaged:true}}));assert.equal((await compare(a,b)).selectedScopeCheck,'different');assert.equal((await compare(a,b,{expected_managed:true})).selectedScopeCheck,'matched');
  const f=fixture({solution:{ismanaged:true,version:'1.2.3.5'}});assert.equal((await compare(a,await capture(f),{expected_managed:true})).solutionDifferences[0].property,'version');
});
test('root membership ID differences normalize through portable root keys',async()=>{
  const f=fixture(),g=fixture({variant:1});for(const x of [f,g])x.members[3].rootsolutioncomponentid=x.members[0].solutioncomponentid;
  assert.equal((await compare(await capture(f),await capture(g))).selectedScopeCheck,'matched');g.members[3].rootcomponentbehavior=0;
  const diff=await compare(await capture(f),await capture(g));assert.ok(diff.changed[0].paths.includes('/membership/rootBehavior'));
});
test('unresolved/unknown/cyclic membership roots cannot pass selected-scope comparison',async()=>{
  const a=await capture(fixture());for(const mutate of [s=>{component(s,61).rootMembershipId=guid(8888);},s=>{component(s,61).rootBehavior=null;},s=>{component(s,61).rootMembershipId=component(s,1).membershipId;component(s,1).rootMembershipId=component(s,61).membershipId;}]){
    const b=structuredClone(a);mutate(b);rehash(b);const r=await compare(a,b);assert.equal(r.selectedScopeCheck,'inconclusive');assert.ok(r.unknownMembershipScopes.target.length>0);
  }
});
test('unsupported explicit components remain evidence gaps and are never silently skipped',async()=>{
  const f=fixture();f.members.push({...f.members[0],solutioncomponentid:guid(802),objectid:guid(2),componenttype:2});const s=await capture(f),r=await compare(s,s);
  assert.equal(s.components.length,6);assert.equal(component(s,2).status,'unsupported');assert.equal(r.selectedScopeCheck,'inconclusive');assert.equal(r.sourceGaps[0].componentType,2);
});
test('null object IDs and missing selected properties produce inconclusive evidence',async()=>{
  const f=fixture();f.members[0].objectid=null;const s=await capture(f);assert.equal(component(s,1).issue,'null_object_id');assert.equal((await compare(s,s)).selectedScopeCheck,'inconclusive');
  const g=fixture();delete g.sources[1].IsActivity;assert.equal(component(await capture(g),1).status,'failed');
});
for(const status of [403,404,500])test(`component read HTTP ${status} is not absence or a successful comparison`,async()=>{
  const f=fixture({request:c=>c.path.startsWith('/webresourceset(')?reply({message:'SECRET_PLATFORM'},status):undefined}),s=await capture(f);
  assert.equal(component(s,61).status,status===403?'forbidden':status===404?'unavailable_or_hidden':'failed');assert.equal((await compare(s,s)).selectedScopeCheck,'inconclusive');assert.equal(JSON.stringify(s).includes('SECRET_PLATFORM'),false);assert.equal(writes(f).length,0);
});
test('known property differences survive an unrelated unavailable component',async()=>{
  const a=await capture(fixture()),f=fixture({sources:{1:{OwnershipType:'OrganizationOwned'}},request:c=>c.path.startsWith('/webresourceset(')?reply({},403):undefined});
  const r=await compare(a,await capture(f));assert.equal(r.selectedScopeCheck,'inconclusive');assert.ok(r.changed.some(c=>c.componentType===1));assert.equal(r.knownDifferences,1);assert.equal(r.missingInTarget.length,0);assert.equal(r.unmatchedInTarget.length,1);
});
test('native membership truncation stays inconclusive even when retained rows match',async()=>{
  const s=await capture(fixture(),{top:2});assert.equal(s.components.length,2);assert.equal(s.coverage.inventoryComplete,false);assert.equal((await compare(s,s)).selectedScopeCheck,'inconclusive');
});
test('membership and solution changes between capture reads are recorded as unstable',async()=>{
  const f=fixture({request:(c,state)=>{if(c.path==='/solutioncomponents'&&state.membershipReads===1)state.members[0].rootcomponentbehavior=0;}}),s=await capture(f);assert.equal(s.coverage.membershipStable,false);assert.equal((await compare(s,s)).selectedScopeCheck,'inconclusive');
  const g=fixture({request:(c,state)=>{if(c.path==='/solutions'&&state.membershipReads===1)state.target.version='1.2.3.5';}}),t=await capture(g);assert.equal(t.coverage.solutionStable,false);
});
test('membership response order does not create capture instability',async()=>{
  const f=fixture({request:(c,state)=>{if(c.path==='/solutioncomponents'&&state.membershipReads===1)state.members.reverse();}});assert.equal((await capture(f)).coverage.membershipStable,true);
});
test('partial metadata and unsupported binary/option profiles are not asserted equal',async()=>{
  for(const [type,changes] of [[1,{'Attributes@odata.nextLink':'https://evil.invalid'}],[9,{OptionSetType:'Boolean'}],[9,{Options:[{Value:1,Label:label('x'),Description:null,Color:null},{Value:1,Label:label('y'),Description:null,Color:null}]}],
    [61,{content:'invalid-base64'}],[91,{_packageid_value:guid(777)}],[91,{sourcetype:1}]]){
    const f=fixture({sources:{[type]:changes}}),s=await capture(f);assert.notEqual(component(s,type).status,'available');assert.equal((await compare(s,s)).selectedScopeCheck,'inconclusive');
  }
});
test('many-to-many relationship endpoints are canonicalized through their own selected profile',async()=>{
  const fields={RelationshipType:'ManyToManyRelationship',Entity1LogicalName:'demo_one',Entity1IntersectAttribute:'demo_oneid',Entity2LogicalName:'demo_two',Entity2IntersectAttribute:'demo_twoid',IntersectEntityName:'demo_one_two'};
  const s=await capture(fixture({sources:{10:fields}}));assert.equal(component(s,10).status,'available');assert.equal(component(s,10).definition.IntersectEntityName,'demo_one_two');assert.equal(component(s,10).definition.CascadeConfiguration,undefined);
});
test('snapshot integrity, unknown shape and falsely elevated coverage are rejected offline',async()=>{
  const original=await capture(fixture());for(const mutate of [s=>{s.solution.version='9.9.9.9';},s=>{s.password='SECRET';rehash(s);},s=>{s.coverage.atomic=true;rehash(s);},
    s=>{component(s,1).definition.MetadataId=guid(1);rehash(s);},s=>{component(s,1).definitionHash='a'.repeat(64);rehash(s);},s=>{component(s,1).key='1:wrong';rehash(s);},s=>{s.components.push(structuredClone(s.components[0]));s.coverage.observedCount++;rehash(s);}]){
    const bad=structuredClone(original);mutate(bad);await error(compare(original,bad),'D365_SOLUTION_SNAPSHOT_INVALID');
  }
});
test('missing/extra evidence is confirmed only against a complete resolved membership inventory',async()=>{
  const source=fixture(),target=fixture({variant:1});target.members.splice(3,1);
  const a=await capture(source),b=await capture(target),r=await compare(a,b);assert.equal(r.selectedScopeCheck,'different');assert.equal(r.missingInTarget.length,1);assert.equal(r.extraInTarget.length,0);
  const reverse=await compare(b,a);assert.equal(reverse.extraInTarget.length,1);assert.equal(reverse.missingInTarget.length,0);
  b.coverage.inventoryComplete=false;rehash(b);const uncertain=await compare(a,b);assert.equal(uncertain.missingInTarget.length,0);assert.equal(uncertain.unmatchedInTarget.length,1);
});
test('duplicate localized language IDs, partial option collections and oversized selected definitions become gaps',async()=>{
  for(const changes of [{DisplayName:{LocalizedLabels:[{LanguageCode:1033,Label:'a'},{LanguageCode:1033,Label:'b'}]}},{'Options@odata.nextLink':'https://crm.invalid/next'},
    {Description:{LocalizedLabels:[{LanguageCode:1033,Label:'x'.repeat(4097)}]}}]){
    const s=await capture(fixture({sources:{9:changes}}));assert.equal(component(s,9).status,'failed');assert.equal((await compare(s,s)).selectedScopeCheck,'inconclusive');
  }
});
test('explicit cancellation error from a definition read is propagated without further native reads',async()=>{
  const f=fixture({request:c=>{if(c.path.startsWith('/EntityDefinitions('))throw new CrmRequestError('D365_REQUEST_ABORTED','Cancelled',{outcome:'not_sent'});}});
  await error(f.snapshotService.capture({solution_unique_name:'TransferDemo'}),'D365_REQUEST_ABORTED');assert.equal(f.calls.at(-1).path.startsWith('/EntityDefinitions('),true);
});
test('strict JSON rejects cycles, deep structures, nonfinite values, unsafe keys and huge payloads',async()=>{
  const cycle={};cycle.self=cycle;for(const source of [cycle,{a:NaN},{a:1n},JSON.parse('{"__proto__":{}}'),{a:'x'.repeat(4*1024*1024+32769)}])await error(compareSolutionSnapshots({source_snapshot:source,target_snapshot:{}}));
  let deep={};for(let i=0;i<30;i++)deep={a:deep};await error(compareSolutionSnapshots({source_snapshot:deep,target_snapshot:{}}),'D365_SOLUTION_SNAPSHOT_INVALID');
});
test('snapshot input aliases, limits and unsupported options fail before CRM reads',async()=>{
  for(const args of [{solution_unique_name:'TransferDemo',solutionUniqueName:'Other'},{solution_unique_name:'TransferDemo',top:201},{solution_unique_name:"bad'name"},{solution_unique_name:'TransferDemo',include_content:true}]){
    const f=fixture();await error(f.snapshotService.capture(args));assert.equal(f.calls.length,0);
  }
});
test('offline comparison MCP route runs before CRM configuration',async()=>{
  const s=await capture(fixture()),r=await handleToolCall('compare_solution_snapshots',{sourceSnapshot:s,targetSnapshot:s});assert.equal(r.selectedScopeCheck,'matched');
});
test('log summary reads native importjob data explicitly while withholding raw XML and text by default',async()=>{
  const f=fixture(),r=await f.logService.read({importJobId:ids.job});assert.equal(r.log.status,'available');assert.deepEqual(r.log.counts,{success:1,failure:1,warning:1,unknown:0});assert.equal(r.log.items[0].status,'failure');
  assert.equal(r.log.manifestResults[0].solutionUniqueName,'TransferDemo');assert.equal(r.rawXmlReturned,false);assert.equal(r.log.deploymentVerified,false);assert.equal(r.log.asyncCompletion,'not_determined_by_log');assert.equal(JSON.stringify(r).includes('SECRET_'),false);
  assert.ok(f.calls[0].url.searchParams.get('$select').split(',').includes('data'));assert.ok(f.calls.every(c=>!c.path.startsWith('/importlogs')));assert.equal(writes(f).length,0);
});
test('log text is opt-in, credentials redact before truncation, and configured secrets are removed',async()=>{
  const f=fixture({secrets:['SECRET_BUSINESS']}),r=await f.logService.read({import_job_id:ids.job,include_text:true,max_text_chars:128});
  const message=r.log.items[0].message.text;for(const forbidden of ['SECRET_BUSINESS','secret-password','secret-client','secret-bearer'])assert.equal(message.includes(forbidden),false);assert.ok(message.includes('[REDACTED]'));assert.ok(message.length<=128);assert.equal(r.log.textRedaction,'best_effort_patterns_and_configured_secrets');
});
test('log top limits entries but preserves all counts and prioritizes failures/warnings',async()=>{
  const r=await fixture().logService.read({import_job_id:ids.job,top:1});assert.equal(r.log.totalResults,3);assert.equal(r.log.returned,1);assert.equal(r.log.truncated,true);assert.equal(r.log.items[0].status,'failure');
});
test('empty, unavailable and unknown-result logs never mean success',async()=>{
  for(const data of [null,'']){const r=await fixture({log:data,job:{data}}).logService.read({import_job_id:ids.job});assert.equal(r.log.status,'not_available_yet_or_not_retained');}
  const r=await fixture({log:'<importexportxml><x><result result="alien" errorcode="SECRET" errortext="SECRET"/></x></importexportxml>'}).logService.read({import_job_id:ids.job});assert.equal(r.log.counts.unknown,1);assert.equal(r.log.items[0].errorCode,null);assert.equal(JSON.stringify(r).includes('SECRET'),false);
  const empty=await fixture({log:'<importexportxml/>'}).logService.read({import_job_id:ids.job});assert.equal(empty.log.recognizedResultElements,false);assert.equal(empty.log.deploymentVerified,false);
});
for(const [label,xml] of Object.entries({dtd:'<!DOCTYPE importexportxml [<!ENTITY x SYSTEM "file:///secret">]>'+logXml,malformed:'<importexportxml><x></importexportxml>',
  wrongRoot:'<Workbook/>',namespace:'<importexportxml xmlns="https://evil.invalid"/>',depth:'<importexportxml>'+'<x>'.repeat(70)+'</x>'.repeat(70)+'</importexportxml>',oversized:'<importexportxml>'+'x'.repeat(2*1024*1024)+'</importexportxml>'})){
  test('log rejects '+label+' without echoing XML or platform messages',async()=>{const r=await error(fixture({log:xml}).logService.read({import_job_id:ids.job}));assert.equal(JSON.stringify(r).includes('file:///secret'),false);assert.equal(JSON.stringify(r).includes('Workbook'),false);});
}
for(const status of [403,404,500])test(`import log read HTTP ${status} preserves evidence and never falls back to data-import logs`,async()=>{
  const f=fixture({request:c=>c.path.startsWith('/importjobs(')?reply({data:'SECRET_PLATFORM'},status):undefined}),r=await error(f.logService.read({import_job_id:ids.job}),'D365_SOLUTION_REQUEST_FAILED');assert.equal(r.status,status);assert.equal(JSON.stringify(r).includes('SECRET_PLATFORM'),false);assert.equal(f.calls.length,1);
});
test('log result IDs and input bounds are checked without returning full arbitrary job data',async()=>{
  const f=fixture({job:{importjobid:guid(888),operationcontext:'SECRET'}});await error(f.logService.read({import_job_id:ids.job}),'D365_SOLUTION_IMPORT_LOG_INVALID');
  for(const args of [{import_job_id:'bad'},{import_job_id:ids.job,top:201},{import_job_id:ids.job,include_text:'true'},{import_job_id:ids.job,max_text_chars:9000}]){
    const g=fixture();await error(g.logService.read(args));assert.equal(g.calls.length,0);
  }
});
test('selected-scope verification compares live target and optional independent job/log evidence',async()=>{
  const baseline=await capture(fixture()),f=fixture({variant:1}),r=await f.verificationService.verify({expected_snapshot:baseline,async_operation_id:ids.async,import_job_id:ids.job});
  assert.equal(r.selectedScopeCheck,'matched');assert.equal(r.observations.nativeJobs.data.observations.asyncOperation.completion,'succeeded');assert.equal(r.observations.importLog.data.log.counts.failure,1);assert.equal(r.observations.importLog.data.requestedSolutionNameMatches,true);assert.equal(r.observations.importLog.data.currentSolutionIdMatches,true);
  assert.equal(r.deploymentVerified,false);assert.equal(r.runtimeVerified,false);assert.equal(r.jobCorrelation,'caller_supplied_ids_not_independently_linked');assert.equal(writes(f).length,0);assert.equal(JSON.stringify(r).includes('SECRET_'),false);
});
test('successful async operation never hides a known component mismatch or claims full deployment',async()=>{
  const baseline=await capture(fixture()),f=fixture({sources:{61:{content:Buffer.from('wrong').toString('base64')}}}),r=await f.verificationService.verify({expected_snapshot:baseline,async_operation_id:ids.async});
  assert.equal(r.selectedScopeCheck,'different');assert.equal(r.comparison.changed[0].componentType,61);assert.equal(r.deploymentVerified,false);
});
test('verification retains comparison when logs are forbidden or malformed',async()=>{
  const baseline=await capture(fixture());for(const options of [{request:c=>c.path.startsWith('/importjobs(')?reply({},403):undefined},{log:'<bad/>'}]){
    const f=fixture(options),r=await f.verificationService.verify({expected_snapshot:baseline,import_job_id:ids.job});assert.equal(r.selectedScopeCheck,'matched');assert.notEqual(r.observations.importLog.status,'available');assert.equal(r.deploymentVerified,false);
  }
});
test('log solution mismatch is explicit and does not fabricate an async/job causal relation',async()=>{
  const baseline=await capture(fixture()),r=await fixture({job:{solutionname:'Other',solutionid:guid(12345)}}).verificationService.verify({expected_snapshot:baseline,import_job_id:ids.job});
  assert.equal(r.observations.importLog.data.requestedSolutionNameMatches,false);assert.equal(r.observations.importLog.data.currentSolutionIdMatches,false);assert.equal(r.deploymentVerified,false);
});
test('cancellation blocks all new local/native operations and propagates during definition reads',async()=>{
  const controller=new AbortController();controller.abort();const f=fixture(),s=await capture(fixture());
  for(const run of [()=>f.snapshotService.capture({solution_unique_name:'TransferDemo'},controller.signal),()=>f.logService.read({import_job_id:ids.job},controller.signal),
    ()=>compareSolutionSnapshots({source_snapshot:s,target_snapshot:s},controller.signal),()=>f.verificationService.verify({expected_snapshot:s},controller.signal)])await error(run(),'D365_REQUEST_ABORTED');assert.equal(f.calls.length,0);
  const active=new AbortController(),g=fixture({request:c=>{if(c.path.startsWith('/EntityDefinitions('))active.abort();}});await error(g.snapshotService.capture({solution_unique_name:'TransferDemo'},active.signal),'D365_REQUEST_ABORTED');
});
test('MCP routes snapshot/log/verification and forwards cancellation',async t=>{
  const signal=new AbortController().signal,mappings=[['get_solution_snapshot',SolutionSnapshotService,'capture'],['get_solution_import_log',SolutionImportLogService,'read'],['verify_solution_deployment',SolutionVerificationService,'verify']];
  for(const [,Class,method] of mappings)t.mock.method(Class.prototype,method,async(_args,received)=>{assert.equal(received,signal);return {method};});
  const before={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{for(const [tool,,method] of mappings)assert.equal((await handleToolCall(tool,{},{signal})).method,method);}
  finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: actual request branch captures, reads log and verifies with mocked transport`,async t=>{
  t.mock.method(axios,'post',async()=>({data:{access_token:'offline-token',expires_in:3600}}));const config=readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:env.apiVersion,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
    AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'}),client=new D365AuthService(config),f=fixture();
  client.getAxiosInstance().defaults.adapter=async c=>{const url=new URL(c.url);assert.equal(url.origin,'https://crm.invalid');assert.ok(url.pathname.startsWith('/Demo/api/data/v9.1/'));
    const r=await f.client.requestWithResponse(decodeURI(url.pathname.replace('/Demo/api/data/v9.1',''))+url.search,c.method.toUpperCase(),c.data?JSON.parse(c.data):undefined,{signal:c.signal});return {config:c,status:r.status,statusText:'OK',data:r.data,headers:new AxiosHeaders(r.headers)};};
  const snapshotService=new SolutionSnapshotService(client,{...env,authType}),s=(await snapshotService.capture({solution_unique_name:'TransferDemo'})).snapshot;
  assert.equal(s.coverage.definitionReadsComplete,true);const log=await new SolutionImportLogService(client,{...env,authType}).read({import_job_id:ids.job});assert.equal(log.log.counts.failure,1);
  const verification=await new SolutionVerificationService(client,{...env,authType}).verify({expected_snapshot:s});assert.equal(verification.selectedScopeCheck,'matched');assert.equal(writes(f).length,0);
});
