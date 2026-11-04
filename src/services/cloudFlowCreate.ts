import {resolveDataverseReference} from './cloudFlowReference.js';
import {CrmRequestError} from '../errors.js';import type {CrmRequestClient} from '../types/crmRequest.js';import {prepareCloudFlow} from './cloudFlowDefinition.js';import {hash} from './modelMetadata.js';import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
export async function createCloudFlow(client:CrmRequestClient,environment:Row,raw:Row,signal?:AbortSignal){
 if(environment.authType!=='online')throw new CrmRequestError('D365_FLOW_CLOUD_REQUIRED','Online Dataverse is required.',{outcome:'not_sent'});
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['solution_unique_name','spec','dry_run','expected_hash'].includes(k)))throw Error('Invalid create request');
 const solution=raw.solution_unique_name;if(typeof solution!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(solution))throw Error('Invalid solution name');
 if(raw.dry_run!==undefined&&typeof raw.dry_run!=='boolean')throw Error('Invalid dry_run');let draft=prepareCloudFlow(raw.spec);
 const binding=draft.connectionsRequired.length?await resolveDataverseReference(client,draft.connectionsRequired[0],signal):undefined;if(binding)draft=prepareCloudFlow(raw.spec,binding);
 const who=await client.requestWithResponse<Row>('/WhoAmI','GET',undefined,{signal}),identity=who.data;if(who.status!==200||!identity)throw Error('Identity unavailable');const user=guid(identity.UserId),org=guid(identity.OrganizationId);
 const q=new URLSearchParams({'$select':'solutionid,uniquename,ismanaged,isvisible,version','$filter':`uniquename eq '${solution}'`,'$top':'2'});
 const sr=await client.requestWithResponse<Row>('/solutions?'+q,'GET',undefined,{signal}),items=sr.data?.value;if(sr.status!==200||!Array.isArray(items)||items.length!==1||sr.data?.['@odata.nextLink'])throw Error('Solution is unavailable or ambiguous');const target=items[0],solutionId=guid(target.solutionid);if(target.uniquename!==solution||target.ismanaged!==false||target.isvisible!==true||['default','active','system'].includes(solution.toLowerCase()))throw Error('An ordinary unmanaged solution is required');
 let referenceMembership:Row={status:'not_applicable'};
 if(binding){
  const mq=new URLSearchParams({'$select':'solutioncomponentid,objectid,componenttype','$filter':`_solutionid_value eq ${solutionId} and objectid eq ${binding.referenceId}`,'$top':'10'});
  try {const result=await client.requestWithResponse<Row>('/solutioncomponents?'+mq,'GET',undefined,{signal});const rows=result.data?.value;
   if(result.status===200&&Array.isArray(rows)&&!result.data?.['@odata.nextLink']&&rows.length<10&&rows.every((x:Row)=>typeof x.objectid==='string'&&x.objectid.toLowerCase()===binding.referenceId&&Number.isInteger(x.componenttype)))referenceMembership={status:rows.length?'matching_object_id_observed':'not_observed',componentTypes:[...new Set(rows.map((x:Row)=>x.componenttype))]};
   else referenceMembership={status:'unknown'};
  }catch(error){if(signal?.aborted)throw error;referenceMembership={status:'unknown'};}
 }
 const body={category:5,name:draft.name,type:1,primaryentity:'none',clientdata:JSON.stringify(draft.definition)};
 const planHash=hash({environment,identity:{user,org},solution:{id:solutionId,name:solution,version:target.version},definitionHash:draft.definitionHash,referenceMembership});
 if(raw.expected_hash!==undefined&&raw.expected_hash!==planHash)throw Error('Flow creation plan changed');
 const base={environment,solution,solutionId,planHash,definitionHash:draft.definitionHash,trigger:draft.trigger,actionNames:draft.actionNames,connectionsRequired:draft.connectionsRequired,referenceMembership,activationRequested:false};
 if(raw.dry_run!==false)return {...base,dryRun:true,created:false};
 if(raw.expected_hash!==planHash)throw Error('A matching preview hash is required');
 if(signal?.aborted)throw new CrmRequestError('D365_REQUEST_ABORTED','Cancelled before sending.',{outcome:'not_sent'});
 let response;try{response=await client.requestWithResponse<Row>('/workflows','POST',body,{signal,headers:{'MSCRM.SolutionUniqueName':solution,Prefer:'return=representation'}});}catch(e){const details=e instanceof CrmRequestError?e.details:{};throw new CrmRequestError('D365_FLOW_CREATE_FAILED','Flow creation was not confirmed; inspect before retrying.',{...details,outcome:details.outcome??'unknown'});}
 if(response.status<200||response.status>=300)throw new CrmRequestError('D365_FLOW_CREATE_FAILED','Unexpected create response; inspect before retrying.',{outcome:'unknown'});
 let id:string;try{const bodyId=response.data?.workflowid,header=response.headers['odata-entityid'],match=typeof header==='string'?/\/workflows\(([a-f0-9-]{36})\)$/i.exec(header):null;id=guid(bodyId??match?.[1]);if(bodyId&&match&&guid(bodyId)!==guid(match[1]))throw Error('ID mismatch');}catch{return {...base,dryRun:false,created:true,id:null,readback:'unknown',solutionMembership:'unknown',note:'Create was accepted but no reliable ID was returned. Do not retry blindly.'};}
 let readback='unknown',definitionReadback='unknown',membership='unknown';try{const actual=await client.requestWithResponse<Row>(`/workflows(${id})?$select=workflowid,name,category,statecode,clientdata`,'GET',undefined,{signal});if(actual.status===200&&actual.data&&guid(actual.data.workflowid)===id&&actual.data.category===5&&actual.data.name===draft.name){readback=actual.data.statecode===0?'draft_confirmed':'unexpected_state';if(typeof actual.data.clientdata==='string'&&Buffer.byteLength(actual.data.clientdata)<=1048576){try{const parsed=JSON.parse(actual.data.clientdata);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))definitionReadback=hash(parsed)===hash(draft.definition)?'matched':'different';}catch{}}}}catch{}
 try{const mq=new URLSearchParams({'$select':'solutioncomponentid,objectid,componenttype','$filter':`_solutionid_value eq ${solutionId} and objectid eq ${id} and componenttype eq 29`,'$top':'2'});const m=await client.requestWithResponse<Row>('/solutioncomponents?'+mq,'GET',undefined,{signal});if(m.status===200&&Array.isArray(m.data?.value)&&!m.data?.['@odata.nextLink'])membership=m.data.value.some((x:Row)=>x.objectid?.toLowerCase()===id&&x.componenttype===29)?'confirmed':'not_confirmed';}catch{}
 return {...base,dryRun:false,created:true,id,readback,definitionReadback,solutionMembership:membership,platformValidation:'not_assessed',note:'Definition comparison is structural; platform normalization can cause differences. Creation acceptance does not establish designer, connection or runtime validity.'};
}
