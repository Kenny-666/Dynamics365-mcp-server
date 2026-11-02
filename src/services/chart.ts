import {createHash,randomUUID} from 'node:crypto';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {RecordMetadata,query} from './recordMetadata.js';
import {guid,identifier,etag} from './recordMutationInput.js';
import {uiXml} from './modelUiXml.js';
import {children} from './queryXml.js';
type Row=Record<string,any>;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const scopes={system:{set:'savedqueryvisualizations',id:'savedqueryvisualizationid'},personal:{set:'userqueryvisualizations',id:'userqueryvisualizationid'}} as const;
export class ChartError extends CrmRequestError{constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_CHART_'+code,message,details);}override toJSON(){return {...super.toJSON(),data:this.data};}}
function fail(code:string,message:string):never{throw new ChartError(code,message);}
function args(value:unknown,allowed:string[]):Row{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))return fail('INVALID','Invalid arguments.');return value as Row;}
function scope(value:unknown){if(value!=='system'&&value!=='personal')return fail('INVALID','scope must be system or personal.');return scopes[value];}
function name(value:unknown,max=200){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))return fail('INVALID','Invalid chart text.');return value.trim();}
function bool(value:unknown,fallback:boolean){if(value===undefined)return fallback;if(typeof value!=='boolean')return fail('INVALID','dry_run must be boolean.');return value;}
function validateXml(data:unknown,presentation:unknown,entity:string){
 const dataDoc=uiXml(data,'datadefinition'),chart=uiXml(presentation,'Chart'),fetches=Array.from(dataDoc.getElementsByTagName('fetch'));
 if(!fetches.length||fetches.length>20)fail('XML','Data XML must contain 1–20 FetchXML queries.');
 for(const fetch of fetches){const roots=children(fetch,'entity');if(roots.length!==1||roots[0].getAttribute('name')?.toLowerCase()!==entity.toLowerCase())fail('XML','Every FetchXML root entity must match the chart entity.');}
 if(!chart.documentElement)fail('XML','Presentation XML is invalid.');
}
export class ChartService {
 constructor(private client:CrmRequestClient,private environment:{orgUrl:string;apiVersion:string}){}
 private base(c:typeof scopes[keyof typeof scopes],id:string,system:boolean){return `/${c.set}(${id})`+(system?'/Microsoft.Dynamics.CRM.RetrieveUnpublished()':'');}
 async list(raw:unknown,signal?:AbortSignal){
  const a=args(raw,['scope','entity_logical_name','top']),c=scope(a.scope),entity=identifier(a.entity_logical_name,'entity_logical_name'),top=a.top??50;if(!Number.isInteger(top)||top<1||top>100)fail('INVALID','top must be 1–100.');
  const endpoint=`/${c.set}`+(a.scope==='system'?'/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()':'');
  const result=await this.client.makeRequest<Row>(endpoint+'?'+query({'$select':`${c.id},name,primaryentitytypecode,modifiedon`,'$filter':`primaryentitytypecode eq '${entity}'`,'$top':String(top),'$orderby':'name asc'}),'GET',undefined,{signal});
  if(!result||!Array.isArray(result.value)||result.value.length>top)fail('RESPONSE','Chart list is incomplete.');
  return {scope:a.scope,entity,items:result.value.map((r:Row)=>({id:guid(r[c.id]),name:r.name??null,entity:r.primaryentitytypecode??null,modifiedOn:r.modifiedon??null})),limited:!!result['@odata.nextLink']||result.value.length===top,publication:'not_determined'};
 }
 private async read(c:typeof scopes[keyof typeof scopes],id:string,system:boolean,signal?:AbortSignal){
  const select=[c.id,'name','primaryentitytypecode','datadescription','presentationdescription',...(system?['iscustomizable','ismanaged','componentstate']:[])].join(',');
  const r=await this.client.requestWithResponse<Row>(this.base(c,id,system)+'?'+query({'$select':select}),'GET',undefined,{signal,headers:{'Cache-Control':'no-cache'}});
  if(r.status!==200||!r.data||guid(r.data[c.id])!==id||typeof r.data.primaryentitytypecode!=='string'||typeof r.data.name!=='string')fail('RESPONSE','The requested chart definition was incomplete.');
  const entity=identifier(r.data.primaryentitytypecode,'native entity');validateXml(r.data.datadescription,r.data.presentationdescription,entity);
  const version=etag(r.data['@odata.etag']??r.headers.etag);return {row:r.data,entity,version};
 }
 async get(raw:unknown,signal?:AbortSignal){const a=args(raw,['scope','id']),c=scope(a.scope),id=guid(a.id),r=await this.read(c,id,a.scope==='system',signal);
  return {scope:a.scope,id,name:r.row.name,entity:r.entity,dataXml:r.row.datadescription,presentationXml:r.row.presentationdescription,etag:r.version??null,source:a.scope==='system'?'native_saved_including_unpublished':'personal_chart',publication:'not_determined'};
 }
 async mutate(raw:unknown,signal?:AbortSignal){
  const a=args(raw,['scope','action','id','entity_logical_name','name','description','data_xml','presentation_xml','solution_unique_name','dry_run','expected_hash']),c=scope(a.scope),dry=bool(a.dry_run,true);
  if(!['create','update','delete'].includes(a.action))fail('INVALID','action must be create, update or delete.');
  if(a.action==='create'&&a.id!==undefined||a.action!=='create'&&a.id===undefined)fail('INVALID','id is required only for update and delete.');
  if(a.action==='delete'&&['entity_logical_name','name','description','data_xml','presentation_xml'].some(k=>a[k]!==undefined))fail('INVALID','Delete accepts no definition changes.');
  if(a.action==='update'&&a.entity_logical_name!==undefined)fail('INVALID','Update cannot change the chart entity.');
  let solution:string|undefined;
  if(a.scope==='system'){
   solution=identifier(a.solution_unique_name,'solution_unique_name');
   const found=await this.client.makeRequest<Row>('/solutions?'+query({'$select':'solutionid,uniquename,ismanaged','$filter':`uniquename eq '${solution}'`,'$top':'2'}),'GET',undefined,{signal});
   if(!found||!Array.isArray(found.value)||found.value.length!==1||found['@odata.nextLink']||found.value[0].uniquename!==solution||found.value[0].ismanaged!==false)fail('SOLUTION','A unique unmanaged solution is required.');
   guid(found.value[0].solutionid);
  }else if(a.solution_unique_name!==undefined)fail('INVALID','solution_unique_name is only supported for system charts.');
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  let id:string|null=null,version:string|undefined,entity:string,payload:Row={};
  if(a.action==='create'){
   entity=identifier(a.entity_logical_name,'entity_logical_name');const native=await this.client.makeRequest<Row>(`/EntityDefinitions(LogicalName='${entity}')?$select=LogicalName`,'GET',undefined,{signal});if(native?.LogicalName!==entity)fail('ENTITY','Chart entity could not be verified.');
   payload={name:name(a.name),primaryentitytypecode:entity,datadescription:a.data_xml,presentationdescription:a.presentation_xml};validateXml(payload.datadescription,payload.presentationdescription,entity);
  }else{
   id=guid(a.id);const meta=await new RecordMetadata(this.client,signal).table(c.set);if(meta.IsOptimisticConcurrencyEnabled!==true)fail('CONCURRENCY','Chart update/delete requires native optimistic concurrency.');
   const current=await this.read(c,id,a.scope==='system',signal);version=current.version;entity=current.entity;if(!version)fail('CONCURRENCY','A specific chart ETag is required.');
   if(a.scope==='system'&&(current.row.iscustomizable?.Value!==true||current.row.componentstate!==undefined&&![0,1].includes(current.row.componentstate)))fail('MANAGED','Chart is not explicitly customizable or is deleted.');
   if(a.action==='update'){
    if(a.name!==undefined)payload.name=name(a.name);if(a.data_xml!==undefined)payload.datadescription=a.data_xml;if(a.presentation_xml!==undefined)payload.presentationdescription=a.presentation_xml;
    validateXml(payload.datadescription??current.row.datadescription,payload.presentationdescription??current.row.presentationdescription,entity);
   }
  }
  if(a.description!==undefined)payload.description=name(a.description,2000);
  if(a.action==='update'&&!Object.keys(payload).length)fail('INVALID','At least one chart change is required.');
  const planHash=sha(JSON.stringify({environment:this.environment,identity,scope:a.scope,action:a.action,id,version,entity,solution,payload}));
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','Chart baseline or request changed; preview again.');if(!dry&&!a.expected_hash)fail('PREVIEW_REQUIRED','Execution requires the current preview planHash.');
  const state={scope:a.scope,action:a.action,id,entity,planHash,dryRun:dry,concurrencyProtected:a.action!=='create',solutionUniqueName:solution??null,publication:a.scope==='system'?'not_requested':'not_applicable',validation:'bounded_xml_structure_not_full_xsd_or_runtime'};if(dry)return state;
  const targetId=id??randomUUID(),body=a.action==='create'?{...payload,[c.id]:targetId}:payload,path=a.action==='create'?`/${c.set}`:`/${c.set}(${targetId})`,method=a.action==='create'?'POST':a.action==='update'?'PATCH':'DELETE';
  try{const response=await this.client.requestWithResponse(path,method,a.action==='delete'?undefined:body,{signal,headers:{...(version?{'If-Match':version}:{}),...(solution?{'MSCRM.SolutionUniqueName':solution}:{})}});if(![200,201,204].includes(response.status))throw new CrmRequestError('D365_CHART_RESPONSE','Unexpected native response.',{status:response.status,outcome:'unknown'});}
  catch(error){const details=error instanceof CrmRequestError?error.details:{},outcome=details.outcome??'unknown';throw new ChartError('WRITE_FAILED','Chart operation failed or its outcome is unknown. Inspect the target before retrying.',{id:targetId,action:a.action},{outcome,status:details.status,retryable:false});}
  return {...state,id:targetId,accepted:true,definitionVerified:false,next:a.scope==='system'?'Preview publish_model_table separately and review its table-wide scope.':'Inspect the personal chart in CRM.'};
 }
}
