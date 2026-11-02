import {createHash,randomUUID} from 'node:crypto';
import {open} from 'node:fs/promises';
import {basename,isAbsolute} from 'node:path';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {RecordMetadata,query} from './recordMetadata.js';
import {guid,identifier} from './recordMutationInput.js';
type Row=Record<string,any>;
const MAX_FILE=5*1024*1024,MAX_TOTAL=20*1024*1024;
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
export class AttachmentError extends CrmRequestError {
 constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_ATTACHMENT_'+code,message,details);}
 override toJSON(){return {...super.toJSON(),data:this.data};}
}
function fail(code:string,message:string):never{throw new AttachmentError(code,message);}
function object(value:unknown,allowed:string[]):Row {if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))return fail('INVALID','Invalid arguments.');return value as Row;}
function text(value:unknown,field:string,max:number):string {if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))return fail('INVALID',`${field} is invalid.`);return value.trim();}
function flag(value:unknown,fallback:boolean):boolean{if(value===undefined)return fallback;if(typeof value!=='boolean')return fail('INVALID','dry_run must be boolean.');return value;}
function binary(value:unknown):Buffer{if(typeof value!=='string'||value.length>Math.ceil(MAX_FILE/3)*4||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))return fail('INVALID','content_base64 must be canonical Base64 within 5 MiB.');const bytes=Buffer.from(value,'base64');if(bytes.length>MAX_FILE||bytes.toString('base64')!==value)return fail('INVALID','Invalid Base64 content.');return bytes;}
async function fileBytes(path:unknown,signal?:AbortSignal):Promise<Buffer>{
 if(typeof path!=='string'||!isAbsolute(path))return fail('INVALID','file_path must be absolute.');if(signal?.aborted)return fail('ABORTED','Operation cancelled before dispatch.');
 try{const file=await open(path,'r');try{const before=await file.stat();if(!before.isFile()||before.size>MAX_FILE)return fail('FILE','The source must be a regular file within 5 MiB.');const bytes=Buffer.alloc(before.size+1);let offset=0;while(offset<bytes.length){if(signal?.aborted)return fail('ABORTED','Operation cancelled before dispatch.');const r=await file.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}const after=await file.stat();if(offset!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)return fail('FILE_CHANGED','The source file changed while reading.');return bytes.subarray(0,offset);}finally{await file.close();}}
 catch(error){if(error instanceof CrmRequestError)throw error;return fail('FILE','The source file could not be read.');}
}
export class AttachmentService {
 constructor(private client:CrmRequestClient,private environment:{orgUrl:string;apiVersion:string}){}
 async list(raw:unknown,signal?:AbortSignal){
  const a=object(raw,['parent_id','parent_logical_name','top']),parent=guid(a.parent_id),top=a.top??50;if(!Number.isInteger(top)||top<1||top>100)fail('INVALID','top must be 1–100.');
  const logical=a.parent_logical_name===undefined?undefined:identifier(a.parent_logical_name,'parent_logical_name');
  const result=await this.client.makeRequest<Row>('/annotations?'+query({'$select':'annotationid,subject,filename,mimetype,filesize,createdon,modifiedon,objecttypecode','$filter':`_objectid_value eq ${parent} and isdocument eq true`+(logical?` and objecttypecode eq '${logical}'`:''),'$top':String(top),'$orderby':'createdon desc'}),'GET',undefined,{signal});
  if(!result||!Array.isArray(result.value)||result.value.length>top)fail('RESPONSE','Attachment listing was incomplete.');
  return {items:result.value.map((item:Row)=>({id:guid(item.annotationid),subject:item.subject??null,filename:item.filename??null,mimeType:item.mimetype??null,size:item.filesize??null,createdOn:item.createdon??null,modifiedOn:item.modifiedon??null,parentLogicalName:item.objecttypecode??null})),limited:!!result['@odata.nextLink']||result.value.length===top,scope:'current_caller_visible_annotations',note:logical?'Filtered by parent logical name.':'Parent ID only; specify parent_logical_name to disambiguate entity types.'};
 }
 async download(raw:unknown,signal?:AbortSignal){
  const a=object(raw,['id','output_path']),id=guid(a.id);
  if(a.output_path!==undefined&&(typeof a.output_path!=='string'||!isAbsolute(a.output_path)))fail('INVALID','output_path must be absolute.');
  const result=await this.client.requestWithResponse<Row>(`/annotations(${id})?$select=annotationid,filename,mimetype,filesize,isdocument,documentbody`,'GET',undefined,{signal});
  if(result.status!==200||!result.data||guid(result.data.annotationid)!==id||result.data.isdocument!==true)fail('RESPONSE','The requested attachment was not returned.');
  const bytes=binary(result.data.documentbody);if(result.data.filesize!==undefined&&result.data.filesize!==null&&result.data.filesize!==bytes.length)fail('RESPONSE','The returned attachment length did not match.');
  const state={id,filename:result.data.filename??null,mimeType:result.data.mimetype??null,size:bytes.length,sha256:sha(bytes)};
  if(a.output_path===undefined)return {...state,contentBase64:bytes.toString('base64')};
  let file;try{file=await open(a.output_path,'wx',0o600);await file.writeFile(bytes);await file.sync();}catch(error){if(file)await file.close().catch(()=>{});throw new AttachmentError('DOWNLOAD_FILE','Unable to finish the output file; existing files are never overwritten. An incomplete file may remain.',{partialOutputPossible:!!file});}await file.close();return {...state,outputPath:a.output_path};
 }
 async downloadBatch(raw:unknown,signal?:AbortSignal){
  const a=object(raw,['files']);if(!Array.isArray(a.files)||a.files.length<1||a.files.length>10)fail('INVALID','files must contain 1–10 downloads.');
  const paths=new Set<string>(),entries=a.files.map((item:unknown)=>{const f=object(item,['id','output_path']),id=guid(f.id);if(typeof f.output_path!=='string'||!isAbsolute(f.output_path))return fail('INVALID','Each output_path must be absolute.');const path=f.output_path.toLowerCase();if(paths.has(path))return fail('INVALID','Output paths must be distinct.');paths.add(path);return {id,output_path:f.output_path};});
  const results:Row[]=[];for(const entry of entries){try{results.push(await this.download(entry,signal));}catch(error){throw new AttachmentError('BATCH_DOWNLOAD_FAILED','Batch stopped; previously downloaded files remain and are not overwritten.',{results,failedId:entry.id,remaining:entries.length-results.length-1,partialOutputPossible:error instanceof AttachmentError?error.data.partialOutputPossible??false:false},{outcome:'not_sent'});}}
  return {results,downloaded:results.length,atomic:false};
 }
 async removeBatch(raw:unknown,signal?:AbortSignal){
  const a=object(raw,['ids','dry_run','expected_hash']),dry=flag(a.dry_run,true);if(!Array.isArray(a.ids)||a.ids.length<1||a.ids.length>10)fail('INVALID','ids must contain 1–10 attachment GUIDs.');
  const ids=a.ids.map(guid);if(new Set(ids).size!==ids.length)fail('INVALID','Duplicate attachment IDs are not allowed.');
  const meta=await new RecordMetadata(this.client,signal).table('annotations');if(meta.IsOptimisticConcurrencyEnabled!==true)fail('CONCURRENCY','Attachment deletion requires native optimistic concurrency.');
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  const entries=[];for(const id of ids){const r=await this.client.requestWithResponse<Row>(`/annotations(${id})?$select=annotationid,filename,isdocument`,'GET',undefined,{signal});
   if(r.status!==200||!r.data||guid(r.data.annotationid)!==id||r.data.isdocument!==true)fail('RESPONSE','A requested attachment was not returned.');const value=r.data['@odata.etag']??r.headers.etag;
   if(typeof value!=='string'||!/^(?:W\/)?"[\x21\x23-\x7e]+"$/.test(value))fail('CONCURRENCY','A specific attachment ETag is required.');entries.push({id,filename:r.data.filename??null,etag:value});}
  const planHash=sha(JSON.stringify({environment:this.environment,identity,entries}));if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','An attachment changed; preview again.');if(!dry&&!a.expected_hash)fail('PREVIEW_REQUIRED','Execution requires the current preview planHash.');
  if(dry)return {dryRun:true,planHash,items:entries,atomic:false};
  const results:Row[]=[];for(const entry of entries){if(signal?.aborted)throw new AttachmentError('ABORTED','Batch stopped before the next deletion.',{results,remaining:entries.length-results.length},{outcome:'not_sent'});
   try{const r=await this.client.requestWithResponse(`/annotations(${entry.id})`,'DELETE',undefined,{headers:{'If-Match':entry.etag},signal});if(![200,204].includes(r.status))throw new CrmRequestError('D365_ATTACHMENT_RESPONSE','Unexpected delete response.',{status:r.status,outcome:'unknown'});results.push({id:entry.id,status:'deleted'});}
   catch(error){const details=error instanceof CrmRequestError?error.details:{},outcome=details.outcome??'unknown';throw new AttachmentError('DELETE_FAILED','Batch stopped. Inspect the target before retrying.',{results,failed:{id:entry.id,outcome},remaining:entries.length-results.length-1},{outcome,status:details.status,retryable:false});}
  }
  return {dryRun:false,planHash,results,deleted:results.length,atomic:false};
 }
 async upload(raw:unknown,signal?:AbortSignal){
  const a=object(raw,['parent_collection','parent_id','files','dry_run','expected_hash']),collection=identifier(a.parent_collection,'parent_collection'),parentId=guid(a.parent_id),dry=flag(a.dry_run,true);
  if(!Array.isArray(a.files)||a.files.length<1||a.files.length>10)fail('INVALID','files must contain 1–10 attachments.');
  const metadata=new RecordMetadata(this.client,signal),[parent,annotation]=await Promise.all([metadata.table(collection),metadata.table('annotations')]);
  const nav='objectid_'+parent.LogicalName;identifier(nav,'annotation navigation');const relation=await metadata.navigation(annotation,parent,nav);if(!relation.single)fail('RELATIONSHIP','A unique single-valued annotation relationship is required.');
  const exists=await this.client.makeRequest<Row>(`/${collection}(${parentId})?`+query({'$select':parent.PrimaryIdAttribute}),'GET',undefined,{signal});if(!exists||guid(exists[parent.PrimaryIdAttribute])!==parentId)fail('PARENT','The parent record could not be verified.');
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  const files=[];let total=0;
  for(const entry of a.files){const item=object(entry,['file_path','content_base64','filename','mime_type','subject']);if((item.file_path===undefined)===(item.content_base64===undefined))fail('INVALID','Each file needs exactly one content source.');
   const bytes=item.file_path===undefined?binary(item.content_base64):await fileBytes(item.file_path,signal);total+=bytes.length;if(total>MAX_TOTAL)fail('SIZE','The batch exceeds 20 MiB.');
   const filename=text(item.filename??(typeof item.file_path==='string'?basename(item.file_path):undefined),'filename',255);if(filename==='.'||filename==='..'||/[\\/]/.test(filename))fail('INVALID','filename must be a file name, not a path.');
   files.push({bytes,filename,mimeType:text(item.mime_type??'application/octet-stream','mime_type',255),subject:text(item.subject??filename,'subject',500),sha256:sha(bytes)});
  }
  const planHash=sha(JSON.stringify({environment:this.environment,identity,collection,parentId,nav,files:files.map(f=>({filename:f.filename,mimeType:f.mimeType,subject:f.subject,size:f.bytes.length,sha256:f.sha256}))}));
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','Target or file content changed; preview again.');if(!dry&&!a.expected_hash)fail('PREVIEW_REQUIRED','Execution requires the current preview planHash.');
  const preview={dryRun:dry,planHash,parentCollection:collection,parentId,items:files.map(f=>({filename:f.filename,mimeType:f.mimeType,size:f.bytes.length,sha256:f.sha256})),atomic:false};if(dry)return preview;
  const results:Row[]=[];for(const file of files){if(signal?.aborted)throw new AttachmentError('ABORTED','Batch stopped before the next file.',{results,remaining:files.length-results.length},{outcome:'not_sent'});
   const id=randomUUID(),body={annotationid:id,isdocument:true,subject:file.subject,filename:file.filename,mimetype:file.mimeType,documentbody:file.bytes.toString('base64'),['objectid_'+parent.LogicalName+'@odata.bind']:`/${collection}(${parentId})`};
   try{const response=await this.client.requestWithResponse('/annotations','POST',body,{signal});if(![200,201,204].includes(response.status))throw new CrmRequestError('D365_ATTACHMENT_RESPONSE','Unexpected create response.',{status:response.status,outcome:'unknown'});results.push({id,filename:file.filename,status:'created',sha256:file.sha256});}
   catch(error){const details=error instanceof CrmRequestError?error.details:{},outcome=details.outcome??'unknown';throw new AttachmentError('UPLOAD_FAILED','Batch stopped. Inspect the reported attachment ID before retrying.',{results,failed:{id,filename:file.filename,outcome},remaining:files.length-results.length-1},{outcome,status:details.status,retryable:false});}
  }
  return {...preview,results,created:results.length};
 }
}
