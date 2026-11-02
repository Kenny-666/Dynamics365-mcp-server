import {createHash} from 'node:crypto';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import type {ApiOperationService} from './apiOperation.js';
import {guid} from './recordMutationInput.js';
import {query} from './recordMetadata.js';
type Row=Record<string,any>;
const depths={Basic:{mask:1,capability:'canbebasic'},Local:{mask:2,capability:'canbelocal'},Deep:{mask:4,capability:'canbedeep'},Global:{mask:8,capability:'canbeglobal'}} as const;
export class RolePrivilegeError extends CrmRequestError{constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_ROLE_PRIVILEGE_'+code,message,details);}override toJSON(){return {...super.toJSON(),data:this.data};}}
function fail(code:string,message:string):never{throw new RolePrivilegeError(code,message);}
function flag(value:unknown,fallback=false){if(value===undefined)return fallback;if(typeof value!=='boolean')return fail('INVALID','Boolean argument expected.');return value;}
export class RolePrivilegeService {
 constructor(private client:CrmRequestClient,private api:ApiOperationService,private environment:{orgUrl:string;apiVersion:string}){}
 private async current(roleId:string,privilegeId:string,signal?:AbortSignal){
  const page=await this.client.makeRequest<Row>('/roleprivilegescollection?'+query({'$select':'roleid,privilegeid,privilegedepthmask','$filter':`roleid eq ${roleId} and privilegeid eq ${privilegeId}`,'$top':'2'}),'GET',undefined,{signal});
  if(!page||!Array.isArray(page.value)||page.value.length>1||page['@odata.nextLink'])return fail('READ','Role privilege baseline is incomplete or ambiguous.');
  if(!page.value.length)return null;const row=page.value[0];if(guid(row.roleid)!==roleId||guid(row.privilegeid)!==privilegeId||!Number.isInteger(row.privilegedepthmask))return fail('READ','Role privilege baseline is invalid.');return row.privilegedepthmask as number;
 }
 async execute(raw:unknown,signal?:AbortSignal){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['role_id','privilege_id','action','depth','dry_run','expected_hash','allow_unprotected_write','allow_role_privilege_change'].includes(k)))return fail('INVALID','Invalid role privilege arguments.');
  const a=raw as Row,roleId=guid(a.role_id),privilegeId=guid(a.privilege_id),dry=flag(a.dry_run,true),unprotected=flag(a.allow_unprotected_write),ack=flag(a.allow_role_privilege_change);
  if(!['add','remove'].includes(a.action))fail('INVALID','action must be add or remove.');
  if(a.action==='add'&&(typeof a.depth!=='string'||!Object.hasOwn(depths,a.depth)))fail('INVALID','depth must be Basic, Local, Deep or Global.');if(a.action==='remove'&&a.depth!==undefined)fail('INVALID','depth is not used when removing a privilege.');
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  const role=await this.client.makeRequest<Row>(`/roles(${roleId})?$select=roleid,name,_businessunitid_value,iscustomizable,ismanaged`,'GET',undefined,{signal});
  if(!role||guid(role.roleid)!==roleId||typeof role.name!=='string'||role.iscustomizable?.Value!==true||role.ismanaged!==false)fail('ROLE','A visible customizable unmanaged role is required.');
  const unit=guid(role._businessunitid_value),privilege=await this.client.makeRequest<Row>(`/privileges(${privilegeId})?$select=privilegeid,name,canbebasic,canbelocal,canbedeep,canbeglobal`,'GET',undefined,{signal});
  if(!privilege||guid(privilege.privilegeid)!==privilegeId||typeof privilege.name!=='string')fail('PRIVILEGE','Privilege metadata is incomplete.');
  const desired=a.action==='add'?depths[a.depth as keyof typeof depths].mask:null;
  if(a.action==='add'&&privilege[depths[a.depth as keyof typeof depths].capability]!==true)fail('DEPTH','CRM does not report this privilege depth as supported.');
  const before=await this.current(roleId,privilegeId,signal);
  if(a.action==='add'&&before!==null&&before!==desired)fail('EXISTS','The privilege already exists with a different depth. Preview removal separately before adding a new depth.');
  const noChange=a.action==='add'?before===desired:before===null;
  const call=a.action==='add'?{action_name:'AddPrivilegesRole',binding:{collection_name:'roles',id:roleId},parameters:{Privileges:[{BusinessUnitId:unit,Depth:a.depth,PrivilegeId:privilegeId,PrivilegeName:privilege.name}]}}
   :{action_name:'RemovePrivilegeRole',binding:{collection_name:'roles',id:roleId},parameters:{Privilege:{'@odata.id':`privileges(${privilegeId})`}}};
  const native=noChange?null:await this.api.invoke({...call,dry_run:true},signal);
  const planHash=createHash('sha256').update(JSON.stringify({environment:this.environment,identity,roleId,unit,privilegeId,privilegeName:privilege.name,action:a.action,depth:a.depth??null,before,nativeHash:native?.planHash??null})).digest('hex');
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','Role privilege state or native operation changed; preview again.');
  const state={roleId,roleName:role.name,businessUnitId:unit,privilegeId,privilegeName:privilege.name,action:a.action,depth:a.depth??null,beforeDepthMask:before,planHash,dryRun:dry,noChange,concurrencyProtected:false,
   note:'Changing a role affects its assigned principals; direct role privileges are not the same as effective access. Native action has no atomic lock.'};
  if(dry)return state;if(!a.expected_hash||!unprotected||!ack)fail('PREVIEW_REQUIRED','Execution requires the preview planHash and both explicit acknowledgements.');if(noChange)return {...state,verified:true};
  try{await this.api.invoke({...call,dry_run:false,expected_hash:native.planHash,return_details:true},signal);}
  catch(error){const d=error instanceof CrmRequestError?error.details:{},outcome=d.outcome??'unknown';throw new RolePrivilegeError('WRITE_FAILED','Privilege change failed or its outcome is unknown; inspect the role before retrying.',state,{outcome,status:d.status,retryable:false});}
  try{const after=await this.current(roleId,privilegeId,signal);if(after!==desired)throw new Error('readback mismatch');return {...state,accepted:true,verified:true,afterDepthMask:after};}
  catch{throw new RolePrivilegeError('READBACK_FAILED','Privilege action was accepted but readback could not be verified.',{...state,accepted:true},{outcome:'unknown',retryable:false});}
 }
}
