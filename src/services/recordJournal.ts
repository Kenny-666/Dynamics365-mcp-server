import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { CrmRequestError } from '../errors.js';
import type { CrmRequestClient } from '../types/crmRequest.js';
import type { RecordMutationService } from './recordMutation.js';
import { etag, guid, identifier } from './recordMutationInput.js';
type Row=Record<string,any>;
const stable=(o:Row)=>JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class RecordJournalError extends CrmRequestError {
 constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}) {super('D365_RECORD_JOURNAL_'+code,message,details);}
 override toJSON(){return {...super.toJSON(),data:this.data};}
}
function fail(code:string,message:string):never {throw new RecordJournalError(code,message);}
function values(value:unknown):Row {
 if (!value || typeof value!=='object' || Array.isArray(value)) return fail('INVALID','data must be a field/value object.');
 const entries=Object.entries(value);if (!entries.length || entries.length>20) return fail('INVALID','data must contain 1–20 fields.');
 const result:Row=Object.create(null);
 for (const [name,v] of entries) {
  identifier(name,'field');
  if (!(v===null || typeof v==='boolean' || typeof v==='number' && Number.isFinite(v) || typeof v==='string' && v.length<=10000)) return fail('INVALID','Only null, boolean, finite numbers and strings are supported.');
  result[name]=v;
 }
 if (Buffer.byteLength(JSON.stringify(result))>100000) return fail('INVALID','data is too large.');return result;
}
export class RecordJournalService {
 constructor(private client:CrmRequestClient,private writer:RecordMutationService,private environment:{orgUrl:string;apiVersion:string}) {}
 private root(){const p=process.env.D365_JOURNAL_DIR;if (!p || !isAbsolute(p)) return fail('CONFIG','D365_JOURNAL_DIR must be an absolute path.');return p;}
 private path(id:string){return join(this.root(),guid(id)+'.json');}
 private async identity(signal?:AbortSignal) {const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)return fail('IDENTITY','CRM identity missing.');return hash({org:this.environment.orgUrl.replace(/\/+$/,''),api:this.environment.apiVersion,user:guid(who.UserId),organization:guid(who.OrganizationId)});}
 private async read(collection:string,id:string,fields:string[],signal?:AbortSignal) {
  const query=new URLSearchParams({'$select':fields.join(',')});const r=await this.client.requestWithResponse<Row>(`/${collection}(${id})?${query}`,'GET',undefined,{signal,headers:{'Cache-Control':'no-cache'}});
  if(r.status!==200 || !r.data || fields.some(k=>!Object.hasOwn(r.data!,k))) return fail('READ','Record or selected fields were not fully returned.');
  const version=etag(r.data['@odata.etag']??r.headers.etag);if(!version)return fail('ETAG_REQUIRED','A specific record ETag is required.');
  const data=values(Object.fromEntries(fields.map(k=>[k,r.data![k]])));return {data,version};
 }
 private async writeFile(entry:Row,create=false) {
  await mkdir(this.root(),{recursive:true,mode:0o700});const path=this.path(entry.journalId),target=create?path:path+'.'+randomUUID()+'.tmp';
  const file=await open(target,'wx',0o600);try{await file.writeFile(JSON.stringify(entry),'utf8');await file.sync();}finally{await file.close();}
  if(!create)try{await rename(target,path);}catch(error){await unlink(target).catch(()=>{});throw error;}
 }
 private async load(id:string) {
  const text=await readFile(this.path(id),'utf8');if(Buffer.byteLength(text)>300000)return fail('INVALID','Journal entry is too large.');
  let entry:Row;try{entry=JSON.parse(text);}catch{return fail('INVALID','Invalid journal.');}
  if(!entry || entry.version!==1 || entry.kind!=='record_update' || entry.journalId!==id || !/^[a-f0-9]{64}$/.test(entry.identity))return fail('INVALID','Invalid journal.');
  identifier(entry.collection,'collection');guid(entry.targetId);const before=values(entry.before),after=values(entry.after);
  if(JSON.stringify(Object.keys(before).sort())!==JSON.stringify(Object.keys(after).sort()) || entry.beforeHash!==hash(stable(before)) || entry.afterHash!==hash(stable(after)))return fail('INVALID','Journal integrity check failed.');
  return entry;
 }
 async save(input:Row,signal?:AbortSignal) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['collection_name','id','data','dry_run','expected_hash'].includes(k)))return fail('INVALID','Invalid arguments.');
  const collection=identifier(input.collection_name,'collection_name'),id=guid(input.id),after=values(input.data);
  if(collection.toLowerCase()==='sitemaps')return fail('INVALID','Use the dedicated SiteMap journal tool.');
  if(input.dry_run!==undefined && typeof input.dry_run!=='boolean')return fail('INVALID','dry_run must be boolean.');
  const identity=await this.identity(signal),before=await this.read(collection,id,Object.keys(after),signal),dry=input.dry_run??true;
  const planHash=hash({identity,collection,id,before:stable(before.data),etag:before.version,after:stable(after)});
  if(input.expected_hash!==undefined && input.expected_hash!==planHash)return fail('CONFLICT','Record changed; preview again.');if(!dry&&!input.expected_hash)return fail('PREVIEW_REQUIRED','expected_hash from preview is required.');
  const preview=await this.writer.execute('update',{collection_name:collection,id,data:after,if_match:before.version,dry_run:true},signal);
  if(!preview.canWrite || !preview.concurrencyProtected)return fail('UNSUPPORTED','Native metadata did not confirm a concurrency-protected update.');
  if(dry)return {collectionName:collection,id,planHash,dryRun:true,canWrite:true,fields:Object.keys(after)};
  const entry:Row={version:1,kind:'record_update',journalId:randomUUID(),identity,collection,targetId:id,before:before.data,after,beforeHash:hash(stable(before.data)),afterHash:hash(stable(after)),status:'pending',createdAt:new Date().toISOString()};
  await this.writeFile(entry,true);let result:Row;
  try{result=await this.writer.execute('update',{collection_name:collection,id,data:after,if_match:before.version},signal);}catch{entry.status='unknown';await this.writeFile(entry).catch(()=>{});throw new RecordJournalError('WRITE_UNKNOWN','Write failed or its outcome is unknown. Inspect before retrying.',{journalId:entry.journalId},{outcome:'unknown',retryable:false});}
  try{const current=await this.read(collection,id,Object.keys(after),signal);if(!result.etag || etag(result.etag)!==current.version || stable(current.data)!==stable(after))throw new Error('Mismatch');entry.afterEtag=current.version;entry.status='saved';await this.writeFile(entry);}catch{throw new RecordJournalError('READBACK_UNKNOWN','Write was accepted but readback could not be verified.',{journalId:entry.journalId},{outcome:'unknown',retryable:false});}
  return {collectionName:collection,id,journalId:entry.journalId,saved:true,dryRun:false};
 }
 async rollback(input:Row,signal?:AbortSignal) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['journal_id','dry_run','expected_hash'].includes(k)))return fail('INVALID','Invalid arguments.');
  const id=guid(input.journal_id);if(input.dry_run!==undefined && typeof input.dry_run!=='boolean')return fail('INVALID','dry_run must be boolean.');
  const lockPath=this.path(id)+'.lock',lock=await open(lockPath,'wx',0o600);
  try{const entry=await this.load(id);if(entry.status!=='saved'||!etag(entry.afterEtag))return fail('NOT_ROLLBACKABLE','Entry is not in a verified saved state.');
   if(await this.identity(signal)!==entry.identity)return fail('IDENTITY','Journal belongs to another environment or identity.');
   const current=await this.read(entry.collection,entry.targetId,Object.keys(entry.after),signal);
   if(current.version!==entry.afterEtag || stable(current.data)!==stable(entry.after))return fail('CONFLICT','Record changed after the saved operation.');
   const planHash=hash({id,identity:entry.identity,etag:current.version,restore:stable(entry.before)}),dry=input.dry_run??true;
   if(input.expected_hash!==undefined&&input.expected_hash!==planHash)return fail('CONFLICT','Rollback preview changed.');if(!dry&&!input.expected_hash)return fail('PREVIEW_REQUIRED','expected_hash is required.');
   if(dry)return {journalId:id,planHash,dryRun:true,fields:Object.keys(entry.before)};
   entry.status='rollback_pending';await this.writeFile(entry);
   try{await this.writer.execute('update',{collection_name:entry.collection,id:entry.targetId,data:entry.before,if_match:current.version},signal);const after=await this.read(entry.collection,entry.targetId,Object.keys(entry.before),signal);if(stable(after.data)!==stable(entry.before))throw new Error('Mismatch');entry.status='rolled_back';await this.writeFile(entry);}catch{throw new RecordJournalError('ROLLBACK_UNKNOWN','Rollback failed or could not be verified.',{journalId:id},{outcome:'unknown',retryable:false});}
   return {journalId:id,dryRun:false,restored:true};
  }finally{await lock.close();await unlink(lockPath).catch(()=>{});}
 }
}
