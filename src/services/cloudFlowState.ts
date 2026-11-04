import {CrmRequestError} from '../errors.js';import type {CrmRequestClient} from '../types/crmRequest.js';import {etag,guid} from './recordMutationInput.js';import {hash} from './modelMetadata.js';
type Row=Record<string,any>;
export async function setCloudFlowState(client:CrmRequestClient,environment:Row,raw:Row,signal?:AbortSignal){
 if(environment.authType!=='online')throw new CrmRequestError('D365_FLOW_CLOUD_REQUIRED','Online Dataverse is required.',{outcome:'not_sent'});
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['id','enabled','dry_run','expected_hash'].includes(k))||typeof raw.enabled!=='boolean'||raw.dry_run!==undefined&&typeof raw.dry_run!=='boolean')throw Error('Invalid flow state request');
 const id=guid(raw.id),state=raw.enabled?1:0;
 const who=await client.requestWithResponse<Row>('/WhoAmI','GET',undefined,{signal});if(who.status!==200||!who.data)throw Error('Identity unavailable');const identity={user:guid(who.data.UserId),organization:guid(who.data.OrganizationId)};
 const metadata=await client.requestWithResponse<Row>("/EntityDefinitions(LogicalName='workflow')?$select=LogicalName,IsOptimisticConcurrencyEnabled",'GET',undefined,{signal});if(metadata.status!==200||metadata.data?.LogicalName!=='workflow'||metadata.data?.IsOptimisticConcurrencyEnabled!==true)throw new CrmRequestError('D365_FLOW_CONCURRENCY_UNSUPPORTED','Specific ETag concurrency is required.',{outcome:'not_sent'});
 const path=`/workflows(${id})?$select=workflowid,name,category,statecode,clientdata`,before=await client.requestWithResponse<Row>(path,'GET',undefined,{signal}),item=before.data;
 if(before.status!==200||!item||guid(item.workflowid)!==id||item.category!==5||![0,1].includes(item.statecode)||typeof item.clientdata!=='string'||Buffer.byteLength(item.clientdata)>1048576)throw Error('Cloud flow state or definition unavailable');
 const version=etag(item['@odata.etag']??before.headers.etag);if(!version)throw new CrmRequestError('D365_FLOW_ETAG_REQUIRED','A specific flow ETag is required.',{outcome:'not_sent'});
 const definitionHash=hash(item.clientdata),planHash=hash({environment,identity,id,version,current:item.statecode,state,definitionHash});if(raw.expected_hash!==undefined&&raw.expected_hash!==planHash)throw Error('Flow state plan changed');
 const info={id,environment,currentState:item.statecode,requestedState:state,definitionHash,planHash,etag:version,connectionStatus:'not_assessed'};
 if(raw.dry_run!==false)return {...info,dryRun:true,saved:false,noChange:item.statecode===state};
 if(raw.expected_hash!==planHash)throw Error('A matching preview hash is required');if(item.statecode===state)return {...info,dryRun:false,saved:false,noChange:true};
 if(signal?.aborted)throw new CrmRequestError('D365_REQUEST_ABORTED','Cancelled before sending.',{outcome:'not_sent'});
 try{const response=await client.requestWithResponse(`/workflows(${id})`,'PATCH',{statecode:state},{signal,headers:{'If-Match':version}});if(response.status<200||response.status>=300)throw new CrmRequestError('D365_FLOW_STATE_RESPONSE','Unexpected status.',{outcome:response.status>=500?'unknown':'rejected',status:response.status});}catch(e){const details=e instanceof CrmRequestError?e.details:{};throw new CrmRequestError('D365_FLOW_STATE_FAILED','Flow state change was not confirmed. Inspect before retrying.',{...details,outcome:details.outcome??'unknown'});}
 try{const after=await client.requestWithResponse<Row>(`/workflows(${id})?$select=workflowid,category,statecode`,'GET',undefined,{signal});if(after.status===200&&after.data&&guid(after.data.workflowid)===id&&after.data.category===5&&after.data.statecode===state)return {...info,dryRun:false,saved:true,readback:'matched',runtime:'not_tested'};}catch{}
 return {...info,dryRun:false,saved:true,readback:'unknown',runtime:'not_tested',note:'The request was accepted but the state could not be verified; do not replay blindly.'};
}
