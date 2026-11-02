import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AttachmentService} from '../src/services/attachment.ts';
import {CrmRequestError} from '../src/errors.ts';
const parent='11111111-1111-1111-1111-111111111111',org='22222222-2222-2222-2222-222222222222',user='33333333-3333-3333-3333-333333333333',note='44444444-4444-4444-4444-444444444444';
function fixture(failAt=0){const calls=[];let posts=0;
 const client={makeRequest:async endpoint=>{
  const u=new URL(endpoint,'https://crm.invalid'),path=u.pathname;
  if(path==='/WhoAmI')return {UserId:user,OrganizationId:org};
  if(path==='/EntityDefinitions'){const f=u.searchParams.get('$filter');return {value:[f.includes('annotations')?{LogicalName:'annotation',EntitySetName:'annotations',PrimaryIdAttribute:'annotationid',IsOptimisticConcurrencyEnabled:true}:{LogicalName:'account',EntitySetName:'accounts',PrimaryIdAttribute:'accountid'}]};}
  if(path.includes('/ManyToOneRelationships'))return {value:[{ReferencingEntityNavigationPropertyName:'objectid_account',ReferencingAttribute:'objectid',ReferencedEntity:'account'}]};
  if(path.includes('/OneToManyRelationships')||path.includes('/ManyToManyRelationships'))return {value:[]};
  if(path.startsWith('/accounts('))return {accountid:parent};
  if(path==='/annotations')return {value:[{annotationid:note,filename:'example.txt',filesize:3}]};
  throw Error('unexpected read '+path);
 },requestWithResponse:async(endpoint,method='GET',body,options)=>{calls.push({endpoint,method,body,options});if(method==='POST'){posts++;if(posts===failAt)throw new CrmRequestError('TIMEOUT','private message',{outcome:'unknown'});return {status:204,data:null,headers:{}};}return {status:200,data:{annotationid:note,filename:'a.txt',mimetype:'text/plain',isdocument:true,filesize:3,documentbody:'YWJj','@odata.etag':'W/\"1\"'},headers:{}};}};
 return {service:new AttachmentService(client,{orgUrl:'https://crm.invalid',apiVersion:'v9.1'}),calls};}
const input={parent_collection:'accounts',parent_id:parent,files:[{filename:'one.txt',content_base64:'YWJj'},{filename:'two.txt',content_base64:'ZGVm'}]};
test('attachment upload previews metadata, then creates independent notes without replay',async()=>{const f=fixture(),p=await f.service.upload(input);assert.equal(p.dryRun,true);assert.equal(f.calls.length,0);const result=await f.service.upload({...input,dry_run:false,expected_hash:p.planHash});assert.equal(result.created,2);assert.equal(result.atomic,false);assert.equal(f.calls[0].body['objectid_account@odata.bind'],`/accounts(${parent})`);assert.match(f.calls[0].body.annotationid,/^[0-9a-f-]{36}$/);});
test('changed content blocks write and unknown result stops batch',async()=>{const f=fixture(2),p=await f.service.upload(input);await assert.rejects(f.service.upload({...input,files:[{filename:'one.txt',content_base64:'eA=='}],dry_run:false,expected_hash:p.planHash}),/changed/);assert.equal(f.calls.length,0);await assert.rejects(f.service.upload({...input,dry_run:false,expected_hash:p.planHash}),e=>{assert.equal(e.data.results.length,1);assert.equal(e.data.failed.outcome,'unknown');assert.ok(!JSON.stringify(e.toJSON()).includes('private message'));return true;});assert.equal(f.calls.length,2);});
test('download does not overwrite existing files and checks returned length',async()=>{const dir=await mkdtemp(join(tmpdir(),'d365-attachment-'));try{const f=fixture(),path=join(dir,'out.txt');await writeFile(path,'original');await assert.rejects(f.service.download({id:note,output_path:path}),/never overwritten/);assert.equal(await readFile(path,'utf8'),'original');const second=join(dir,'new.txt'),result=await f.service.download({id:note,output_path:second});assert.equal(await readFile(second,'utf8'),'abc');assert.equal(result.size,3);assert.equal((await f.service.download({id:note})).contentBase64,'YWJj');}finally{await rm(dir,{recursive:true,force:true});}});
test('list and source validation reject invalid data',async()=>{const f=fixture();assert.equal((await f.service.list({parent_id:parent})).items[0].id,note);await assert.rejects(f.service.upload({...input,files:[{filename:'../bad',content_base64:'YWJj'}]}),/file name/);await assert.rejects(f.service.upload({...input,files:[{filename:'x',content_base64:'!'}]}),/Base64/);});

test('batch download stops without overwriting existing files',async()=>{const dir=await mkdtemp(join(tmpdir(),'d365-attachment-'));try{const f=fixture(),first=join(dir,'first.txt'),second=join(dir,'second.txt');await writeFile(second,'keep');await assert.rejects(f.service.downloadBatch({files:[{id:note,output_path:first},{id:note,output_path:second}]}),e=>{assert.equal(e.data.results.length,1);return true;});assert.equal(await readFile(first,'utf8'),'abc');assert.equal(await readFile(second,'utf8'),'keep');}finally{await rm(dir,{recursive:true,force:true});}});
test('batch deletion requires preview and sends a specific ETag',async()=>{const f=fixture(),p=await f.service.removeBatch({ids:[note]});assert.equal(p.dryRun,true);assert.equal(p.items[0].etag,'W/"1"');await assert.rejects(f.service.removeBatch({ids:[note],dry_run:false}),/preview/);const r=await f.service.removeBatch({ids:[note],dry_run:false,expected_hash:p.planHash});assert.equal(r.deleted,1);assert.equal(f.calls.find(c=>c.method==='DELETE').options.headers['If-Match'],'W/\"1\"');});
