import {createHash} from 'node:crypto';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {guid} from './recordMutationInput.js';

type Row=Record<string,any>;
export async function capturePublishedScript(client:CrmRequestClient,id:unknown,signal?:AbortSignal){
 const resourceId=guid(id),r=await client.requestWithResponse<Row>(`/webresourceset(${resourceId})?$select=webresourceid,name,webresourcetype,content`,'GET',undefined,{signal,headers:{'Cache-Control':'no-cache'}}),row=r.data;
 if(r.status!==200||!row||guid(row.webresourceid)!==resourceId||typeof row.name!=='string'||row.webresourcetype!==3||typeof row.content!=='string'||row.content.length>2796204||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.content))throw new Error('Published JavaScript resource is unavailable or incomplete.');
 const bytes=Buffer.from(row.content,'base64');if(bytes.length>2097152||bytes.toString('base64')!==row.content)throw new Error('Published script content is invalid or too large.');const content=bytes.toString('utf8');if(!Buffer.from(content,'utf8').equals(bytes))throw new Error('Published script is not valid UTF-8.');
 return {id:resourceId,name:row.name,type:row.webresourcetype,content,contentHash:createHash('sha256').update(bytes).digest('hex')};
}
export async function inspectPublishedResources(client:CrmRequestClient,expected:unknown,approved:string[],signal?:AbortSignal){
 if(!Array.isArray(expected)||expected.length>241)throw new Error('Explicit published resource hashes are required.');
 const resources=expected.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['id','content_hash'].includes(k))||typeof item.content_hash!=='string'||!/^[a-f0-9]{64}$/.test(item.content_hash))throw new Error('Invalid published resource hash.');return {id:guid(item.id),contentHash:item.content_hash};});
 const ids=resources.map(r=>r.id);if(new Set(ids).size!==ids.length)throw new Error('Duplicate published resource.');
 const approvedResources=approved.filter(key=>key.startsWith('61:')).map(key=>key.slice(3)).sort();
 if(JSON.stringify([...ids].sort())!==JSON.stringify(approvedResources))throw new Error('Provide a reviewed content hash for every approved web resource.');
 const results:Row[]=[];
 for(const resource of resources){if(signal?.aborted)throw new Error('Published resource inspection cancelled.');const r=await client.requestWithResponse<Row>(`/webresourceset(${resource.id})?$select=webresourceid,name,webresourcetype,content`,'GET',undefined,{signal,headers:{'Cache-Control':'no-cache'}});const row=r.data;
  if(r.status!==200||!row||guid(row.webresourceid)!==resource.id||typeof row.name!=='string'||!Number.isInteger(row.webresourcetype)||typeof row.content!=='string'||row.content.length>2796204||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.content))throw new Error('Published web resource is unavailable or incomplete.');
  const bytes=Buffer.from(row.content,'base64');if(bytes.toString('base64')!==row.content||bytes.length>2097152)throw new Error('Published web resource content is invalid or too large.');
  const actual=createHash('sha256').update(bytes).digest('hex');if(actual!==resource.contentHash)throw new Error('Published web resource content differs from the reviewed hash.');results.push({id:resource.id,name:row.name,type:row.webresourcetype,contentHash:actual});
 }
 return results.sort((a,b)=>a.id.localeCompare(b.id));
}
