import test from 'node:test';
import assert from 'node:assert/strict';
import {AppPublicationService} from '../src/services/appPublication.ts';
import {CrmRequestError} from '../src/errors.ts';
const id='11111111-1111-1111-1111-111111111111';
function fixture() {let posts=0; let modified='2026-01-01'; let failure;
 const client={requestWithResponse:async (url,method)=>{if(method==='GET')return {status:200,data:{appmoduleid:id,uniquename:'app',modifiedon:modified},headers:{}}; posts++; if(failure)throw failure; return {status:204,data:null,headers:{}};}};
 return {service:new AppPublicationService(client,{orgUrl:'https://crm.invalid',apiVersion:'v9.1',authType:'op_ad'}),posts:()=>posts,change:()=>modified='2026-01-02',fail:e=>failure=e};}
test('AppModule publication requires preview, confirms acceptance only',async()=>{const f=fixture();const p=await f.service.publish({id}); assert.equal(f.posts(),0);await assert.rejects(f.service.publish({id,dry_run:false}),/requires/);const r=await f.service.publish({id,dry_run:false,expected_hash:p.planHash,allow_app_publish:true});assert.equal(f.posts(),1);assert.equal(r.publicationAccepted,true);assert.equal(r.published,null);});
test('changed baseline blocks execution and ambiguous errors are not retried',async()=>{const f=fixture();const p=await f.service.publish({id});f.change();await assert.rejects(f.service.publish({id,dry_run:false,expected_hash:p.planHash,allow_app_publish:true}),/baseline changed/);assert.equal(f.posts(),0);const p2=await f.service.publish({id});f.fail(new CrmRequestError('ERR','sensitive text',{outcome:'unknown'}));await assert.rejects(f.service.publish({id,dry_run:false,expected_hash:p2.planHash,allow_app_publish:true}),e=>{assert.equal(e.data.publicationAccepted,null);assert.ok(!JSON.stringify(e.toJSON()).includes('sensitive text'));return true;});assert.equal(f.posts(),1);});
