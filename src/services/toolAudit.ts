import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,rename,unlink} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import type {CrmDataClient} from '../types/crmRequest.js';
import {CrmRequestError} from '../errors.js';
import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
export class ToolAuditError extends CrmRequestError {
 constructor(message:string,readonly journalId:string,details:ConstructorParameters<typeof CrmRequestError>[2]){super('D365_AUDIT_FINALIZE_FAILED',message,details);}
 override toJSON(){return {...super.toJSON(),journalId:this.journalId};}
}
/** Optional call-level audit. A completed call is not proof that a CRM write or publication succeeded. */
export class ToolAuditService {
 constructor(private client:CrmDataClient,private environment:{orgUrl:string;apiVersion:string}){}
 async run<T>(toolName:string,action:()=>Promise<T>,signal?:AbortSignal):Promise<T> {
  const root=process.env.D365_JOURNAL_DIR;if(!root||!isAbsolute(root))throw new CrmRequestError('D365_AUDIT_CONFIG','D365_JOURNAL_DIR must be an absolute path when D365_AUDIT_WRITES is enabled.',{outcome:'not_sent'});
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});
  if(!who)throw new CrmRequestError('D365_AUDIT_IDENTITY','CRM identity was not returned.',{outcome:'not_sent'});
  const identity=createHash('sha256').update(JSON.stringify({org:this.environment.orgUrl.replace(/\/+$/,''),api:this.environment.apiVersion,user:guid(who.UserId),organization:guid(who.OrganizationId)})).digest('hex');
  const entry:Row={version:1,kind:'tool_call',journalId:randomUUID(),identity,toolName,status:'call_pending',createdAt:new Date().toISOString()};
  const path=join(root,entry.journalId+'.json');await mkdir(root,{recursive:true,mode:0o700});
  async function persist(first:boolean) {
   const target=first?path:path+'.'+randomUUID()+'.tmp',file=await open(target,'wx',0o600);
   try{await file.writeFile(JSON.stringify(entry),'utf8');await file.sync();}finally{await file.close();}
   if(!first)try{await rename(target,path);}catch(error){await unlink(target).catch(()=>{});throw error;}
  }
  await persist(true);
  let result:T;
  try {result=await action();}
  catch(error){entry.status='call_failed';const outcome=error instanceof CrmRequestError?error.details.outcome:undefined;
   entry.outcome=['not_sent','rejected','unknown'].includes(outcome??'')?outcome:'unknown';
   try{await persist(false);}catch{throw new ToolAuditError('The tool failed and its audit entry could not be finalized. Inspect the target before retrying.',entry.journalId,{outcome:'unknown',retryable:false});}
   throw error;
  }
  entry.status='call_completed';
  try{await persist(false);}catch{throw new ToolAuditError('The tool returned but its audit entry could not be finalized. Inspect the target before retrying.',entry.journalId,{outcome:'unknown',retryable:false});}
  return result;
 }
}
