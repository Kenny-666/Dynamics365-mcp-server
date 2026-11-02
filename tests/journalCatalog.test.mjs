import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JournalCatalogService} from '../src/services/journalCatalog.ts';
const id1='11111111-1111-1111-1111-111111111111',id2='22222222-2222-2222-2222-222222222222',id3='33333333-3333-3333-3333-333333333333',user='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',org='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const env={orgUrl:'https://crm.invalid',apiVersion:'v9.1'},identity=createHash('sha256').update(JSON.stringify({org:env.orgUrl,api:env.apiVersion,user,organization:org})).digest('hex');
test('lists only matching identity entries and never returns backup data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-catalog-test-'));const previous=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try{const entry={version:1,journalId:id1,identity,kind:'record_update',collection:'accounts',targetId:id3,status:'saved',afterEtag:'W/"2"',createdAt:'2026-01-02T00:00:00.000Z',before:{name:'sensitive-value'}};
 await writeFile(join(dir,id1+'.json'),JSON.stringify(entry));await writeFile(join(dir,id2+'.json'),JSON.stringify({...entry,journalId:id2,identity:'0'.repeat(64)}));await writeFile(join(dir,id3+'.json'),'{bad json');
 const service=new JournalCatalogService({makeRequest:async()=>({UserId:user,OrganizationId:org})},env);
 const list=await service.list({limit:1});assert.equal(list.total,1);assert.equal(list.items[0].journalId,id1);assert.equal(list.nextOffset,null);assert.ok(!JSON.stringify(list).includes('sensitive-value'));
 const one=await service.get({journal_id:id1});assert.equal(one.rollbackTool,'rollback_record_journal');assert.ok(!JSON.stringify(one).includes('sensitive-value'));
 await assert.rejects(service.get({journal_id:id2}),/not found/);await assert.rejects(service.list({limit:101}),/limit/);
 }finally{if(previous===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=previous;await rm(dir,{recursive:true,force:true});}
});
test('empty catalog does not require directory creation',async()=>{const dir=await mkdtemp(join(tmpdir(),'d365-catalog-test-'));const previous=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=join(dir,'missing');try{const service=new JournalCatalogService({makeRequest:async()=>({UserId:user,OrganizationId:org})},env);assert.deepEqual(await service.list({}),{items:[],total:0,nextOffset:null});}finally{if(previous===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=previous;await rm(dir,{recursive:true,force:true});}});
