import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CustomizationBackupService} from '../src/services/customizationBackup.ts';
import {JournalCatalogService} from '../src/services/journalCatalog.ts';
import {CrmRequestError} from '../src/errors.ts';
const target='11111111-1111-1111-1111-111111111111',user='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',org='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const env={orgUrl:'https://crm.invalid',apiVersion:'v9.1'};
async function fixture(run){const dir=await mkdtemp(join(tmpdir(),'d365-custom-backup-'));const old=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 const crm={makeRequest:async()=>({UserId:user,OrganizationId:org})};let current={content:'b2xk',displayname:'Old',description:null},version=1,writes=0;
 const web={getBackup:async()=>({data:structuredClone(current),definitionHash:`h${version}`,etag:`W/"${version}"`}),restoreBackup:async a=>{if(a.dry_run===false){assert.equal(a.if_match,`W/"${version}"`);writes++;current=structuredClone(a.data);version++;return {saved:true,readback:{status:'matched'}};}return {definitionHash:`h${version}`,etag:`W/"${version}"`};}};
 const ui={getComponent:async()=>({xml:{formxml:'<form/>'},definitionHash:'uihash',etag:'W/"1"'}),restoreBackup:async a=>a.dry_run===false?{readback:{status:'matched'}}:{definitionHash:'uihash',etag:'W/"1"'}};
 try{await run({dir,web,ui,service:new CustomizationBackupService(crm,ui,web,env),catalog:new JournalCatalogService(crm,env),modify:()=>{current.content='bmV3';version++;},writes:()=>writes});}
 finally{if(old===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=old;await rm(dir,{recursive:true,force:true});}}
test('backs up unpublished Web Resource and restores only after a fresh preview',async()=>fixture(async f=>{
 const p=await f.service.capture({kind:'webresource',id:target});const backup=await f.service.capture({kind:'webresource',id:target,dry_run:false,expected_hash:p.planHash});
 f.modify();const rp=await f.service.restore({journal_id:backup.journalId});assert.equal(f.writes(),0);const r=await f.service.restore({journal_id:backup.journalId,dry_run:false,expected_hash:rp.planHash});assert.equal(r.saved,true);assert.equal(f.writes(),1);assert.equal(r.publication,'not_requested');
 const catalog=await f.catalog.get({journal_id:backup.journalId});assert.equal(catalog.status,'restored');assert.ok(!JSON.stringify(catalog).includes('b2xk'));
}));
test('rejects stale restore previews and modified backup content',async()=>fixture(async f=>{
 const p=await f.service.capture({kind:'webresource',id:target});const backup=await f.service.capture({kind:'webresource',id:target,dry_run:false,expected_hash:p.planHash});const rp=await f.service.restore({journal_id:backup.journalId});f.modify();
 await assert.rejects(f.service.restore({journal_id:backup.journalId,dry_run:false,expected_hash:rp.planHash}),/preview changed/);assert.equal(f.writes(),0);
 const path=join(f.dir,backup.journalId+'.json'),entry=JSON.parse(await readFile(path,'utf8'));entry.data.content='dGFtcGVy';await writeFile(path,JSON.stringify(entry));await assert.rejects(f.service.restore({journal_id:backup.journalId}),/integrity/);
}));
test('records an uncertain restore and never repeats it automatically',async()=>fixture(async f=>{
 const p=await f.service.capture({kind:'form',id:target,logical_name:'account'});const backup=await f.service.capture({kind:'form',id:target,logical_name:'account',dry_run:false,expected_hash:p.planHash});const rp=await f.service.restore({journal_id:backup.journalId,solution_unique_name:'Solution'});
 f.ui.restoreBackup=async a=>{if(a.dry_run===false)throw new CrmRequestError('TIMEOUT','private message',{outcome:'unknown'});return {definitionHash:'uihash',etag:'W/"1"'};};
 await assert.rejects(f.service.restore({journal_id:backup.journalId,solution_unique_name:'Solution',dry_run:false,expected_hash:rp.planHash}),e=>e.details.outcome==='unknown');
 await assert.rejects(f.service.restore({journal_id:backup.journalId,solution_unique_name:'Solution'}),/not ready/);
}));
import {fixture as uiFixture,ids,env as uiEnv,formArgs,formXml} from './modelUi.fixture.mjs';
test('real UI restore adapter restores captured form after a separate edit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-ui-backup-'));const old=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try{const f=uiFixture(),original=f.client.makeRequest.bind(f.client);f.client.makeRequest=async(path,...args)=>path==='/WhoAmI'?{UserId:user,OrganizationId:org}:original(path,...args);
 const service=new CustomizationBackupService(f.client,f.service,{},uiEnv),args={kind:'form',id:ids.form,logical_name:'new_sample'},p=await service.capture(args),backup=await service.capture({...args,dry_run:false,expected_hash:p.planHash});
 const edit=await f.service.edit(formArgs,'form');await f.service.edit({...formArgs,dry_run:false,expected_hash:edit.definitionHash},'form');assert.notEqual(f.form.formxml,formXml);
 const rp=await service.restore({journal_id:backup.journalId,solution_unique_name:'TestSolution'});const result=await service.restore({journal_id:backup.journalId,solution_unique_name:'TestSolution',dry_run:false,expected_hash:rp.planHash});
 assert.equal(result.readback.status,'matched');assert.equal(f.form.formxml,formXml);assert.ok(!f.calls.some(c=>c.endpoint==='/PublishXml'));
 }finally{if(old===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=old;await rm(dir,{recursive:true,force:true});}
});
test('real view backup restores both FetchXML and layout without publication',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-view-backup-'));const old=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try{const f=uiFixture(),original=f.client.makeRequest.bind(f.client);f.client.makeRequest=async(path,...args)=>path==='/WhoAmI'?{UserId:user,OrganizationId:org}:original(path,...args);
 const service=new CustomizationBackupService(f.client,f.service,{},uiEnv),args={kind:'view',id:ids.view,logical_name:'new_sample'},p=await service.capture(args),backup=await service.capture({...args,dry_run:false,expected_hash:p.planHash}),before=structuredClone(f.view);
 const operations=[{action:'add_column',attribute_name:'new_reference',width:180}],edit=await f.service.edit({id:ids.view,logical_name:'new_sample',solution_unique_name:'TestSolution',operations},'view');
 await f.service.edit({id:ids.view,logical_name:'new_sample',solution_unique_name:'TestSolution',operations,dry_run:false,expected_hash:edit.definitionHash},'view');
 const rp=await service.restore({journal_id:backup.journalId,solution_unique_name:'TestSolution'}),result=await service.restore({journal_id:backup.journalId,solution_unique_name:'TestSolution',dry_run:false,expected_hash:rp.planHash});
 assert.equal(result.readback.status,'matched');assert.equal(f.view.fetchxml,before.fetchxml);assert.equal(f.view.layoutxml,before.layoutxml);assert.ok(!f.calls.some(c=>c.endpoint==='/PublishXml'));
 }finally{if(old===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=old;await rm(dir,{recursive:true,force:true});}
});
test('backup is bound to the CRM user and organization',async()=>fixture(async f=>{
 const p=await f.service.capture({kind:'webresource',id:target}),backup=await f.service.capture({kind:'webresource',id:target,dry_run:false,expected_hash:p.planHash});
 const stranger={makeRequest:async()=>({UserId:'cccccccc-cccc-cccc-cccc-cccccccccccc',OrganizationId:org})};const other=new CustomizationBackupService(stranger,f.ui,f.web,env);
 await assert.rejects(other.restore({journal_id:backup.journalId}),/different CRM identity/);assert.equal(f.writes(),0);
}));
import {WebResourceService} from '../src/services/webResource.ts';
test('real Web Resource adapter restores unpublished content and metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-web-backup-'));const old=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try{let version=1,row={webresourceid:target,name:'new_/x.js',webresourcetype:3,ismanaged:false,displayname:'Old',description:null,content:'b2xk'},patches=0;
 const crm={makeRequest:async path=>path==='/WhoAmI'?{UserId:user,OrganizationId:org}:{LogicalName:'webresource',IsOptimisticConcurrencyEnabled:true},requestWithResponse:async(path,method='GET',body,options={})=>{
  if(method==='GET'){assert.match(path,/RetrieveUnpublished/);return {status:200,data:{...row,'@odata.etag':`W/"${version}"`},headers:{}};}
  assert.equal(method,'PATCH');assert.equal(options.headers['If-Match'],`W/"${version}"`);patches++;row={...row,...body};version++;return {status:204,data:null,headers:{}};}};
 const web=new WebResourceService(crm,{...env,authType:'op_ad'}),service=new CustomizationBackupService(crm,{},web,env),args={kind:'webresource',id:target};
 const p=await service.capture(args),backup=await service.capture({...args,dry_run:false,expected_hash:p.planHash});row={...row,content:'bmV3',displayname:'New'};version++;
 const rp=await service.restore({journal_id:backup.journalId}),result=await service.restore({journal_id:backup.journalId,dry_run:false,expected_hash:rp.planHash});
 assert.equal(result.readback.status,'matched');assert.equal(row.content,'b2xk');assert.equal(row.displayname,'Old');assert.equal(patches,1);
 }finally{if(old===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=old;await rm(dir,{recursive:true,force:true});}
});
