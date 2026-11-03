import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RecordJournalService} from '../src/services/recordJournal.ts';
const id='11111111-1111-1111-1111-111111111111',user='22222222-2222-2222-2222-222222222222',org='33333333-3333-3333-3333-333333333333';
function fixture(){let state={name:'old',revenue:5},version=1,writes=0;
 const client={makeRequest:async()=>({UserId:user,OrganizationId:org}),requestWithResponse:async()=>({status:200,data:{...state,'@odata.etag':`W/"${version}"`},headers:{}})};
 const writer={execute:async (_op,a)=>{if(a.dry_run)return {canWrite:true,concurrencyProtected:true};assert.equal(a.if_match,`W/"${version}"`);writes++;state={...state,...a.data};version++;return {};}};
 return {service:new RecordJournalService(client,writer,{orgUrl:'https://crm.invalid',apiVersion:'v9.1'}),writes:()=>writes,modify:()=>{state.name='else';version++;}};}
test('record journal previews, records before-values and safely restores',async()=>{const dir=await mkdtemp(join(tmpdir(),'d365-record-journal-'));const old=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try{const f=fixture(),args={collection_name:'accounts',id,data:{name:'new',revenue:7}},p=await f.service.save(args);assert.equal(f.writes(),0);const saved=await f.service.save({...args,dry_run:false,expected_hash:p.planHash});const file=JSON.parse(await readFile(join(dir,saved.journalId+'.json'),'utf8'));assert.deepEqual(file.before,{name:'old',revenue:5});const rp=await f.service.rollback({journal_id:saved.journalId});const result=await f.service.rollback({journal_id:saved.journalId,dry_run:false,expected_hash:rp.planHash});assert.equal(result.restored,true);assert.equal(f.writes(),2);}
 finally{if(old===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=old;await rm(dir,{recursive:true,force:true});}});
test('record changes and unsupported data prevent unsafe restore or writes',async()=>{const dir=await mkdtemp(join(tmpdir(),'d365-record-journal-'));const old=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;
 try{const f=fixture(),args={collection_name:'accounts',id,data:{name:'new'}},p=await f.service.save(args),saved=await f.service.save({...args,dry_run:false,expected_hash:p.planHash});f.modify();await assert.rejects(f.service.rollback({journal_id:saved.journalId}),/changed/);await assert.rejects(f.service.save({...args,data:{'ownerid@odata.bind':'/x'}}));assert.equal(f.writes(),1);}
 finally{if(old===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=old;await rm(dir,{recursive:true,force:true});}});
