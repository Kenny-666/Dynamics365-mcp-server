import type {CrmRequestClient} from '../types/crmRequest.js';
import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
/** Resolve an existing reference; binding does not prove that the connector can run. */
export async function resolveDataverseReference(client:CrmRequestClient,name:unknown,signal?:AbortSignal){
 if(typeof name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(name))throw Error('Invalid connection reference logical name');
 const q=new URLSearchParams({'$select':'connectionreferenceid,connectionreferencelogicalname,connectorid,connectionid,statecode','$filter':`connectionreferencelogicalname eq '${name}'`,'$top':'2'});
 const result=await client.requestWithResponse<Row>('/connectionreferences?'+q,'GET',undefined,{signal});
 if(result.status!==200||!Array.isArray(result.data?.value)||result.data.value.length!==1||result.data['@odata.nextLink'])throw Error('Connection reference is unavailable or ambiguous');
 const ref=result.data.value[0];if(!ref||ref.connectionreferencelogicalname!==name||typeof ref.connectorid!=='string'||!/(?:^|\/)shared_commondataserviceforapps$/i.test(ref.connectorid)||typeof ref.connectionid!=='string'||!ref.connectionid||ref.connectionid.length>1000||/[\x00-\x1f]/.test(ref.connectionid))throw Error('A configured Dataverse connection reference is required');
 return {referenceId:guid(ref.connectionreferenceid),logicalName:name,connectionName:ref.connectionid,connectorId:ref.connectorid,state:ref.statecode??null};
}
