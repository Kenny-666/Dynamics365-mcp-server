import {createHash} from 'node:crypto';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {RecordMetadata,query} from './recordMetadata.js';
import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class RoleAssignmentError extends CrmRequestError{constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_ROLE_ASSIGNMENT_'+code,message,details);}override toJSON(){return {...super.toJSON(),data:this.data};}}
function fail(code:string,message:string):never{throw new RoleAssignmentError(code,message);}
function args(value:unknown):Row{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['user_id','role_ids','action','dry_run','expected_hash','allow_unprotected_write','allow_cross_business_unit'].includes(k)))return fail('INVALID','Invalid role assignment arguments.');return value as Row;}
function flag(value:unknown,fallback=false):boolean{if(value===undefined)return fallback;if(typeof value!=='boolean')return fail('INVALID','Boolean argument expected.');return value;}
export class RoleAssignmentService {
 constructor(private client:CrmRequestClient,private environment:{orgUrl:string;apiVersion:string}){}
 private async membership(user:string,role:string,signal?:AbortSignal){
  const result=await this.client.makeRequest<Row>(`/systemusers(${user})/systemuserroles_association?`+query({'$select':'roleid','$filter':`roleid eq ${role}`,'$top':'2'}),'GET',undefined,{signal});
  if(!result||!Array.isArray(result.value)||result.value.length>1||result['@odata.nextLink'])return fail('READ','Direct role membership is incomplete or ambiguous.');
  if(result.value.length&&guid(result.value[0].roleid)!==role)return fail('READ','The returned role membership does not match the requested role.');return result.value.length===1;
 }
 async execute(raw:unknown,signal?:AbortSignal){
  const a=args(raw),user=guid(a.user_id),dry=flag(a.dry_run,true),allow=flag(a.allow_unprotected_write),cross=flag(a.allow_cross_business_unit);
  if(!['assign','remove'].includes(a.action))fail('INVALID','action must be assign or remove.');
  if(!Array.isArray(a.role_ids)||a.role_ids.length<1||a.role_ids.length>20)fail('INVALID','role_ids must contain 1–20 role GUIDs.');
  const ids=a.role_ids.map(guid);if(new Set(ids).size!==ids.length)fail('INVALID','Role IDs must be distinct.');ids.sort();
  const metadata=new RecordMetadata(this.client,signal),[users,roles]=await Promise.all([metadata.table('systemusers'),metadata.table('roles')]);
  const relation=await metadata.navigation(users,roles,'systemuserroles_association');if(relation.single)fail('RELATIONSHIP','The native user-role relationship is not collection-valued.');
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  const target=await this.client.makeRequest<Row>(`/systemusers(${user})?$select=systemuserid,fullname,isdisabled,_businessunitid_value`,'GET',undefined,{signal});
  if(!target||guid(target.systemuserid)!==user||typeof target.isdisabled!=='boolean')fail('READ','User details were incomplete.');const userUnit=guid(target._businessunitid_value);
  const entries=[];for(const id of ids){const role=await this.client.makeRequest<Row>(`/roles(${id})?$select=roleid,name,_businessunitid_value`,'GET',undefined,{signal});if(!role||guid(role.roleid)!==id||typeof role.name!=='string')fail('READ','Role details were incomplete.');
   const unit=guid(role._businessunitid_value),assigned=await this.membership(user,id,signal);entries.push({id,name:role.name,businessUnitId:unit,assigned,crossBusinessUnit:unit!==userUnit});}
  const planHash=hash({environment:this.environment,identity,user,userUnit,isDisabled:target.isdisabled,action:a.action,entries,cross});
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','The target, membership or role details changed; preview again.');
  const state={userId:user,userName:target.fullname??null,userBusinessUnitId:userUnit,userDisabled:target.isdisabled,action:a.action,roles:entries,planHash,dryRun:dry,atomic:false,concurrencyProtected:false,
   note:'Direct role membership only; team roles and effective privileges are not determined. Association changes cannot be atomically locked.'};
  if(dry)return state;
  if(!a.expected_hash||!allow)fail('PREVIEW_REQUIRED','Execution requires the current planHash and allow_unprotected_write=true.');
  if(entries.some(e=>e.crossBusinessUnit)&&!cross)fail('CROSS_BUSINESS_UNIT','Cross-business-unit role assignment requires explicit acknowledgement and CRM support.');
  const results:Row[]=[];for(const role of entries){if(signal?.aborted)throw new RoleAssignmentError('ABORTED','Batch stopped before the next role.',{results},{outcome:'not_sent'});
   const intended=a.action==='assign';if(role.assigned===intended){results.push({roleId:role.id,status:'already_matches',verified:true});continue;}
   const base=`/systemusers(${user})/systemuserroles_association`,path=intended?base+'/$ref':base+`(${role.id})/$ref`;
   const absolute=this.environment.orgUrl.replace(/\/+$/,'')+'/api/data/'+this.environment.apiVersion+`/roles(${role.id})`;
   try{const r=await this.client.requestWithResponse(path,intended?'POST':'DELETE',intended?{'@odata.id':absolute}:undefined,{signal});if(![200,204].includes(r.status))throw new CrmRequestError('D365_ROLE_RESPONSE','Unexpected response.',{outcome:'unknown',status:r.status});}
   catch(error){const detail=error instanceof CrmRequestError?error.details:{},outcome=detail.outcome??'unknown';throw new RoleAssignmentError('WRITE_FAILED','Role operation stopped. Inspect membership before retrying.',{results,failedRoleId:role.id},{outcome,status:detail.status,retryable:false});}
   try{const actual=await this.membership(user,role.id,signal);if(actual!==intended)throw new Error('membership mismatch');results.push({roleId:role.id,status:intended?'assigned':'removed',verified:true});}
   catch{throw new RoleAssignmentError('READBACK_FAILED','Role request was accepted but membership could not be verified. Do not retry automatically.',{results,failedRoleId:role.id,accepted:true},{outcome:'unknown',retryable:false});}
  }
  return {...state,results};
 }
}
