import {CrmRequestError} from '../errors.js';import type {CrmRequestClient} from '../types/crmRequest.js';import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
export async function listFlowConnections(client:CrmRequestClient,environment:Row,raw:Row,signal?:AbortSignal){
 if(environment.authType!=='online')throw new CrmRequestError('D365_FLOW_CLOUD_REQUIRED','Online Dataverse is required.',{outcome:'not_sent'});
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>k!=='top'))throw Error('Invalid connection query');const top=raw.top??50;if(!Number.isInteger(top)||top<1||top>100)throw Error('Invalid result limit');
 const q=new URLSearchParams({'$select':'connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,statecode','$orderby':'connectionreferencelogicalname asc','$top':String(top)}),r=await client.requestWithResponse<Row>('/connectionreferences?'+q,'GET',undefined,{signal});
 if(r.status!==200||!Array.isArray(r.data?.value)||r.data.value.length>top)throw Error('Invalid connection reference response');
 const items=r.data.value.map((v:Row)=>{if(typeof v.connectionreferencelogicalname!=='string'||typeof v.connectorid!=='string')throw Error('Incomplete connection reference');return {id:guid(v.connectionreferenceid),logicalName:v.connectionreferencelogicalname,displayName:v.connectionreferencedisplayname??null,connectorId:v.connectorid,connectionConfigured:typeof v.connectionid==='string'&&v.connectionid.length>0,state:v.statecode??null};});
 return {environment,items,limited:!!r.data['@odata.nextLink']||items.length===top,connectionValidity:'not_verified',licenseAndPolicy:'not_verified'};
}
