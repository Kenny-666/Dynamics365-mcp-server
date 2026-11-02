import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SiteMapJournalService} from '../src/services/siteMapJournal.ts';
const id='11111111-1111-1111-1111-111111111111', user='22222222-2222-2222-2222-222222222222',org='33333333-3333-3333-3333-333333333333';
const before='<SiteMap><Area Id="old"/></SiteMap>',after='<SiteMap><Area Id="new"/></SiteMap>';
function fixture() {let xml=before, version=1, writes=0;
 const client={makeRequest:async()=>({UserId:user,OrganizationId:org}),requestWithResponse:async()=>({status:200,data:{sitemapid:id,sitemapxml:xml,'@odata.etag':`W/"${version}"`},headers:{}})};
 const writer={execute:async (_op,args)=>{writes++;assert.equal(args.if_match,`W/"${version}"`);xml=args.data.sitemapxml;version++;return {etag:`W/"${version}"`};}};
 return {service:new SiteMapJournalService(client,writer,{orgUrl:'https://crm.invalid',apiVersion:'v9.1'}),writes:()=>writes,modify:()=>{xml='<SiteMap/>';version++;}};
}
test('persists backup before save and restores only the verified version',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-journal-test-'));const previous=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try {const f=fixture();const p=await f.service.save({id,xml:after});assert.equal(f.writes(),0);
 const saved=await f.service.save({id,xml:after,dry_run:false,expected_hash:p.planHash});const entry=JSON.parse(await readFile(join(dir,saved.journalId+'.json'),'utf8'));assert.equal(entry.beforeXml,before);assert.equal(entry.status,'saved');
 const rp=await f.service.rollback({journal_id:saved.journalId});const restored=await f.service.rollback({journal_id:saved.journalId,dry_run:false,expected_hash:rp.planHash});assert.equal(restored.restored,true);assert.equal(f.writes(),2);
 await assert.rejects(f.service.rollback({journal_id:saved.journalId}),/not in a verified saved state/);
 } finally {if(previous===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=previous;await rm(dir,{recursive:true,force:true});}
});
test('blocks rollback when a later change occurred',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-journal-test-'));const previous=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try {const f=fixture();const p=await f.service.save({id,xml:after});const saved=await f.service.save({id,xml:after,dry_run:false,expected_hash:p.planHash});f.modify();await assert.rejects(f.service.rollback({journal_id:saved.journalId}),/changed/);assert.equal(f.writes(),1);assert.equal((await readdir(dir)).length,1);
 } finally {if(previous===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=previous;await rm(dir,{recursive:true,force:true});}
});
test('ambiguous write remains journaled and is never replayed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-journal-test-'));const previous=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;let calls=0;
 try {const client={makeRequest:async()=>({UserId:user,OrganizationId:org}),requestWithResponse:async()=>({status:200,data:{sitemapid:id,sitemapxml:before,'@odata.etag':'W/"1"'},headers:{}})};
 const writer={execute:async()=>{calls++;throw new Error('transport timeout');}};const service=new SiteMapJournalService(client,writer,{orgUrl:'https://crm.invalid',apiVersion:'v9.1'});const p=await service.save({id,xml:after});
 await assert.rejects(service.save({id,xml:after,dry_run:false,expected_hash:p.planHash}),error=>{assert.equal(error.data.status,'unknown');return true;});assert.equal(calls,1);
 const files=await readdir(dir);assert.equal(files.length,1);const entry=JSON.parse(await readFile(join(dir,files[0]),'utf8'));assert.equal(entry.status,'unknown');await assert.rejects(service.rollback({journal_id:entry.journalId}),/not in a verified saved state/);
 } finally {if(previous===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=previous;await rm(dir,{recursive:true,force:true});}
});
