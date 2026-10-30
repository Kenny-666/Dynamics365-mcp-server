import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {inspectPackage,inspectSolutionPackage,crc32,PACKAGE_LIMIT} from '../src/services/solutionPackage.ts';
import {SolutionTransferService} from '../src/services/solutionTransfer.ts';
import {solutionTransferTools} from '../src/tools/solutionTransferTools.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';
import {archive,manifest,fixture,executeImport,writes,ids,env,solution,csdl,reply} from './solutionTransfer.fixture.mjs';
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);const result=toolErrorPayload(e);if(code)assert.equal(result.code,code);return result;}}
const input=f=>({content_base64:f.bytes.toString('base64')});
async function temporary(run){const dir=await mkdtemp(join(tmpdir(),'d365-transfer-'));try{return await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('four transfer tools have schemas, aliases and exclusive package sources',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const tool of solutionTransferTools)ajv.compile(tool.inputSchema);
  const validate=ajv.compile(solutionTransferTools[2].inputSchema);
  assert.equal(validate({contentBase64:archive().toString('base64'),dryRun:true}),true);
  assert.equal(validate({content_base64:'AAAA',filePath:'C:/test.zip'}),false);assert.equal(validate({}),false);
  assert.equal(validate({content_base64:'AAAA',publish_workflows:true}),false);
});
test('ZIP inspection CRC matches standard vector and returns bounded identity only',()=>{
  assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);const bytes=archive(),result=inspectPackage(bytes);
  assert.equal(result.size,bytes.length);assert.equal(result.manifest.uniqueName,'TransferDemo');assert.equal(result.manifest.managed,false);assert.equal(result.manifest.version,'1.2.3.4');
  assert.equal(result.manifest.rootComponentCount,1);assert.equal(result.entryCount,3);assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.equal(result.validation.extracted,false);assert.equal(result.validation.deploymentReady,'not_assessed');
});
for(const method of [0,8])for(const descriptorSignature of [true,false])test(`ZIP method ${method} and data descriptor signature ${descriptorSignature} are checked`,()=>{
  const entries=[{name:'solution.xml',content:manifest,method,flags:0x808,descriptorSignature},{name:'customizations.xml'},{name:'[Content_Types].xml'}];
  assert.equal(inspectPackage(archive({entries})).manifest.uniqueName,'TransferDemo');
});
test('UTF-16LE BOM manifest is supported without executing package payloads',()=>{
  const content=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(manifest.replace('utf-8','utf-16'),'utf16le')]);
  const bytes=archive({entries:[{name:'solution.xml',content},{name:'customizations.xml'},{name:'[Content_Types].xml'},{name:'Plugins/do-not-run.dll',content:Buffer.from('not executable metadata')}]});
  assert.equal(inspectPackage(bytes).validation.executed,false);
});
const unsafeNames=['../escape','/absolute','C:/drive','x\\y','folder/../file','folder//file','file:stream','CON.txt','folder/trailing.','folder/trailing ','a\u0000b','folder/aux/test'];
for(const name of unsafeNames)test(`ZIP rejects unsafe archive name ${JSON.stringify(name)}`,async()=>{
  const bytes=archive({entries:[{name,content:manifest}]});await error(inspectSolutionPackage({content_base64:bytes.toString('base64')}),'D365_SOLUTION_PACKAGE');
});
const corruptions={
  crc:(b,r)=>b.writeUInt32LE(0,r[0].central+16),
  payload:(b,r)=>{b[r[0].data]^=0xff;},
  encryption:(b,r)=>b.writeUInt16LE(0x801,r[0].central+8),
  compression:(b,r)=>b.writeUInt16LE(12,r[0].central+10),
  zip64:(b,r)=>b.writeUInt16LE(45,r[0].central+6),
  multidisk:(b,r,e)=>b.writeUInt16LE(1,e.end+4),
  symlink:(b,r)=>b.writeUInt32LE((0xa1ff*65536)>>>0,r[0].central+38),
  localName:(b,r)=>{b[r[0].local+30]^=1;},
  localFlags:(b,r)=>b.writeUInt16LE(0,r[0].local+6),
  localSize:(b,r)=>b.writeUInt32LE(42,r[0].local+22),
  tooLargeInflation:(b,r)=>b.writeUInt32LE(65*1024*1024,r[0].central+24),
  overlapping:(b,r)=>b.writeUInt32LE(0,r[1].central+42),
  badCount:(b,r,e)=>b.writeUInt16LE(10001,e.end+10),
  badDirectory:(b,r,e)=>b.writeUInt32LE(0,e.end+16),
};
for(const [name,mutate] of Object.entries(corruptions))test('ZIP rejects '+name,async()=>{await error(inspectSolutionPackage({content_base64:archive({mutate}).toString('base64')}),'D365_SOLUTION_PACKAGE');});
test('ZIP rejects duplicate/case collisions, file-prefix collisions, missing manifest and alternative Unicode/ZIP64 extras',async()=>{
  for(const entries of [[{name:'solution.xml'},{name:'Solution.xml'}],[{name:'a'},{name:'a/b'}],[{name:'customizations.xml'}],
    [{name:'a'},{name:'a/'}],[{name:'solution.xml',extra:Buffer.from([0x75,0x70,0,0])}],[{name:'solution.xml',extra:Buffer.from([1,0,0,0])}]]){
    await error(inspectSolutionPackage({content_base64:archive({entries}).toString('base64')}),'D365_SOLUTION_PACKAGE');
  }
});
test('ZIP rejects trailing bytes, truncation, noncanonical base64 and oversized inputs',async()=>{
  for(const value of [archive().subarray(0,-1).toString('base64'),Buffer.concat([archive(),Buffer.from('tail')]).toString('base64'),'YWJ=','A===','AAAA\n','',Buffer.alloc(PACKAGE_LIMIT+1).toString('base64')]){
    await error(inspectSolutionPackage({content_base64:value}));
  }
});
for(const [name,source] of Object.entries({dtd:'<!DOCTYPE ImportExportXml [<!ENTITY x SYSTEM "file:///secret">]>'+manifest,
  wrongRoot:manifest.replaceAll('ImportExportXml','Other'),duplicate:manifest.replace('<UniqueName>','<UniqueName>Other</UniqueName><UniqueName>'),
  invalidManaged:manifest.replace('<Managed>0','<Managed>false'),missingVersion:manifest.replace(/<Version>.*?<\/Version>/,''),invalidVersion:manifest.replace('1.2.3.4','1.2'),
  namespace:manifest.replace('<ImportExportXml ','<ImportExportXml xmlns="https://evil.invalid" '),depth:manifest.replace('<RootComponents>','<RootComponents>'+'<x>'.repeat(70)).replace('</RootComponents>','</x>'.repeat(70)+'</RootComponents>')})){
  test('manifest rejects '+name,async()=>{await error(inspectSolutionPackage({content_base64:archive({manifest:source}).toString('base64')}),'D365_SOLUTION_PACKAGE');});
}
test('local package inspection works without CRM configuration and never returns bytes/XML/path',async()=>temporary(async dir=>{
  const path=join(dir,'source.zip');await writeFile(path,archive());const result=await handleToolCall('inspect_solution_package',{filePath:path});
  assert.equal(result.package.manifest.uniqueName,'TransferDemo');assert.equal(JSON.stringify(result).includes('ImportExportXml'),false);assert.equal(JSON.stringify(result).includes(path),false);
  await error(inspectSolutionPackage({file_path:dir}),'D365_SOLUTION_PACKAGE');await error(inspectSolutionPackage({file_path:join(dir,'secret-missing')}),'D365_SOLUTION_PACKAGE_READ');
}));
test('input aliases conflict and multiple sources/relative paths/unknown options fail before CRM reads',async()=>{
  const f=fixture();for(const args of [{...input(f),contentBase64:'AAAA'},{...input(f),file_path:'C:/x'},{file_path:'relative.zip'},{...input(f),holding_solution:true}])await error(f.service.import(args),'D365_SOLUTION_INVALID');
  assert.equal(f.calls.length,0);
});
test('import preview binds ZIP hash/caller/environment/native metadata and hides base64',async()=>{
  const f=fixture(),result=await f.service.import(input(f));assert.equal(result.dryRun,true);assert.equal(result.accepted,false);assert.equal(result.completed,false);assert.equal(writes(f).length,0);
  assert.equal(result.request.body.CustomizationFile.sha256,result.package.sha256);assert.equal(result.request.body.ImportJobId,'generated_at_execution');assert.equal(JSON.stringify(result).includes(f.bytes.toString('base64')),false);
  assert.equal(result.request.body.OverwriteUnmanagedCustomizations,false);assert.equal(result.request.body.PublishWorkflows,false);assert.equal(result.request.body.HoldingSolution,false);assert.equal(result.request.body.StageAndUpgrade,false);assert.deepEqual(result.request.body.ComponentParameters,[]);
});
test('import submits one native Action and returns accepted tracking IDs without claiming completion',async()=>{
  const f=fixture(),result=await executeImport(f);assert.equal(result.accepted,true);assert.equal(result.completed,false);assert.equal(result.deploymentVerified,false);assert.equal(result.asyncOperationId,ids.async);
  assert.equal(result.importJobKey,result.importJobId);assert.equal(result.importJobId,f.submission.ImportJobId);assert.match(result.importJobId,/^[a-f0-9-]{36}$/);
  assert.equal(writes(f).length,1);assert.equal(writes(f)[0].path,'/ImportSolutionAsync');assert.equal(f.calls.some(c=>c.path.startsWith('/asyncoperations')),false);
  assert.ok(f.calls.every(c=>c.path!=='/PublishAllXml'));
});
test('older native import contract omits unsupported optional component/holding/upgrade fields',async()=>{
  const metadata=csdl.replace(/<Parameter Name="(?:ComponentParameters|HoldingSolution|StageAndUpgrade|SkipProductUpdateDependencies)"[^>]*\/>/g,''),f=fixture({metadata});
  await executeImport(f);assert.equal(f.submission.ComponentParameters,undefined);assert.equal(f.submission.HoldingSolution,undefined);
});
test('execution requires preview fingerprint and explicit native concurrency acceptance',async()=>{
  const f=fixture();await error(f.service.import({...input(f),dry_run:false}),'D365_SOLUTION_CONCURRENCY');const p=await f.service.import(input(f));
  await error(f.service.import({...input(f),dry_run:false,expected_hash:p.planHash}),'D365_SOLUTION_CONCURRENCY');assert.equal(writes(f).length,0);
});
test('package, organization, user and metadata changes invalidate the preview',async()=>{
  const before=await fixture().service.import({content_base64:archive().toString('base64')});
  for(const options of [{bytes:archive({manifest:manifest.replace('1.2.3.4','1.2.3.5')})},{identity:{OrganizationId:ids.job}},{identity:{UserId:ids.job}},{metadata:csdl+' '}]){
    const f=fixture(options);await error(f.service.import({...input(f),dry_run:false,expected_hash:before.planHash,allow_unprotected_write:true}),'D365_SOLUTION_CONFLICT');assert.equal(writes(f).length,0);
  }
});
test('managed packages, patches, reserved names and same-name existing solutions block import',async()=>{
  for(const source of [manifest.replace('<Managed>0','<Managed>1'),manifest.replace('</SolutionManifest>','<ParentSolutionUniqueName>Parent</ParentSolutionUniqueName></SolutionManifest>'),manifest.replace('TransferDemo','Default')]){
    const f=fixture({bytes:archive({manifest:source})});await error(f.service.import(input(f)),'D365_SOLUTION_IMPORT_SCOPE');assert.equal(f.calls.length,0);
  }
  const f=fixture({solutions:[solution]});await error(f.service.import(input(f)),'D365_SOLUTION_IMPORT_EXISTS');assert.equal(writes(f).length,0);
});
for(const [label,change] of Object.entries({missingAction:s=>s.replace('ActionImport Name="ImportSolutionAsync"','ActionImport Name="OtherImport"'),
  wrongBinary:s=>s.replace('Name="CustomizationFile" Type="Edm.Binary"','Name="CustomizationFile" Type="Edm.String"'),
  extraRequired:s=>s.replace('<Action Name="ImportSolutionAsync">','<Action Name="ImportSolutionAsync"><Parameter Name="UnknownRequired" Type="Edm.Boolean" Nullable="false"/>'),
  wrongResponse:s=>s.replace('Name="AsyncOperationId" Type="Edm.Guid"','Name="AsyncOperationId" Type="Edm.String"'),
  unsupportedRequired:s=>s.replace('<Action Name="ImportSolutionAsync">','<Action Name="ImportSolutionAsync"><Parameter Name="SkipQueueRibbonJob" Type="Edm.Boolean" Nullable="false"/>')})){
  test('current native CSDL blocks '+label,async()=>{const f=fixture({metadata:change(csdl)});await error(f.service.import(input(f)),'D365_SOLUTION_NATIVE_CONTRACT_UNSUPPORTED');assert.equal(writes(f).length,0);});
}
for(const status of [400,403,429,500,503])test(`native import HTTP ${status} retains job ID and does not replay`,async()=>{
  const f=fixture({request:c=>c.path==='/ImportSolutionAsync'?reply({message:'SECRET payload'},status):undefined});const result=await error(executeImport(f),'D365_SOLUTION_IMPORT_SUBMIT_FAILED');
  assert.equal(result.data.accepted,status>=500?null:false);assert.match(result.data.importJobId,/^[a-f0-9-]{36}$/);assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('connection loss preserves unknown acceptance and a recovery ID without a second submission',async()=>{
  const f=fixture({request:c=>{if(c.path==='/ImportSolutionAsync')throw new CrmRequestError('D365_REQUEST_FAILED','SECRET',{outcome:'unknown',attempts:1});}});
  const result=await error(executeImport(f),'D365_SOLUTION_IMPORT_SUBMIT_FAILED');assert.equal(result.data.accepted,null);assert.equal(result.outcome,'unknown');assert.ok(result.data.importJobId);assert.equal(writes(f).length,1);
});
for(const receipt of [{},{AsyncOperationId:'bad',ImportJobKey:'opaque'},{AsyncOperationId:ids.async,ImportJobKey:''},{AsyncOperationId:ids.async,ImportJobKey:'bad\nkey'}]){
  test('invalid accepted import receipt keeps acceptance and requested job ID',async()=>{
    const f=fixture({receipt}),result=await error(executeImport(f),'D365_SOLUTION_IMPORT_RECEIPT_INVALID');assert.equal(result.data.accepted,true);assert.equal(result.outcome,undefined);assert.ok(result.data.importJobId);assert.equal(writes(f).length,1);
  });
}
test('opaque native ImportJobKey is not fabricated into an importjob GUID',async()=>{
  const result=await executeImport(fixture({receipt:{AsyncOperationId:ids.async,ImportJobKey:'opaque-native-key'}}));assert.equal(result.importJobKey,'opaque-native-key');assert.notEqual(result.importJobId,result.importJobKey);
});
test('export preview checks published source and creates no file or native export',async()=>temporary(async dir=>{
  const f=fixture({solutions:[solution]}),path=join(dir,'out.zip'),result=await f.service.export({solutionUniqueName:'TransferDemo',outputPath:path});
  assert.equal(result.dryRun,true);assert.equal(result.exported,false);assert.equal(result.sourceSnapshot,false);assert.equal(writes(f).length,0);await assert.rejects(stat(path));
}));
test('native export validates ZIP identity and writes an exclusive hash-verified local artifact',async()=>temporary(async dir=>{
  const f=fixture({solutions:[solution]}),args={solution_unique_name:'TransferDemo',output_path:join(dir,'out.zip')},preview=await f.service.export(args);
  const result=await f.service.export({...args,dry_run:false,expected_hash:preview.planHash});assert.equal(result.exported,true);assert.equal(result.localSaved,true);assert.equal(result.localReadback,'matched');assert.deepEqual(await readFile(args.output_path),f.bytes);assert.equal(writes(f).length,1);
  await error(f.service.export(args),'D365_SOLUTION_OUTPUT_EXISTS');assert.equal(writes(f).length,1);
}));
test('managed export is explicit and validates the returned managed manifest',async()=>temporary(async dir=>{
  const f=fixture({solutions:[solution],bytes:archive({manifest:manifest.replace('<Managed>0','<Managed>1')})}),args={solution_unique_name:'TransferDemo',managed:true,output_path:join(dir,'managed.zip')};
  const p=await f.service.export(args),result=await f.service.export({...args,dry_run:false,expected_hash:p.planHash});assert.equal(result.package.manifest.managed,true);assert.equal(writes(f)[0].body.Managed,true);
}));
test('source state and output-path changes invalidate export review before any native Action',async()=>temporary(async dir=>{
  const args={solution_unique_name:'TransferDemo',output_path:join(dir,'out.zip')},p=await fixture({solutions:[solution]}).service.export(args);
  for(const [options,next] of [[{solutions:[{...solution,version:'1.2.3.5'}]},args],[{solutions:[solution]},{...args,output_path:join(dir,'changed.zip')}]] ){
    const f=fixture(options);await error(f.service.export({...next,dry_run:false,expected_hash:p.planHash}),'D365_SOLUTION_CONFLICT');assert.equal(writes(f).length,0);
  }
}));
test('existing/invalid output destinations and nonordinary source solutions block export',async()=>temporary(async dir=>{
  await writeFile(join(dir,'exists.zip'),'preserve');const f=fixture({solutions:[solution]});
  for(const path of [join(dir,'exists.zip'),join(dir,'missing','out.zip'),join(dir,'out.txt'),'relative.zip'])await error(f.service.export({solution_unique_name:'TransferDemo',output_path:path}));
  assert.equal(writes(f).length,0);assert.equal(await readFile(join(dir,'exists.zip'),'utf8'),'preserve');
  for(const changed of [{...solution,ismanaged:true},{...solution,_parentsolutionid_value:ids.job},{...solution,isvisible:false}]){
    await error(fixture({solutions:[changed]}).service.export({solution_unique_name:'TransferDemo',output_path:join(dir,'out.zip')}),'D365_SOLUTION_TARGET');
  }
}));
test('concurrent output creation between preview and execution is preserved',async()=>temporary(async dir=>{
  const f=fixture({solutions:[solution]}),args={solution_unique_name:'TransferDemo',output_path:join(dir,'out.zip')},p=await f.service.export(args);
  await writeFile(args.output_path,'other process');await error(f.service.export({...args,dry_run:false,expected_hash:p.planHash}),'D365_SOLUTION_OUTPUT_EXISTS');assert.equal(await readFile(args.output_path,'utf8'),'other process');assert.equal(writes(f).length,0);
}));
test('accepted export with mismatched identity keeps export evidence and reserved artifact state',async()=>temporary(async dir=>{
  const f=fixture({solutions:[solution],bytes:archive({manifest:manifest.replace('TransferDemo','OtherName')})}),args={solution_unique_name:'TransferDemo',output_path:join(dir,'out.zip')},p=await f.service.export(args);
  const result=await error(f.service.export({...args,dry_run:false,expected_hash:p.planHash}),'D365_SOLUTION_EXPORT_FAILED');assert.equal(result.data.exported,true);assert.equal(result.data.localSaved,false);assert.equal(result.outcome,undefined);assert.equal((await stat(args.output_path)).size,0);assert.equal(writes(f).length,1);
}));
test('failed native export retains reserved path without claiming a valid file or replaying',async()=>temporary(async dir=>{
  const f=fixture({solutions:[solution],request:c=>c.path==='/ExportSolution'?reply({message:'SECRET'},503):undefined}),args={solution_unique_name:'TransferDemo',output_path:join(dir,'out.zip')},p=await f.service.export(args);
  const result=await error(f.service.export({...args,dry_run:false,expected_hash:p.planHash}),'D365_SOLUTION_EXPORT_FAILED');assert.equal(result.data.exported,false);assert.equal(result.data.localSaved,false);assert.equal(result.outcome,'unknown');assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('SECRET'),false);
}));
for(const [statecode,statuscode,completion] of [[0,0,'pending'],[1,10,'pending'],[2,20,'pending'],[3,30,'succeeded'],[3,31,'failed'],[3,32,'cancelled'],[0,30,'unknown'],[3,99,'unknown']])test(`job status ${statecode}/${statuscode} reports ${completion}`,async()=>{
  const f=fixture({async:{statecode,statuscode,message:'SECRET',data:'SECRET'}}),result=await f.service.status({async_operation_id:ids.async});
  assert.equal(result.observations.asyncOperation.completion,completion);assert.equal(result.deploymentVerified,false);assert.equal(result.automaticPolling,false);assert.equal(writes(f).length,0);assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('progress=100 and identity readback remain separate from native async success and deployment',async()=>{
  const f=fixture({solutions:[solution],async:{statecode:3,statuscode:31},job:{data:'SECRET',name:'SECRET'}}),result=await f.service.status({asyncOperationId:ids.async,importJobId:ids.job});
  assert.equal(result.observations.asyncOperation.completion,'failed');assert.equal(result.observations.importJob.progress,100);assert.equal(result.observations.importJob.progressIsSuccessProof,false);assert.equal(result.observations.importJob.solutionReadback.status,'identity_matched');
  assert.equal(result.correlation,'caller_supplied_job_ids_not_independently_linked');assert.equal(result.deploymentVerified,false);assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
for(const status of [403,404,500])test('job read HTTP '+status+' is an evidence gap, not a completed failure',async()=>{
  const f=fixture({request:c=>c.path.startsWith('/asyncoperations(')?reply({message:'SECRET'},status):undefined}),result=await f.service.status({async_operation_id:ids.async,import_job_id:ids.job});
  assert.equal(result.observations.asyncOperation.status,status===403?'forbidden':status===404?'unavailable_or_hidden':'failed');assert.equal(result.observations.asyncOperation.completion,undefined);assert.equal(result.observations.importJob.status,'available');assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('invalid IDs are rejected before any network read and other job types are never verified as solution imports',async()=>{
  const f=fixture();await error(f.service.status({async_operation_id:ids.async,import_job_id:'bad'}),'D365_SOLUTION_INVALID');assert.equal(f.calls.length,0);
  const result=await fixture({async:{operationtype:10}}).service.status({async_operation_id:ids.async});assert.equal(result.observations.asyncOperation.solutionImportTypeVerified,false);
});
test('cancellation blocks local and remote work before submission',async()=>{
  const controller=new AbortController();controller.abort();const f=fixture();await error(f.service.import(input(f),controller.signal),'D365_REQUEST_ABORTED');assert.equal(f.calls.length,0);
  await error(inspectSolutionPackage(input(f),controller.signal),'D365_REQUEST_ABORTED');
});
test('ZIP rejects trailing bytes inside a deflate entry even when the visible payload CRC matches',async()=>{
  const bytes=archive(),start=bytes.readUInt32LE(bytes.length-6),nameSize=bytes.readUInt16LE(26),compressed=bytes.readUInt32LE(18),end=30+nameSize+compressed;
  const changed=Buffer.concat([bytes.subarray(0,end),Buffer.from('tail'),bytes.subarray(end)]),newStart=start+4,newEnd=changed.length-22;
  changed.writeUInt32LE(compressed+4,18);changed.writeUInt32LE(compressed+4,newStart+20);changed.writeUInt32LE(newStart,newEnd+16);
  let cursor=newStart;for(let i=0;i<3;i++){if(i>0)changed.writeUInt32LE(changed.readUInt32LE(cursor+42)+4,cursor+42);cursor+=46+changed.readUInt16LE(cursor+28)+changed.readUInt16LE(cursor+30)+changed.readUInt16LE(cursor+32);}
  await error(inspectSolutionPackage({content_base64:changed.toString('base64')}),'D365_SOLUTION_PACKAGE');
});
test('network and device paths are rejected before attempting local reads',async()=>{
  for(const file_path of ['\\\\server\\share\\s.zip','//server/share/s.zip','\\\\?\\C:\\s.zip'])await error(inspectSolutionPackage({file_path}),'D365_SOLUTION_INVALID');
});
test('tracking keeps malformed/hidden readbacks separate and never echoes platform text',async()=>{
  const f=fixture({job:{solutionid:ids.job,progress:120},solutions:[solution]}),result=await f.service.status({import_job_id:ids.job});
  assert.equal(result.observations.importJob.progress,null);assert.equal(result.observations.importJob.solutionReadback.status,'missing_or_mismatched');
  const malformed=await fixture({async:{asyncoperationid:ids.job}}).service.status({async_operation_id:ids.async});assert.equal(malformed.observations.asyncOperation.status,'failed');
});
test('an abort after native import acceptance retains the accepted receipt without resubmission',async()=>{
  const controller=new AbortController(),f=fixture({request:c=>{if(c.path==='/ImportSolutionAsync')controller.abort();}}),p=await f.service.import(input(f));
  const result=await f.service.import({...input(f),dry_run:false,expected_hash:p.planHash,allow_unprotected_write:true},controller.signal);assert.equal(result.accepted,true);assert.equal(writes(f).length,1);
});
test('MCP routes transfer calls and forwards cancellation without sending native requests',async t=>{
  const signal=new AbortController().signal,mappings=[['export_solution','export'],['import_solution_async','import'],['get_solution_import_status','status']];
  for(const [,method] of mappings)t.mock.method(SolutionTransferService.prototype,method,async(_args,received)=>{assert.equal(received,signal);return {method};});
  const previous={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{for(const [tool,method] of mappings)assert.equal((await handleToolCall(tool,{},{signal})).method,method);}
  finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
for(const mode of ['online','op_ad','op_ifd'])test(`transfer preview, import and status use actual ${mode} request branch offline`,async()=>{
  const f=fixture(),config=readConfig({AUTH_TYPE:mode,ORG_URL:env.orgUrl,ENVIRONMENT_URL:env.orgUrl,API_VERSION:env.apiVersion,
    TENANT_ID:ids.org,CLIENT_ID:ids.user,CLIENT_SECRET:'offline-secret',AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST',
    IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
  const auth=new D365AuthService(config),original=axios.post;axios.post=async()=>({data:{access_token:'offline-token',expires_in:3600}});
  const adapter=async c=>{const url=new URL(c.url),endpoint=decodeURI(url.pathname.replace('/Demo/api/data/v9.1',''))+url.search;assert.equal(url.origin,'https://crm.invalid');
    const response=await f.client.requestWithResponse(endpoint,c.method.toUpperCase(),c.data?JSON.parse(c.data):undefined);return {config:c,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};};
  try{
    auth.getAxiosInstance().defaults.adapter=adapter;
    const service=new SolutionTransferService(auth,{...env,authType:mode}),args=input(f),p=await service.import(args),result=await service.import({...args,dry_run:false,expected_hash:p.planHash,allow_unprotected_write:true});
    assert.equal(result.accepted,true);assert.equal((await service.status({async_operation_id:ids.async})).observations.asyncOperation.completion,'succeeded');assert.equal(writes(f).length,1);
  }finally{axios.post=original;}
});
