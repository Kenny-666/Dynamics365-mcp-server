import {createHash,randomUUID} from 'node:crypto';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {query} from './recordMetadata.js';
import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
export class UserProvisionError extends CrmRequestError{constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}){super('D365_USER_'+code,message,details);}override toJSON(){return {...super.toJSON(),data:this.data};}}
function fail(code:string,message:string):never{throw new UserProvisionError(code,message);}
function str(value:unknown,field:string,max:number):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))return fail('INVALID',`${field} is invalid.`);return value.trim();}
export class UserProvisionService {
 constructor(private client:CrmRequestClient,private environment:{orgUrl:string;apiVersion:string;authType:string}){}
 async create(raw:unknown,signal?:AbortSignal){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['domain_name','business_unit_id','last_name','first_name','dry_run','expected_hash','allow_user_creation'].includes(k)))return fail('INVALID','Invalid user creation arguments.');
  const a=raw as Row;if(!['op_ad','op_ifd'].includes(this.environment.authType))fail('UNSUPPORTED','Domain user creation requires a configured on-premises AD or IFD connection.');
  const domain=str(a.domain_name,'domain_name',200);if(!/^[A-Za-z0-9._-]+\\[A-Za-z0-9._-]+$/.test(domain))fail('INVALID','domain_name must use DOMAIN\\username format.');
  const unit=guid(a.business_unit_id),last=str(a.last_name,'last_name',100),first=a.first_name===undefined?undefined:str(a.first_name,'first_name',100);
  if(a.dry_run!==undefined&&typeof a.dry_run!=='boolean'||a.allow_user_creation!==undefined&&typeof a.allow_user_creation!=='boolean')fail('INVALID','Boolean argument expected.');
  const dry=a.dry_run??true,who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});if(!who)fail('IDENTITY','CRM identity missing.');const identity={user:guid(who.UserId),organization:guid(who.OrganizationId)};
  const bu=await this.client.makeRequest<Row>(`/businessunits(${unit})?$select=businessunitid,name,isdisabled`,'GET',undefined,{signal});
  if(!bu||guid(bu.businessunitid)!==unit||bu.isdisabled!==false)fail('BUSINESS_UNIT','The business unit is missing, disabled or incomplete.');
  const existing=await this.client.makeRequest<Row>('/systemusers?'+query({'$select':'systemuserid,domainname','$filter':`domainname eq '${domain}'`,'$top':'2'}),'GET',undefined,{signal});
  if(!existing||!Array.isArray(existing.value)||existing['@odata.nextLink'])fail('READ','Duplicate user lookup was incomplete.');if(existing.value.length)fail('EXISTS','A visible CRM user already uses this domain name.');
  const body={domainname:domain,lastname:last,...(first?{firstname:first}:{}),['businessunitid@odata.bind']:`/businessunits(${unit})`};
  const planHash=createHash('sha256').update(JSON.stringify({environment:this.environment,identity,unit,body})).digest('hex');
  if(a.expected_hash!==undefined&&a.expected_hash!==planHash)fail('CONFLICT','User creation preview changed; preview again.');if(!dry&&(!a.expected_hash||a.allow_user_creation!==true))fail('PREVIEW_REQUIRED','Execution requires the preview planHash and allow_user_creation=true.');
  const state={domainName:domain,businessUnitId:unit,businessUnitName:bu.name??null,planHash,dryRun:dry,rolesAssigned:false,atomicUniqueness:false};if(dry)return state;
  const id=randomUUID();try{const r=await this.client.requestWithResponse('/systemusers','POST',{systemuserid:id,...body},{signal});if(![200,201,204].includes(r.status))throw new CrmRequestError('D365_USER_RESPONSE','Unexpected response.',{outcome:'unknown',status:r.status});}
  catch(error){const details=error instanceof CrmRequestError?error.details:{},outcome=details.outcome??'unknown';throw new UserProvisionError('CREATE_FAILED','User creation failed or its outcome is unknown; inspect the user ID and domain before retrying.',{id},{outcome,status:details.status,retryable:false});}
  try{const created=await this.client.makeRequest<Row>(`/systemusers(${id})?$select=systemuserid,domainname,_businessunitid_value,isdisabled`,'GET',undefined,{signal});
   if(!created||guid(created.systemuserid)!==id||typeof created.domainname!=='string'||created.domainname.toLowerCase()!==domain.toLowerCase()||guid(created._businessunitid_value)!==unit)throw new Error('readback mismatch');
   return {...state,id,accepted:true,verified:true,isDisabled:created.isdisabled??null};
  }catch{throw new UserProvisionError('READBACK_FAILED','User creation was accepted but readback failed; do not retry automatically.',{id,accepted:true},{outcome:'unknown',retryable:false});}
 }
}
