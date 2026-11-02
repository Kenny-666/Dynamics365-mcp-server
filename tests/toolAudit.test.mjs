import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ToolAuditService} from '../src/services/toolAudit.ts';
import {JournalCatalogService} from '../src/services/journalCatalog.ts';
import {CrmRequestError} from '../src/errors.ts';
const user='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',org='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',env={orgUrl:'https://crm.invalid',apiVersion:'v9.1'};
async function fixture(run) {const dir=await mkdtemp(join(tmpdir(),'d365-audit-test-'));const prev=process.env.D365_JOURNAL_DIR;process.env.D365_JOURNAL_DIR=dir;try{const client={makeRequest:async()=>({UserId:user,OrganizationId:org})};await run({dir,service:new ToolAuditService(client,env),catalog:new JournalCatalogService(client,env)});}finally{if(prev===undefined)delete process.env.D365_JOURNAL_DIR;else process.env.D365_JOURNAL_DIR=prev;await rm(dir,{recursive:true,force:true});}}
test('persists pending event before action and records completion without arguments or values',async()=>fixture(async({dir,service,catalog})=>{
 const result=await service.run('update_existing_record',async()=>{const files=await readdir(dir);assert.equal(files.length,1);const record=JSON.parse(await readFile(join(dir,files[0]),'utf8'));assert.equal(record.status,'call_pending');return {secret:'do-not-store'};});
 assert.equal(result.secret,'do-not-store');const list=await catalog.list({});assert.equal(list.total,1);assert.equal(list.items[0].status,'call_completed');assert.equal(list.items[0].rollbackEligibility,'unavailable');assert.ok(!JSON.stringify(list).includes('do-not-store'));
 const entry=await readFile(join(dir,(await readdir(dir))[0]),'utf8');assert.ok(!entry.includes('do-not-store'));
}));
test('records safe error outcome and propagates failure without retries',async()=>fixture(async({dir,service,catalog})=>{
 let calls=0;await assert.rejects(service.run('publish_appmodule',async()=>{calls++;throw new CrmRequestError('FAILED','sensitive platform message',{outcome:'unknown'});}),/sensitive platform message/);
 assert.equal(calls,1);const list=await catalog.list({});assert.equal(list.items[0].status,'call_failed');assert.equal(list.items[0].outcome,'unknown');
 assert.ok(!(await readFile(join(dir,(await readdir(dir))[0]),'utf8')).includes('sensitive platform message'));
}));
test('requires journal configuration before the action',async()=>{const previous=process.env.D365_JOURNAL_DIR;delete process.env.D365_JOURNAL_DIR;let calls=0;try{const service=new ToolAuditService({makeRequest:async()=>({UserId:user,OrganizationId:org})},env);await assert.rejects(service.run('update_existing_record',async()=>{calls++;}),/D365_JOURNAL_DIR/);assert.equal(calls,0);}finally{if(previous!==undefined)process.env.D365_JOURNAL_DIR=previous;}});
