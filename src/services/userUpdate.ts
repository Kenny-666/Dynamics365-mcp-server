import {createHash} from 'node:crypto';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import type {RecordMutationService} from './recordMutation.js';
import {guid,etag} from './recordMutationInput.js';
import {query} from './recordMetadata.js';
type Row=Record<string,any>;
const fields=['firstname','lastname','internalemailaddress','title','telephone1','mobilephone','isdisabled'];
function stable(value:Row){return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));}
export class UserUpdateError extends CrmRequestError {constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_USER_UPDATE_'+code,message,details);}override toJSON(){return {...super.toJSON(),data:this.data};}}
function fail(code:string,message:string):never{throw new UserUpdateError(code,message);}
function changes(value:unknown):Row{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail('INVALID','changes must be an object.');const entries=Object.entries(value);if(!entries.length||entries.some(([key])=>!fields.includes(key)))return fail('INVALID','Only supported profile fields and isdisabled may be changed.');
 const result:Row=Object.create(null);for(const [key,item] of entries){if(key==='isdisabled'){if(typeof item!=='boolean')return fail('INVALID','isdisabled must be boolean.');}else if(item!==null&&(typeof item!=='string'||item.length>320||/[\u0000-\u001f\u007f]/.test(item)))return fail('INVALID','Profile values must be bounded strings or null.');if(key==='lastname'&&(typeof item!=='string'||!item.trim()))return fail('INVALID','lastname cannot be empty.');result[key]=item;}return result;
}
export class UserUpdateService {
 constructor(private client:CrmRequestClient,private writer:RecordMutationService,private environment:{orgUrl:string;apiVersion:string}){}
 private async read(id:string,selected:string[],signal?:AbortSignal){const r=await this.client.requestWithResponse<Row>(`/systemusers(${id})?`+query({'$select':['systemuserid',...selected].join(',')}),'GET',undefined,{signal});
  if(r.status!==200||!r.data||guid(r.data.systemuserid)!==id||selected.some(k=>!Object.hasOwn(r.data!,k)))return fail('READ','User fields were not fully returned.');const version=etag(r.data['@odata.etag']??r.headers.etag);if(!version)return fail('CONCURRENCY','A specific user ETag is required.');return {values:Object.fromEntries(selected.map(k=>[k,r.data![k]])),version};}
 async execute(raw:unknown,signal?:AbortSignal){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['user_id','changes','dry_run','expected_hash','allow_access_change'].includes(k)))return fail('INVALID','Invalid user update arguments.');
  const a=raw as Row,id=guid(a.user_id),wanted=changes(a.changes);if(a.dry_run!==undefined&&typeof a.dry_run!=='boolean'||a.allow_access_change!==undefined&&typeof a.allow_access_change!=='boolean')fail('INVALID','Boolean argument expected.');
  const dry=a.dry_run??true,who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  const before=await this.read(id,Object.keys(wanted),signal),planHash=createHash('sha256').update(JSON.stringify({environment:this.environment,identity,id,version:before.version,before:stable(before.values),wanted:stable(wanted)})).digest('hex');
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','User details changed; preview again.');
  const preflight=await this.writer.execute('update',{collection_name:'systemusers',id,data:wanted,if_match:before.version,dry_run:true},signal);
  if(!preflight.canWrite||!preflight.concurrencyProtected)fail('CONCURRENCY','Native optimistic concurrency is required.');
  const state={userId:id,fields:Object.keys(wanted),currentUser:id===identity.user,accessChange:Object.hasOwn(wanted,'isdisabled'),planHash,dryRun:dry,concurrencyProtected:true};if(dry)return {...state,preview:preflight.changes};
  if(!a.expected_hash||state.accessChange&&a.allow_access_change!==true)fail('PREVIEW_REQUIRED','Execution requires the preview planHash; changing isdisabled also requires allow_access_change=true.');
  try{await this.writer.execute('update',{collection_name:'systemusers',id,data:wanted,if_match:before.version},signal);}
  catch(error){const details=error instanceof CrmRequestError?error.details:{},outcome=details.outcome??'unknown';throw new UserUpdateError('WRITE_FAILED','User update failed or its outcome is unknown; inspect the target before retrying.',state,{outcome,status:details.status,retryable:false});}
  try{const after=await this.read(id,Object.keys(wanted),signal);if(stable(after.values)!==stable(wanted))throw Error('readback mismatch');return {...state,accepted:true,verified:true};}
  catch{throw new UserUpdateError('READBACK_FAILED','User update was accepted but could not be verified. Do not retry automatically.',{...state,accepted:true},{outcome:'unknown',retryable:false});}
 }
}
