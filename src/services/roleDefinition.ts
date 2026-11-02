import {createHash,randomUUID} from 'node:crypto';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {RecordMetadata,literal,query} from './recordMetadata.js';
import {guid,identifier,etag} from './recordMutationInput.js';
type Row=Record<string,any>;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class RoleDefinitionError extends CrmRequestError{constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_ROLE_DEFINITION_'+code,message,details);}override toJSON(){return {...super.toJSON(),data:this.data};}}
function fail(code:string,message:string):never{throw new RoleDefinitionError(code,message);}
function text(value:unknown,field:string,max:number){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))return fail('INVALID',`${field} is invalid.`);return value.trim();}
export class RoleDefinitionService{
 constructor(private client:CrmRequestClient,private environment:{orgUrl:string;apiVersion:string}){}
 async execute(raw:unknown,signal?:AbortSignal){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['action','id','business_unit_id','name','description','solution_unique_name','dry_run','expected_hash','allow_role_change'].includes(k)))return fail('INVALID','Invalid role arguments.');
  const a=raw as Row;if(!['create','update','delete'].includes(a.action))fail('INVALID','action must be create, update or delete.');
  if(a.dry_run!==undefined&&typeof a.dry_run!=='boolean'||a.allow_role_change!==undefined&&typeof a.allow_role_change!=='boolean')fail('INVALID','Boolean argument expected.');
  if(a.action==='create'&&a.id!==undefined||a.action!=='create'&&a.id===undefined)fail('INVALID','id is required only for update or delete.');
  if(a.action!=='create'&&a.business_unit_id!==undefined)fail('INVALID','Role business unit cannot be changed here.');
  if(a.action==='delete'&&(a.name!==undefined||a.description!==undefined))fail('INVALID','Delete accepts no field changes.');
  const solution=identifier(a.solution_unique_name,'solution_unique_name'),solutions=await this.client.makeRequest<Row>('/solutions?'+query({'$select':'solutionid,uniquename,ismanaged','$filter':`uniquename eq ${literal(solution)}`,'$top':'2'}),'GET',undefined,{signal});
  if(!solutions||!Array.isArray(solutions.value)||solutions.value.length!==1||solutions['@odata.nextLink']||solutions.value[0].uniquename!==solution||solutions.value[0].ismanaged!==false)fail('SOLUTION','A unique unmanaged solution is required.');
  const solutionId=guid(solutions.value[0].solutionid),who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  const dry=a.dry_run??true,payload:Row={};let id:string|null=null,version:string|undefined,businessUnitId:string;
  if(a.action==='create'){
   businessUnitId=guid(a.business_unit_id);payload.name=text(a.name,'name',200);if(a.description!==undefined)payload.description=text(a.description,'description',2000);
   const bu=await this.client.makeRequest<Row>(`/businessunits(${businessUnitId})?$select=businessunitid,isdisabled`,'GET',undefined,{signal});if(!bu||guid(bu.businessunitid)!==businessUnitId||bu.isdisabled!==false)fail('BUSINESS_UNIT','The business unit is missing, disabled or incomplete.');
   const duplicate=await this.client.makeRequest<Row>('/roles?'+query({'$select':'roleid,name','$filter':`name eq ${literal(payload.name)} and _businessunitid_value eq ${businessUnitId}`,'$top':'2'}),'GET',undefined,{signal});
   if(!duplicate||!Array.isArray(duplicate.value)||duplicate['@odata.nextLink'])fail('READ','Duplicate role lookup is incomplete.');if(duplicate.value.length)fail('EXISTS','A visible role with that name already exists in the business unit.');
   payload['businessunitid@odata.bind']=`/businessunits(${businessUnitId})`;
  }else{
   id=guid(a.id);const meta=await new RecordMetadata(this.client,signal).table('roles');if(meta.IsOptimisticConcurrencyEnabled!==true)fail('CONCURRENCY','Role update/delete requires native optimistic concurrency.');
   const r=await this.client.requestWithResponse<Row>(`/roles(${id})?$select=roleid,name,description,_businessunitid_value,iscustomizable,canbedeleted,ismanaged`,'GET',undefined,{signal});
   if(r.status!==200||!r.data||guid(r.data.roleid)!==id||typeof r.data.name!=='string')fail('READ','Role baseline is incomplete.');
   if(r.data.ismanaged!==false||r.data.iscustomizable?.Value!==true||a.action==='delete'&&r.data.canbedeleted?.Value!==true)fail('MANAGED','Role is managed, not customizable, or not explicitly deletable.');
   businessUnitId=guid(r.data._businessunitid_value);version=etag(r.data['@odata.etag']??r.headers.etag);if(!version)fail('CONCURRENCY','A specific role ETag is required.');
   if(a.action==='update'){if(a.name!==undefined)payload.name=text(a.name,'name',200);if(a.description!==undefined)payload.description=text(a.description,'description',2000);if(!Object.keys(payload).length)fail('INVALID','At least one role field is required.');}
  }
  const planHash=hash({environment:this.environment,identity,solutionId,solution,action:a.action,id,businessUnitId,version,payload});
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','Role baseline or input changed; preview again.');if(!dry&&(!a.expected_hash||a.allow_role_change!==true))fail('PREVIEW_REQUIRED','Execution requires preview planHash and allow_role_change=true.');
  const state={action:a.action,id,businessUnitId,solutionUniqueName:solution,planHash,dryRun:dry,concurrencyProtected:a.action!=='create',privilegesChanged:false};if(dry)return state;
  const targetId=id??randomUUID(),path=a.action==='create'?'/roles':`/roles(${targetId})`,method=a.action==='create'?'POST':a.action==='update'?'PATCH':'DELETE',body=a.action==='create'?{...payload,roleid:targetId}:a.action==='delete'?undefined:payload;
  try{const r=await this.client.requestWithResponse(path,method,body,{signal,headers:{'MSCRM.SolutionUniqueName':solution,...(version?{'If-Match':version}:{})}});if(![200,201,204].includes(r.status))throw new CrmRequestError('D365_ROLE_RESPONSE','Unexpected role response.',{outcome:'unknown',status:r.status});}
  catch(error){const d=error instanceof CrmRequestError?error.details:{},outcome=d.outcome??'unknown';throw new RoleDefinitionError('WRITE_FAILED','Role operation failed or its outcome is unknown; inspect the role before retrying.',{id:targetId,action:a.action},{outcome,status:d.status,retryable:false});}
  if(a.action==='delete')return {...state,id:targetId,accepted:true,deletionVerified:false};
  try{const after=await this.client.makeRequest<Row>(`/roles(${targetId})?$select=roleid,name,_businessunitid_value`,'GET',undefined,{signal});if(!after||guid(after.roleid)!==targetId||guid(after._businessunitid_value)!==businessUnitId||typeof after.name!=='string'||payload.name!==undefined&&after.name!==payload.name)throw new Error('readback mismatch');return {...state,id:targetId,accepted:true,verified:true};}
  catch{throw new RoleDefinitionError('READBACK_FAILED','Role request was accepted but could not be verified. Do not repeat it automatically.',{id:targetId,accepted:true},{outcome:'unknown',retryable:false});}
 }
}
