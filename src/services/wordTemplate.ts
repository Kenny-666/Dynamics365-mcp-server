import {createHash,randomUUID} from 'node:crypto';
import {open} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {RecordMetadata,query} from './recordMetadata.js';
import {guid,identifier,etag} from './recordMutationInput.js';
import {binary,inspectArchive,packageBytes} from './solutionPackage.js';
import {parseXml} from './queryXml.js';
type Row=Record<string,any>;
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const scopes={organization:{set:'documenttemplates',id:'documenttemplateid'},personal:{set:'personaldocumenttemplates',id:'personaldocumenttemplateid'}} as const;
export class TemplateError extends CrmRequestError {constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_TEMPLATE_'+code,message,details);}override toJSON(){return {...super.toJSON(),data:this.data};}}
function fail(code:string,message:string):never{throw new TemplateError(code,message);}
function args(value:unknown,allowed:string[]):Row{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(x=>!allowed.includes(x)))return fail('INVALID','Invalid arguments.');return value as Row;}
function scope(value:unknown){if(value!=='organization'&&value!=='personal')return fail('INVALID','scope must be organization or personal.');return scopes[value];}
function name(value:unknown,field:string,max=200):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))return fail('INVALID',`${field} is invalid.`);return value.trim();}
function bool(value:unknown,fallback:boolean){if(value===undefined)return fallback;if(typeof value!=='boolean')return fail('INVALID','dry_run must be boolean.');return value;}
function docx(bytes:Buffer,signal?:AbortSignal){
 const archive=inspectArchive(bytes,{'[Content_Types].xml':1024*1024},signal),names=new Set(archive.entries.map(x=>x.name));
 if(!names.has('[Content_Types].xml')||!names.has('word/document.xml')||[...names].some(x=>/(^|\/)vbaProject\.bin$/i.test(x)))return fail('DOCX','A DOCX package with standard Word parts is required.');
 const contentTypes=archive.payloads.get('[Content_Types].xml');if(!contentTypes)return fail('DOCX','Content types are missing.');
 let root;try{root=parseXml(contentTypes.toString('utf8'),'Types').documentElement!;}catch{return fail('DOCX','Content types XML is invalid.');}
 const overrides=Array.from(root.getElementsByTagName('Override')).filter(e=>e.getAttribute('PartName')==='/word/document.xml');
 if(overrides.length!==1||overrides[0].getAttribute('ContentType')!=='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')return fail('DOCX','The package is not a standard non-macro Word document.');
 return {size:bytes.length,sha256:sha(bytes),entries:names.size,validation:'bounded_zip_and_required_parts_not_template_mapping'};
}
export class WordTemplateService {
 constructor(private client:CrmRequestClient,private environment:{orgUrl:string;apiVersion:string}){}
 async list(raw:unknown,signal?:AbortSignal){
  const a=args(raw,['scope','entity_logical_name','top']),c=scope(a.scope),top=a.top??50;if(!Number.isInteger(top)||top<1||top>100)fail('INVALID','top must be 1–100.');
  const entity=a.entity_logical_name===undefined?undefined:identifier(a.entity_logical_name,'entity_logical_name');
  const result=await this.client.makeRequest<Row>(`/${c.set}?`+query({'$select':`${c.id},name,description,associatedentitytypecode,documenttype,languagecode,modifiedon`,'$filter':'documenttype eq 2'+(entity?` and associatedentitytypecode eq '${entity}'`:''),'$top':String(top),'$orderby':'name asc'}),'GET',undefined,{signal});
  if(!result||!Array.isArray(result.value)||result.value.length>top)fail('RESPONSE','Template list is incomplete.');
  return {items:result.value.map((r:Row)=>({id:guid(r[c.id]),name:r.name??null,description:r.description??null,entity:r.associatedentitytypecode??null,languageCode:r.languagecode??null,modifiedOn:r.modifiedon??null})),limited:!!result['@odata.nextLink']||result.value.length===top};
 }
 private async read(c:typeof scopes[keyof typeof scopes],id:string,signal?:AbortSignal){
  const r=await this.client.requestWithResponse<Row>(`/${c.set}(${id})?$select=${c.id},name,description,associatedentitytypecode,documenttype,languagecode,content`,'GET',undefined,{signal,headers:{'Cache-Control':'no-cache'}});
  if(r.status!==200||!r.data||guid(r.data[c.id])!==id||r.data.documenttype!==2||typeof r.data.content!=='string')fail('RESPONSE','The requested Word template was not returned.');
  const bytes=binary(r.data.content),version=etag(r.data['@odata.etag']??r.headers.etag);return {row:r.data,bytes,version};
 }
 async download(raw:unknown,signal?:AbortSignal){
  const a=args(raw,['scope','id','output_path']),c=scope(a.scope),id=guid(a.id);if(a.output_path!==undefined&&(typeof a.output_path!=='string'||!isAbsolute(a.output_path)))fail('INVALID','output_path must be absolute.');
  const {row,bytes,version}=await this.read(c,id,signal),info=docx(bytes,signal),state={id,name:row.name??null,entity:row.associatedentitytypecode??null,etag:version??null,...info};
  if(a.output_path===undefined)return {...state,contentBase64:bytes.toString('base64')};let file;
  try{file=await open(a.output_path,'wx',0o600);await file.writeFile(bytes);await file.sync();}catch{if(file)await file.close().catch(()=>{});throw new TemplateError('DOWNLOAD_FILE','Unable to finish output; existing files are never overwritten.',{partialOutputPossible:!!file});}await file.close();return {...state,outputPath:a.output_path};
 }
 async mutate(raw:unknown,signal?:AbortSignal){
  const a=args(raw,['scope','action','id','name','entity_logical_name','language_code','description','file_path','content_base64','dry_run','expected_hash']),c=scope(a.scope),dry=bool(a.dry_run,true);
  if(!['create','update','delete'].includes(a.action))fail('INVALID','action must be create, update or delete.');
  if(a.action==='create'&&a.id!==undefined||a.action!=='create'&&a.id===undefined)fail('INVALID','id is required only for update and delete.');
  if(a.action==='delete'&&['name','entity_logical_name','language_code','description','file_path','content_base64'].some(k=>a[k]!==undefined))fail('INVALID','Delete accepts no content or metadata changes.');
  if(a.action==='update'&&['entity_logical_name','language_code'].some(k=>a[k]!==undefined))fail('INVALID','Update does not change the associated entity or language.');
  let payload:Row={},summary:Row={};
  if(a.action!=='delete'){
   const bytes=await packageBytes({file_path:a.file_path,content_base64:a.content_base64},signal);summary=docx(bytes,signal);payload.content=bytes.toString('base64');
   if(a.name!==undefined)payload.name=name(a.name,'name');if(a.description!==undefined)payload.description=name(a.description,'description',2000);
   if(a.action==='create'){
    payload.name=name(a.name,'name');payload.associatedentitytypecode=identifier(a.entity_logical_name,'entity_logical_name');
    if(!Number.isInteger(a.language_code)||a.language_code<1||a.language_code>65535)fail('INVALID','language_code must be an LCID between 1 and 65535.');
    payload.languagecode=a.language_code;payload.documenttype=2;
    const entity=await this.client.makeRequest<Row>(`/EntityDefinitions(LogicalName='${payload.associatedentitytypecode}')?$select=LogicalName`,'GET',undefined,{signal});
    if(entity?.LogicalName!==payload.associatedentitytypecode)fail('ENTITY','The associated entity was not verified.');
   }
  }
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  let id:string|null=null,version:string|undefined;
  if(a.action!=='create'){
   id=guid(a.id);const metadata=await new RecordMetadata(this.client,signal).table(c.set);if(metadata.IsOptimisticConcurrencyEnabled!==true)fail('CONCURRENCY','Template update/delete requires native optimistic concurrency.');
   const before=await this.read(c,id,signal);version=before.version;if(!version)fail('CONCURRENCY','A specific template ETag is required.');
  }
  const planHash=sha(JSON.stringify({environment:this.environment,identity,scope:a.scope,action:a.action,id,version,payloadHash:sha(JSON.stringify(payload))}));
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','Template or input changed; preview again.');if(!dry&&!a.expected_hash)fail('PREVIEW_REQUIRED','Execution requires the current preview planHash.');
  const state={scope:a.scope,action:a.action,id,planHash,dryRun:dry,content:summary,concurrencyProtected:a.action!=='create'};if(dry)return state;
  const targetId=id??randomUUID(),body=a.action==='create'?{...payload,[c.id]:targetId}:payload,path=a.action==='create'?`/${c.set}`:`/${c.set}(${targetId})`,method=a.action==='create'?'POST':a.action==='update'?'PATCH':'DELETE';
  try{const response=await this.client.requestWithResponse(path,method,a.action==='delete'?undefined:body,{signal,headers:version?{'If-Match':version}:{}});if(![200,201,204].includes(response.status))throw new CrmRequestError('D365_TEMPLATE_RESPONSE','Unexpected native response.',{status:response.status,outcome:'unknown'});}
  catch(error){const details=error instanceof CrmRequestError?error.details:{},outcome=details.outcome??'unknown';throw new TemplateError('WRITE_FAILED','Template operation failed or its outcome is unknown. Inspect the target ID before retrying.',{id:targetId,action:a.action},{outcome,status:details.status,retryable:false});}
  return {...state,id:targetId,accepted:true,contentVerified:false,note:'CRM accepted the request; template mapping and generated document behavior were not verified.'};
 }
}
