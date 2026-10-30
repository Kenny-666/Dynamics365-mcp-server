import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {RibbonService,inspectRibbonSolution,editRibbonSolution} from '../src/services/ribbon.ts';
import {inspectPackageArchive} from '../src/services/solutionPackage.ts';
import {decodeRibbonXml,ribbonDocument,selectRibbon,serializeRibbon,outsideRibbonHash} from '../src/services/ribbonXml.ts';
import {ribbonTools} from '../src/tools/ribbonTools.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';
import {archive,manifest} from './solutionTransfer.fixture.mjs';
import {solutionZip,fixture,env,existingId,diff,customization,add,nativeXml,csdl,reply} from './ribbon.fixture.mjs';
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);const p=toolErrorPayload(e);if(code)assert.equal(p.code,code);return p;}}
async function temp(run){const dir=await mkdtemp(join(tmpdir(),'d365-ribbon-'));try{return await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
const input=(bytes=solutionZip())=>({content_base64:bytes.toString('base64'),logical_name:'demo_table'});
async function execute(dir,changes=[add],bytes=solutionZip(),filename='candidate.zip'){
  const args={...input(bytes),changes,output_path:join(dir,filename)},p=await editRibbonSolution(args);return {result:await editRibbonSolution({...args,dry_run:false,expected_hash:p.planHash}),args,preview:p};
}
function packageXml(bytes){const x=inspectPackageArchive(bytes,{'customizations.xml':4*1024*1024});return {...x,xml:decodeRibbonXml(x.archive.payloads.get('customizations.xml'))};}
test('three tools have valid schemas, aliases and exclusive sources',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const tool of ribbonTools)ajv.compile(tool.inputSchema);const v=ajv.compile(ribbonTools[2].inputSchema);
  assert.equal(v({contentBase64:'AAAA',logicalName:'demo_table',outputPath:'D:/new.zip',changes:[add]}),true);
  assert.equal(v({...input(),filePath:'D:/old.zip',output_path:'D:/new.zip',changes:[add]}),false);
  assert.equal(v({...input(),output_path:'D:/new.zip',changes:[{operation:'delete_all'}]}),false);
});
test('local inspection works before CRM configuration and keeps metadata separate from code/parameter literals',async()=>{
  const r=await handleToolCall('inspect_ribbon_solution',input());assert.equal(r.ribbon.buttonCount,1);assert.equal(r.ribbon.buttons[0].Id,existingId);assert.equal(r.ribbon.commands[0].javaScript[0].parameterTypes[0],'StringParameter');
  assert.equal(JSON.stringify(r).includes('SECRET_PARAMETER_LITERAL'),false);assert.equal(JSON.stringify(r).includes('RIBBON_FIXTURE_MUST_NOT_EXECUTE'),false);assert.equal(r.crmChanged,false);assert.equal(r.ribbon.effectiveVisibility,'not_evaluated');
  const full=await inspectRibbonSolution({...input(),include_xml:true});assert.match(full.ribbonDiffXml,/SECRET_PARAMETER_LITERAL/);assert.equal(full.ribbonDiffXml.includes('<EntityInfo>'),false);
});
test('add preview creates no file and exposes exact preservation and local-only scope',async()=>temp(async dir=>{
  const args={...input(),changes:[add],output_path:join(dir,'new.zip')},r=await editRibbonSolution(args);assert.equal(r.dryRun,true);assert.equal(r.localSaved,false);assert.equal(r.crmChanged,false);assert.equal(r.afterRibbon.buttonCount,2);assert.equal(r.preservation.unchangedEntriesVerified,true);assert.equal(r.published,false);await assert.rejects(stat(args.output_path));
}));
test('add writes hash-verified new ZIP preserving every other compressed payload and outside Ribbon semantics',async()=>temp(async dir=>{
  const original=solutionZip(),{result,args}=await execute(dir,[add],original),bytes=await readFile(args.output_path),before=packageXml(original),after=packageXml(bytes);
  assert.equal(result.localSaved,true);assert.equal(result.localReadback,'matched');assert.equal(result.imported,false);assert.equal(result.crmChanged,false);assert.equal(result.published,false);assert.equal(after.summary.manifest.version,before.summary.manifest.version);
  for(const entry of before.archive.entries)if(entry.name!=='customizations.xml'){const e=after.archive.entries.find(x=>x.name===entry.name);assert.equal(e.payloadSha256,entry.payloadSha256);assert.deepEqual(e.localBlock,entry.localBlock);}
  const doc=ribbonDocument(after.xml,['ImportExportXml']),ribbon=selectRibbon(doc,'demo_table');assert.equal(outsideRibbonHash(doc,'demo_table'),outsideRibbonHash(ribbonDocument(before.xml,['ImportExportXml']),'demo_table'));
  assert.match(after.xml,/&lt; &amp; &quot;/);assert.match(after.xml,/<CrmParameter Value="PrimaryControl"\/>/);assert.match(after.xml,/<IntParameter Value="-2147483648"\/>/);
  assert.match(after.xml,/RIBBON_FIXTURE_MUST_NOT_EXECUTE|JavaScriptFunction/);assert.ok(serializeRibbon(ribbon).includes('demo.table.New'));
  assert.deepEqual(original,solutionZip());
}));
for(const method of [0,8])for(const descriptor of [true,false])test(`archive rewrite preserves method ${method} descriptor ${descriptor} entries`,async()=>temp(async dir=>{
  const bytes=solutionZip({method,descriptor}),{args}=await execute(dir,[add],bytes),before=packageXml(bytes),after=packageXml(await readFile(args.output_path));
  assert.equal(after.summary.entryCount,before.summary.entryCount);for(const e of before.archive.entries)if(e.name!=='customizations.xml')assert.deepEqual(after.archive.entries.find(x=>x.name===e.name).localBlock,e.localBlock);
}));
test('label updates merge languages and sequence without replacing the JavaScript handler or unrelated rules',async()=>temp(async dir=>{
  const {args}=await execute(dir,[{operation:'update_button',button_id:existingId,labels:[{language_code:2052,text:'更新文字'}],sequence:250}]),after=packageXml(await readFile(args.output_path)).xml;
  assert.match(after,/description="Existing"/);assert.match(after,/description="更新文字"/);assert.match(after,/FunctionName="Demo.existing"/);assert.match(after,/SECRET_PARAMETER_LITERAL/);assert.match(after,/Id="demo.table.OtherRule"/);assert.match(after,/Sequence="250"/);
}));
test('updating button text preserves independent tooltip references',async()=>temp(async dir=>{
  const source=customization.replace('LabelText="$LocLabels:demo.table.Existing.Label"','LabelText="$LocLabels:demo.table.Existing.Label" ToolTipDescription="$LocLabels:demo.Independent.Tooltip"');
  const {args}=await execute(dir,[{operation:'update_button',button_id:existingId,labels:[{language_code:1033,text:'New title'}]}],solutionZip({customization:source}));
  assert.match(packageXml(await readFile(args.output_path)).xml,/ToolTipDescription="\$LocLabels:demo.Independent.Tooltip"/);
}));
test('an exported Web Resource FileName with backslashes is resolved only inside the validated archive',async()=>temp(async dir=>{
  const source=customization.replaceAll('/WebResources/','\\WebResources\\');const {result}=await execute(dir,[add],solutionZip({customization:source}));assert.equal(result.localSaved,true);
}));
test('a hidden rule referenced by another command cannot be removed or reused',async()=>temp(async dir=>{
  const hidden=await execute(dir,[{operation:'set_visibility',button_id:existingId,visible:false}]),bytes=await readFile(hidden.args.output_path),s=packageXml(bytes).xml,
    changed=s.replace('</CommandDefinitions>','<CommandDefinition Id="demo.Unrelated"><EnableRules/><DisplayRules><DisplayRule Id="demo.table.Existing.Hidden.DisplayRule"/></DisplayRules><Actions/></CommandDefinition></CommandDefinitions>');
  await error(editRibbonSolution({...input(solutionZip({customization:changed})),changes:[{operation:'set_visibility',button_id:existingId,visible:true}],output_path:join(dir,'shared.zip')}),'D365_SOLUTION_RIBBON_SHARED_RULE');
}));
test('hide and show use an owned contradictory display rule while preserving original rules/actions',async()=>temp(async dir=>{
  const hidden=await execute(dir,[{operation:'set_visibility',button_id:existingId,visible:false}]),hiddenBytes=await readFile(hidden.args.output_path),hiddenXml=packageXml(hiddenBytes).xml;
  assert.match(hiddenXml,/Id="demo.table.Existing.Hidden.DisplayRule"/);assert.match(hiddenXml,/<CrmClientTypeRule Type="Web" InvertResult="true"\/>/);assert.equal((hiddenXml.match(/HideCustomAction/g)||[]).length,1);
  assert.match(hiddenXml,/FunctionName="Demo.existing"/);assert.match(hiddenXml,/Id="demo.table.OtherRule"/);
  const shown=await execute(dir,[{operation:'set_visibility',button_id:existingId,visible:true}],hiddenBytes,'shown.zip'),shownXml=packageXml(await readFile(shown.args.output_path)).xml;
  assert.equal(shownXml.includes('Existing.Hidden.DisplayRule'),false);assert.match(shownXml,/foreign.Preserved.Hide/);assert.match(shown.result.changes[0].interpretation,/other_rules_and_layers/);
}));
test('ordered add/hide/update operations produce one coherent local candidate',async()=>temp(async dir=>{
  const {result,args}=await execute(dir,[add,{operation:'set_visibility',button_id:add.button_id,visible:false},{operation:'update_button',button_id:add.button_id,labels:[{language_code:1033,text:'Adjusted'}]}]);
  assert.equal(result.changes.length,3);const xml=packageXml(await readFile(args.output_path)).xml;assert.match(xml,/description="Adjusted"/);assert.match(xml,/description="新按钮"/);assert.match(xml,/New.Hidden.DisplayRule/);
}));
test('an empty exported RibbonDiffXml is initialized with required ordered containers',async()=>temp(async dir=>{
  const {args}=await execute(dir,[add],solutionZip({customization:customization.replace(diff,'<RibbonDiffXml/>')})),doc=ribbonDocument(packageXml(await readFile(args.output_path)).xml,['ImportExportXml']),ribbon=selectRibbon(doc,'demo_table');
  assert.deepEqual(Array.from(ribbon.childNodes).filter(x=>x.nodeType===1).map(x=>x.nodeName),['CustomActions','Templates','CommandDefinitions','RuleDefinitions','LocLabels']);
  assert.ok(serializeRibbon(ribbon).includes('<TabDisplayRules/>'));
}));
test('UTF-16LE package XML becomes consistent UTF-8 without changing other customizations',async()=>temp(async dir=>{
  const source=Buffer.concat([Buffer.from([255,254]),Buffer.from(customization.replace('utf-8','utf-16'),'utf16le')]),{args}=await execute(dir,[add],solutionZip({customization:source}));
  const xml=packageXml(await readFile(args.output_path)).xml;assert.match(xml,/encoding="utf-8"/);assert.match(xml,/demo_preserved/);
}));
test('execution requires a matching review and never overwrites an existing destination or input',async()=>temp(async dir=>{
  const args={...input(),changes:[add],output_path:join(dir,'new.zip')};await error(editRibbonSolution({...args,dry_run:false}),'D365_SOLUTION_RIBBON_REVIEW');
  const p=await editRibbonSolution(args);for(const changed of [{...args,changes:[{...add,sequence:201}]},{...args,output_path:join(dir,'other.zip')},{...args,...input(solutionZip({manifest:manifest.replace('1.2.3.4','1.2.3.5')}))}])await error(editRibbonSolution({...changed,dry_run:false,expected_hash:p.planHash}),'D365_SOLUTION_RIBBON_CONFLICT');
  await writeFile(args.output_path,'other process');await error(editRibbonSolution({...args,dry_run:false,expected_hash:p.planHash}),'D365_SOLUTION_OUTPUT_EXISTS');assert.equal(await readFile(args.output_path,'utf8'),'other process');
  const source=join(dir,'source.zip');await writeFile(source,solutionZip());await error(editRibbonSolution({file_path:source,logical_name:'demo_table',changes:[add],output_path:source}),'D365_SOLUTION_OUTPUT_EXISTS');
}));
test('managed/patch/reserved solutions cannot be edited',async()=>temp(async dir=>{
  for(const source of [manifest.replace('<Managed>0','<Managed>1'),manifest.replace('</SolutionManifest>','<ParentSolutionUniqueName>Parent</ParentSolutionUniqueName></SolutionManifest>'),manifest.replace('TransferDemo','Default')]){
    await error(editRibbonSolution({...input(solutionZip({manifest:source})),changes:[add],output_path:join(dir,'new.zip')}),'D365_SOLUTION_RIBBON_SCOPE');
  }
}));
for(const [label,changes] of Object.entries({builtin:{...add,button_id:'Mscrm.Form.demo_table.Button'},wrongPublisher:{...add,command_id:'foreign.New.Command'},wrongTable:{...add,location:'Mscrm.Form.account.MainTab.Actions.Controls._children'},
  replacementLocation:{...add,location:'Mscrm.Form.demo_table.Save'},functionInjection:{...add,function_name:'Demo.run()'},unknownProperty:{...add,delete_existing:true},missingParameterValue:{...add,parameters:[{type:'bool'}]},
  unsupportedParameter:{...add,parameters:[{type:'crm',value:'ArbitraryCode'}]},wrongParameterType:{...add,parameters:[{type:'int',value:'123'}]},duplicateLanguages:{...add,labels:[{language_code:1033,text:'One'},{language_code:1033,text:'Two'}]},
  duplicateButton:{...add,button_id:existingId},sameIds:{...add,command_id:add.button_id}}))test('invalid edit '+label+' saves nothing',async()=>temp(async dir=>{
  const path=join(dir,'new.zip');await error(editRibbonSolution({...input(),changes:[changes],output_path:path}));await assert.rejects(stat(path));
}));
test('missing/incorrect resource types and missing payloads block new handler references',async()=>temp(async dir=>{
  for(const [custom,change] of [[customization,{...add,library:'demo_/missing.js'}],[customization.replace('<WebResourceType>3','<WebResourceType>2'),add],
    [customization.replace('/WebResources/buttons.js','/WebResources/missing.js'),add],[customization,{...add,image_16:'demo_/buttons.js'}]])await error(editRibbonSolution({...input(solutionZip({customization:custom})),changes:[change],output_path:join(dir,'new.zip')}),'D365_SOLUTION_RIBBON_RESOURCE');
}));
test('shared labels and shared commands/rules cannot be changed indirectly',async()=>temp(async dir=>{
  const cases=[{source:customization.replace('</CustomActions>','<CustomAction Id="demo.Shared.Action"><CommandUIDefinition><Button Id="demo.Shared" Command="demo.Shared.Command" LabelText="$LocLabels:demo.table.Existing.Label"/></CommandUIDefinition></CustomAction></CustomActions>'),change:{operation:'update_button',button_id:existingId,labels:add.labels},code:'D365_SOLUTION_RIBBON_SHARED_LABEL'},
    {source:customization.replace('</CustomActions>','<CustomAction Id="demo.Shared.Action"><CommandUIDefinition><Button Id="demo.Shared" Command="demo.table.Existing.Command"/></CommandUIDefinition></CustomAction></CustomActions>'),change:{operation:'set_visibility',button_id:existingId,visible:false},code:'D365_SOLUTION_RIBBON_SHARED_COMMAND'},
    {source:customization.replace('<DisplayRules><DisplayRule Id="demo.table.OtherRule">','<DisplayRules><DisplayRule Id="demo.table.Existing.Hidden.DisplayRule"><CrmClientTypeRule Type="Outlook"/></DisplayRule><DisplayRule Id="demo.table.OtherRule">'),change:{operation:'set_visibility',button_id:existingId,visible:true},code:'D365_SOLUTION_RIBBON_SHARED_RULE'}];
  for(const item of cases)await error(editRibbonSolution({...input(solutionZip({customization:item.source})),changes:[item.change],output_path:join(dir,'new.zip')}),item.code);
}));
test('wrong table, duplicate entity and missing Ribbon baseline are explicit errors',async()=>{
  await error(inspectRibbonSolution({...input(),logical_name:'account'}),'D365_SOLUTION_RIBBON_TARGET');
  await error(inspectRibbonSolution(input(solutionZip({customization:customization.replace('demo_other','demo_table')}))),'D365_SOLUTION_RIBBON_TARGET');
  await error(inspectRibbonSolution(input(solutionZip({customization:customization.replace(diff,'')}))),'D365_SOLUTION_RIBBON_XML');
});
for(const source of ['<!DOCTYPE ImportExportXml [<!ENTITY x SYSTEM "file:///secret">]>'+customization,'<ImportExportXml><broken></ImportExportXml>',customization.replace('<RibbonDiffXml>','<RibbonDiffXml xmlns="https://evil.invalid">')])test('unsafe local XML is rejected without echoing source',async()=>{
  const r=await error(inspectRibbonSolution(input(solutionZip({customization:source}))),'D365_SOLUTION_RIBBON_XML');assert.equal(JSON.stringify(r).includes('file:///secret'),false);
});
test('native reader validates typed CSDL, enum alias encoding and bounded OPC part',async()=>{
  const f=fixture(),r=await f.service.read({logicalName:'demo_table'});assert.equal(r.ribbon.buttonCount,1);assert.equal(r.ribbon.buttons[0].Id,'Mscrm.Form.demo_table.Save');assert.equal(r.effectiveRibbonXml,undefined);assert.equal(JSON.stringify(r).includes('SECRET_PARAMETER_LITERAL'),false);
  assert.ok(r.ribbon.candidateLocations.includes(add.location));const call=f.calls.find(c=>c.path.startsWith('/RetrieveEntityRibbon('));assert.equal(call.method,'GET');assert.equal(call.url.searchParams.get('@p1'),"'demo_table'");assert.equal(call.url.searchParams.get('@p2'),"Microsoft.Dynamics.CRM.RibbonLocationFilters'All'");assert.ok(f.calls.every(c=>c.method==='GET'));
});
for(const location_filter of ['Form','HomepageGrid','SubGrid','All'])test('native '+location_filter+' filter uses the current enum',async()=>{
  const f=fixture(),r=await f.service.read({logical_name:'demo_table',location_filter,include_xml:true});assert.equal(r.locationFilter,location_filter);assert.equal(r.effectiveRibbonXml,nativeXml);
});
for(const metadata of [csdl.replace('FunctionImport Name="RetrieveEntityRibbon"','FunctionImport Name="Other"'),csdl.replace('Name="CompressedEntityXml" Type="Edm.Binary"','Name="CompressedEntityXml" Type="Edm.String"'),
  csdl.replace('Name="RibbonLocationFilter" Type="mscrm.RibbonLocationFilters"','Name="RibbonLocationFilter" Type="Edm.Int32"')])test('unsupported current native contract is rejected before Ribbon invocation',async()=>{
  const f=fixture({metadata});await error(f.service.read({logical_name:'demo_table'}),'D365_SOLUTION_RIBBON_UNSUPPORTED');assert.equal(f.calls.some(c=>c.path.startsWith('/RetrieveEntityRibbon(')),false);
});
test('missing, oversized, malformed and unsafe native XML/ZIP responses fail without fallback',async()=>{
  for(const options of [{ribbonZip:archive({entries:[{name:'Other.xml',content:'<Ribbon/>'}]})},{xml:'<NotRibbon/>'},{xml:'<!DOCTYPE Ribbon><Ribbon/>'},{ribbonZip:Buffer.from('not a ZIP')},
    {xml:'<Ribbon>'+'x'.repeat(2*1024*1024)+'</Ribbon>'}]){
    const f=fixture(options);await error(f.service.read({logical_name:'demo_table'}));assert.ok(f.calls.every(c=>c.method==='GET'));
  }
});
for(const status of [403,404,500])test('native Ribbon read HTTP '+status+' retains safe evidence',async()=>{
  const f=fixture({request:c=>c.path.startsWith('/RetrieveEntityRibbon(')?reply({message:'SECRET_NATIVE'},status):undefined}),r=await error(f.service.read({logical_name:'demo_table'}),'D365_SOLUTION_REQUEST_FAILED');assert.equal(r.status,status);assert.equal(JSON.stringify(r).includes('SECRET_NATIVE'),false);
});
test('cancellation and strict aliases stop work before writes/native requests',async()=>temp(async dir=>{
  const controller=new AbortController();controller.abort();await error(inspectRibbonSolution(input(),controller.signal),'D365_REQUEST_ABORTED');
  await error(editRibbonSolution({...input(),changes:[add],output_path:join(dir,'new.zip')},controller.signal),'D365_REQUEST_ABORTED');
  const f=fixture();await error(f.service.read({logical_name:'demo_table'},controller.signal),'D365_REQUEST_ABORTED');assert.equal(f.calls.length,0);
  await error(f.service.read({logical_name:'demo_table',logicalName:'account'}),'D365_SOLUTION_RIBBON_INVALID');await error(inspectRibbonSolution({...input(),contentBase64:'AAAA'}),'D365_SOLUTION_RIBBON_INVALID');
}));
test('native MCP route forwards cancellation and local edit route does not create CRM services',async t=>{
  const signal=new AbortController().signal;t.mock.method(RibbonService.prototype,'read',async(_args,received)=>{assert.equal(received,signal);return {routed:true};});
  const before={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{assert.equal((await handleToolCall('get_ribbon_definition',{},{signal})).routed,true);}finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
  await temp(async dir=>{const r=await handleToolCall('edit_ribbon_solution',{...input(),changes:[add],output_path:join(dir,'new.zip')});assert.equal(r.dryRun,true);assert.equal(r.crmChanged,false);});
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: actual request branch retrieves native compressed Ribbon offline`,async t=>{
  t.mock.method(axios,'post',async()=>({data:{access_token:'offline-token',expires_in:3600}}));const config=readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:env.apiVersion,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'}),client=new D365AuthService(config),f=fixture();
  client.getAxiosInstance().defaults.adapter=async c=>{const url=new URL(c.url);assert.equal(url.origin,'https://crm.invalid');assert.ok(url.pathname.startsWith('/Demo/api/data/v9.1/'));
    const r=await f.client.requestWithResponse(decodeURI(url.pathname.replace('/Demo/api/data/v9.1',''))+url.search,c.method.toUpperCase(),undefined,{signal:c.signal});return {config:c,status:r.status,statusText:'OK',data:r.data,headers:new AxiosHeaders(r.headers)};};
  const result=await new RibbonService(client,{...env,authType}).read({logical_name:'demo_table'});assert.equal(result.ribbon.buttonCount,1);assert.equal(result.crmChanged,false);assert.ok(f.calls.every(c=>c.method==='GET'));
});
