import {updateCloudFlow} from './cloudFlowUpdate.js';
import {listFlowConnections} from './cloudFlowConnections.js';
import {setCloudFlowState} from './cloudFlowState.js';
import {createCloudFlow} from './cloudFlowCreate.js';
import {createHash} from 'node:crypto';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
export class CloudFlowService {
 constructor(private client:CrmRequestClient,private environment:{orgUrl:string;apiVersion:string;authType:string}) {}
 create(raw:Row,signal?:AbortSignal){return createCloudFlow(this.client,this.environment,raw,signal);}
 setState(raw:Row,signal?:AbortSignal){return setCloudFlowState(this.client,this.environment,raw,signal);}
 listConnections(raw:Row,signal?:AbortSignal){return listFlowConnections(this.client,this.environment,raw,signal);}
 update(raw:Row,signal?:AbortSignal){return updateCloudFlow(this.client,this.environment,raw,signal);}
 private cloud(){if(this.environment.authType!=='online')throw new CrmRequestError('D365_FLOW_CLOUD_REQUIRED','Power Automate cloud flows require an Online Dataverse environment.',{outcome:'not_sent'});}
 async listRuns(raw:Row,signal?:AbortSignal){
  this.cloud();if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['id','top'].includes(k)))throw new Error('Invalid flow run arguments');
  const id=guid(raw.id),top=raw.top??50;if(!Number.isInteger(top)||top<1||top>100)throw new Error('top must be between 1 and 100');
  const query=new URLSearchParams({'$select':'flowrunid,starttime,endtime,status', '$filter':`_workflow_value eq ${id}`,'$orderby':'starttime desc,flowrunid asc','$top':String(top)});
  const r=await this.client.requestWithResponse<Row>('/flowruns?'+query,'GET',undefined,{signal});
  if(r.status!==200||!r.data||!Array.isArray(r.data.value)||r.data.value.length>top)throw new Error('Incomplete cloud flow run response');
  const items=r.data.value.map((x:Row)=>{if(typeof x.status!=='string'||(x.starttime!=null&&typeof x.starttime!=='string')||(x.endtime!=null&&typeof x.endtime!=='string'))throw new Error('Invalid cloud flow run item');return {id:guid(x.flowrunid),status:x.status,startTime:x.starttime??null,endTime:x.endtime??null};});
  return {environment:this.environment,flowId:id,items,limited:!!r.data['@odata.nextLink']||items.length===top,completeness:'not_established',guidance:'Dataverse run records can be delayed, unavailable, incomplete or access-filtered; no records does not prove the flow did not run.'};
 }
 async list(raw:Row,signal?:AbortSignal) {
  this.cloud();if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['top'].includes(k)))throw new Error('Invalid flow list arguments');
  const top=raw.top??50;if(!Number.isInteger(top)||top<1||top>100)throw new Error('top must be between 1 and 100');
  const query=new URLSearchParams({'$select':'workflowid,name,category,statecode,statuscode,modifiedon,primaryentity,type'});query.set('$filter','category eq 5');query.set('$orderby','name asc,workflowid asc');query.set('$top',String(top));
  const r=await this.client.requestWithResponse<Row>('/workflows?'+query,'GET',undefined,{signal});if(r.status!==200||!r.data||!Array.isArray(r.data.value)||r.data.value.length>top)throw new Error('Incomplete cloud flow response');
  const items=r.data.value.map((x:Row)=>{if(x.category!==5||typeof x.name!=='string'||!Number.isInteger(x.statecode))throw new Error('Invalid cloud flow item');return {id:guid(x.workflowid),name:x.name,state:x.statecode,status:x.statuscode??null,modifiedOn:x.modifiedon??null,type:x.type??null};});
  return {environment:this.environment,items,limited:!!r.data['@odata.nextLink']||items.length===top,connectionStatus:'not_assessed'};
 }
 async get(raw:Row,signal?:AbortSignal){
  this.cloud();if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>k!=='id'))throw new Error('Invalid flow arguments');const id=guid(raw.id);
  const r=await this.client.requestWithResponse<Row>(`/workflows(${id})?$select=workflowid,name,category,statecode,statuscode,modifiedon,type,clientdata`,'GET',undefined,{signal});
  const d=r.data;if(r.status!==200||!d||guid(d.workflowid)!==id||d.category!==5||typeof d.name!=='string'||!Number.isInteger(d.statecode)||typeof d.clientdata!=='string'||Buffer.byteLength(d.clientdata)>1048576)throw new Error('Incomplete cloud flow definition');
  let parsed:Row;try{parsed=JSON.parse(d.clientdata);}catch{throw new Error('Invalid cloud flow definition');}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid cloud flow definition');
  const def=parsed.properties?.definition,refs=parsed.properties?.connectionReferences;if(!def||typeof def!=='object'||Array.isArray(def)||!refs||typeof refs!=='object'||Array.isArray(refs))throw new Error('Incomplete cloud flow definition');
  const keys=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort():[];
  return {environment:this.environment,id,name:d.name,state:d.statecode,status:d.statuscode??null,modifiedOn:d.modifiedon??null,definitionHash:createHash('sha256').update(d.clientdata).digest('hex'),triggerNames:keys(def.triggers),actionNames:keys(def.actions),connectionReferenceNames:keys(refs),connectionStatus:'not_assessed',definitionReturned:false};
 }
}
