import { createHash } from 'node:crypto';
import { CrmRequestError } from '../errors.js';
import type { CrmRequestClient } from '../types/crmRequest.js';
import { guid } from './modelUiXml.js';
import { CacheService } from './cache.js';
type Row = Record<string,any>;
export class AppPublicationError extends CrmRequestError {
  constructor(code:string,message:string,readonly data:Row,details:ConstructorParameters<typeof CrmRequestError>[2] = {outcome:'not_sent'}) {super('D365_APP_PUBLISH_'+code,message,details);}
  override toJSON() {return {...super.toJSON(),data:this.data};}
}
export class AppPublicationService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:{orgUrl:string;authType:string;apiVersion:string}) {}
  async publish(input:unknown,signal?:AbortSignal) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppPublicationError('INVALID','Expected arguments object.',{});
    const a = input as Row;
    if (Object.keys(a).some(k=>!['id','dry_run','expected_hash','allow_app_publish'].includes(k))) throw new AppPublicationError('INVALID','Unknown argument.',{});
    const id=guid(a.id,'id');
    for (const key of ['dry_run','allow_app_publish']) if (a[key] !== undefined && typeof a[key] !== 'boolean') throw new AppPublicationError('INVALID',`${key} must be a boolean.`,{});
    if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) throw new AppPublicationError('INVALID','expected_hash must be the preview planHash.',{});
    const dry=a.dry_run ?? true;
    if (!dry && (!a.expected_hash || a.allow_app_publish !== true)) throw new AppPublicationError('PREVIEW_REQUIRED','Execution requires expected_hash and allow_app_publish=true.',{});
    if (signal?.aborted) throw new AppPublicationError('ABORTED','Cancelled before dispatch.',{});
    const response=await this.client.requestWithResponse<Row>(`/appmodules(${id})?$select=appmoduleid,uniquename,modifiedon`,'GET',undefined,{signal,headers:{'Cache-Control':'no-cache'}});
    if (response.status !== 200 || !response.data || guid(response.data.appmoduleid,'appmoduleid') !== id || typeof response.data.uniquename !== 'string' || typeof response.data.modifiedon !== 'string') throw new AppPublicationError('READ_INVALID','The AppModule baseline is incomplete.',{});
    const body={ParameterXml:`<importexportxml><appmodules><appmodule>${id}</appmodule></appmodules></importexportxml>`};
    const planHash=createHash('sha256').update(JSON.stringify({environment:this.environment,id,uniqueName:response.data.uniquename,modifiedOn:response.data.modifiedon,body})).digest('hex');
    const state={id,uniqueName:response.data.uniquename,modifiedOn:response.data.modifiedon,planHash,scope:'appmodule',dryRun:dry,
      publicationAccepted:false as boolean|null,published:null,publicationStatus:'not_submitted',concurrencyProtected:false,
      limitations:['The modifiedon check is not an atomic lock.','Publication acceptance does not verify app runtime or dependency publication.']};
    if (a.expected_hash && a.expected_hash !== planHash) throw new AppPublicationError('CONFLICT','The preview baseline changed; preview again.',state);
    if (dry) return state;
    if (signal?.aborted) throw new AppPublicationError('ABORTED','Cancelled before dispatch.',state);
    let sent;
    try { sent=await this.client.requestWithResponse('/PublishXml','POST',body,{signal}); }
    catch(error) {
      const details=error instanceof CrmRequestError ? error.details : {};
      const outcome=details.outcome ?? 'unknown';
      throw new AppPublicationError('FAILED','Publication failed or has an unknown outcome; it was not retried.',{...state,publicationAccepted:outcome === 'unknown' ? null : false,publicationStatus:outcome}, {outcome,retryable:false,status:details.status});
    }
    if (![200,204].includes(sent.status)) throw new AppPublicationError('RESPONSE_INVALID','Publication outcome is unknown; it was not retried.',{...state,publicationAccepted:null,publicationStatus:'unknown'},{outcome:'unknown',retryable:false,status:sent.status});
    CacheService.flushExisting();
    return {...state,publicationAccepted:true,publicationStatus:'accepted_unverified'};
  }
}
