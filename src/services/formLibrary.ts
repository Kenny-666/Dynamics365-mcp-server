import {createHash} from 'node:crypto';
import type {CrmRequestClient} from '../types/crmRequest.js';
type Row=Record<string,any>;
export async function readFormLibrary(client:CrmRequestClient,name:string,signal?:AbortSignal):Promise<Row> {
 if(typeof name!=='string'||!name.trim()||name.length>300||/[\x00-\x1f]/.test(name)) throw new Error('Invalid library name');
 const q=new URLSearchParams({'$select':'webresourceid,name,webresourcetype,content','$filter':`name eq '${name.replaceAll("'","''")}'`,'$top':'2'});
 const r=await client.requestWithResponse<Row>('/webresourceset/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?'+q,'GET',undefined,{signal});
 if(r.status!==200||!Array.isArray(r.data?.value)||r.data?.['@odata.nextLink']||r.data.value.length!==1) return {status:'unavailable_or_ambiguous'};
 const item=r.data.value[0];if(!item||typeof item.name!=='string'||item.name.toLowerCase()!==name.toLowerCase()||typeof item.webresourceid!=='string'||!Number.isInteger(item.webresourcetype)||typeof item.content!=='string')return {status:'incomplete'};
 const encoded=item.content;if(encoded.length>2796204||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))return {status:'content_invalid_or_too_large'};
 const bytes=Buffer.from(encoded,'base64');if(bytes.length>2097152||bytes.toString('base64')!==encoded)return {status:'content_invalid_or_too_large'};
 return {status:'available',id:item.webresourceid,type:item.webresourcetype,contentHash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,publication:'not_determined'};
}
