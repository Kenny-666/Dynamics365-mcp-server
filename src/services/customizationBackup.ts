import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,rename,unlink} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {CrmRequestError} from '../errors.js';
import type {CrmDataClient} from '../types/crmRequest.js';
import {guid,identifier} from './recordMutationInput.js';
import type {ModelUiService} from './modelUi.js';
import type {WebResourceService} from './webResource.js';
type Row=Record<string,any>;
const MAX_BYTES=16_000_000;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class CustomizationBackupError extends CrmRequestError {
 constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_BACKUP_'+code,message,details);}
 override toJSON(){return {...super.toJSON(),data:this.data};}
}
function fail(code:string,message:string):never{throw new CustomizationBackupError(code,message);}
function args(value:unknown,allowed:string[]):Row{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))return fail('INVALID','Invalid backup arguments.');return value as Row;}
function kind(value:unknown):'form'|'view'|'webresource'{if(value!=='form'&&value!=='view'&&value!=='webresource')return fail('INVALID','kind must be form, view or webresource.');return value;}
export class CustomizationBackupService {
 constructor(private client:CrmDataClient,private ui:ModelUiService,private web:WebResourceService,private environment:{orgUrl:string;apiVersion:string}){}
 private root(){const p=process.env.D365_JOURNAL_DIR;if(!p||!isAbsolute(p))return fail('CONFIG','D365_JOURNAL_DIR must be an absolute path.');return p;}
 private path(id:string){return join(this.root(),guid(id)+'.json');}
 private async identity(signal?:AbortSignal){const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)return fail('IDENTITY','CRM identity was not returned.');return digest({org:this.environment.orgUrl.replace(/\/+$/,''),api:this.environment.apiVersion,user:guid(who.UserId),organization:guid(who.OrganizationId)});}
 private async snapshot(k:'form'|'view'|'webresource',id:string,logicalName:string|undefined,signal?:AbortSignal){
  if(k==='webresource'){const result=await this.web.getBackup({id},signal);return {data:result.data,definitionHash:result.definitionHash,etag:result.etag};}
  const result=await this.ui.getComponent({kind:k,id,logical_name:logicalName},signal);return {data:result.xml,definitionHash:result.definitionHash,etag:result.etag};
 }
 private async persist(entry:Row,first=false){
  const raw=JSON.stringify(entry);if(Buffer.byteLength(raw)>MAX_BYTES)return fail('SIZE','Backup exceeds the supported size.');
  await mkdir(this.root(),{recursive:true,mode:0o700});const path=this.path(entry.journalId),target=first?path:path+'.'+randomUUID()+'.tmp';
  const file=await open(target,'wx',0o600);try{await file.writeFile(raw,'utf8');await file.sync();}finally{await file.close();}
  if(!first)try{await rename(target,path);}catch(error){await unlink(target).catch(()=>{});throw error;}
 }
 private async load(id:string){
  const path=this.path(id),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_BYTES)return fail('INVALID','The backup file is not a supported regular file.');
  const file=await open(path,'r');let raw:string;try{const stat=await file.stat();if(!stat.isFile()||stat.size>MAX_BYTES)return fail('INVALID','The backup exceeds the supported size.');raw=await file.readFile('utf8');}finally{await file.close();}
  if(Buffer.byteLength(raw)>MAX_BYTES)return fail('INVALID','The backup exceeds the supported size.');let item:Row;try{item=JSON.parse(raw);}catch{return fail('INVALID','The backup is malformed.');}
  if(!item||item.version!==1||item.kind!=='customization_backup'||item.journalId!==id||!['form','view','webresource'].includes(item.componentKind)||!['backup_ready','restore_pending','restored'].includes(item.status)||!/^[a-f0-9]{64}$/.test(item.identity)||!item.data||typeof item.data!=='object'||Array.isArray(item.data))return fail('INVALID','The backup is invalid.');
  guid(item.targetId);if(item.componentKind!=='webresource')identifier(item.logicalName,'logical_name');
  if(item.backupHash!==digest({identity:item.identity,componentKind:item.componentKind,targetId:item.targetId,logicalName:item.logicalName??null,data:item.data}))return fail('INVALID','Backup integrity check failed.');
  return item;
 }
 async capture(input:unknown,signal?:AbortSignal){
  const a=args(input,['kind','id','logical_name','dry_run','expected_hash']),k=kind(a.kind),id=guid(a.id);
  const logicalName=k==='webresource'?undefined:identifier(a.logical_name,'logical_name');if(k==='webresource'&&a.logical_name!==undefined)return fail('INVALID','logical_name is not used for Web Resources.');
  if(a.dry_run!==undefined&&typeof a.dry_run!=='boolean')return fail('INVALID','dry_run must be boolean.');
  const identity=await this.identity(signal),snapshot=await this.snapshot(k,id,logicalName,signal),backupHash=digest({identity,componentKind:k,targetId:id,logicalName:logicalName??null,data:snapshot.data});
  const planHash=digest({identity,componentKind:k,id,logicalName:logicalName??null,definitionHash:snapshot.definitionHash,etag:snapshot.etag,backupHash}),dry=a.dry_run??true;
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)return fail('CONFLICT','The saved definition changed; preview again.');
  if(!dry&&!a.expected_hash)return fail('PREVIEW_REQUIRED','expected_hash from the preview is required.');
  const state={componentKind:k,id,logicalName:logicalName??null,planHash,backupHash,dryRun:dry,source:'native_saved_including_unpublished',publication:'not_requested'};
  if(dry)return state;
  const entry={version:1,kind:'customization_backup',journalId:randomUUID(),identity,componentKind:k,targetId:id,logicalName:logicalName??null,data:snapshot.data,backupHash,status:'backup_ready',createdAt:new Date().toISOString()};
  await this.persist(entry,true);return {...state,journalId:entry.journalId,backedUp:true};
 }
 async restore(input:unknown,signal?:AbortSignal){
  const a=args(input,['journal_id','solution_unique_name','dry_run','expected_hash']),journalId=guid(a.journal_id);
  if(a.dry_run!==undefined&&typeof a.dry_run!=='boolean')return fail('INVALID','dry_run must be boolean.');
  const lockPath=this.path(journalId)+'.lock',lock=await open(lockPath,'wx',0o600);
  try {
   const item=await this.load(journalId);if(item.status!=='backup_ready')return fail('NOT_RESTORABLE','The backup is not ready for restore; inspect any pending operation.');
   if(await this.identity(signal)!==item.identity)return fail('IDENTITY','Backup belongs to a different CRM identity or environment.');
   const k=kind(item.componentKind),uiArgs={kind:k,id:item.targetId,logical_name:item.logicalName,solution_unique_name:a.solution_unique_name,xml:item.data};
   if(k==='webresource'&&a.solution_unique_name!==undefined)return fail('INVALID','solution_unique_name is not used for Web Resources.');
   const preview=k==='webresource'?await this.web.restoreBackup({id:item.targetId,data:item.data},signal):await this.ui.restoreBackup(uiArgs,signal);
   const planHash=digest({journalId,identity:item.identity,backupHash:item.backupHash,definitionHash:preview.definitionHash,etag:preview.etag,solution:a.solution_unique_name??null}),dry=a.dry_run??true;
   if(a.expected_hash!==undefined&&a.expected_hash!==planHash)return fail('CONFLICT','The restore preview changed.');if(!dry&&!a.expected_hash)return fail('PREVIEW_REQUIRED','expected_hash from the restore preview is required.');
   const result={journalId,componentKind:k,targetId:item.targetId,planHash,dryRun:dry,concurrencyProtected:true,publication:'not_requested'};if(dry)return result;
   item.status='restore_pending';await this.persist(item);
   try{
    const restored:Row=k==='webresource'?await this.web.restoreBackup({id:item.targetId,data:item.data,dry_run:false,expected_hash:preview.definitionHash,if_match:preview.etag},signal):await this.ui.restoreBackup({...uiArgs,dry_run:false,expected_hash:preview.definitionHash,if_match:preview.etag},signal);
    item.status='restored';item.restoredAt=new Date().toISOString();await this.persist(item);return {...result,saved:true,readback:restored.readback};
   }catch(error){
    if(error instanceof CrmRequestError&&error.details.outcome==='not_sent'){item.status='backup_ready';await this.persist(item).catch(()=>{});}
    throw new CustomizationBackupError('RESTORE_FAILED','Restore failed or its outcome is unknown. Inspect the target and backup before retrying.',{journalId,status:item.status},{outcome:error instanceof CrmRequestError?error.details.outcome??'unknown':'unknown',retryable:false});
   }
  }finally{await lock.close();await unlink(lockPath).catch(()=>{});}
 }
}
