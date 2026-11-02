import type { CrmDataClient } from '../types/crmRequest.js';
import { guid } from './modelUiXml.js';
type Row = Record<string, any>;
function complete(result:Row|null, label:string):Row[] {
  if (!result || !Array.isArray(result.value) || result['@odata.nextLink']) throw new Error(`${label} response is incomplete or paginated; no complete association list can be claimed`);
  if (result.value.length > 100) throw new Error(`${label} exceeds the supported bound`);
  return result.value;
}
/** Read-only direct AppModule component associations, not a full dependency graph. */
export async function inspectSiteMapApplications(client:CrmDataClient, input:unknown, signal?:AbortSignal) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected arguments object');
  const args = input as Row;
  if (Object.keys(args).some(k => k !== 'id')) throw new Error('Unknown argument');
  const id = guid(args.id,'id');
  const query = (path:string, params:Record<string,string>) => path + '?' + new URLSearchParams(params);
  const components = complete(await client.makeRequest(query('/appmodulecomponents',{$select:'objectid,_appmoduleidunique_value',
    $filter:`componenttype eq 62 and objectid eq ${id}`,$top:'101'}),'GET',undefined,{signal}),'AppModule components');
  const uniqueIds = [...new Set(components.map(row => {
    if (guid(row.objectid,'component objectid') !== id) throw new Error('CRM returned a component for another SiteMap');
    return guid(row._appmoduleidunique_value,'appmoduleidunique');
  }))];
  const apps = [];
  for (const uniqueId of uniqueIds) {
    const rows = complete(await client.makeRequest(query('/appmodules',{$select:'appmoduleid,appmoduleidunique,name,uniquename',
      $filter:`appmoduleidunique eq ${uniqueId}`,$top:'2'}),'GET',undefined,{signal}),'AppModules');
    if (rows.length !== 1 || guid(rows[0].appmoduleidunique,'appmoduleidunique') !== uniqueId) throw new Error('An associated AppModule was not uniquely returned');
    apps.push({id:guid(rows[0].appmoduleid,'appmoduleid'),unique_id:uniqueId,name:rows[0].name ?? null,unique_name:rows[0].uniquename ?? null});
  }
  return {sitemap_id:id,applications:apps,scope:'direct_appmodule_component_associations',publication_status:'not_checked',publication_attempted:false,
    limitations:['Only direct associations visible to the current CRM identity are listed.','No dependency closure, application validation, publication state or runtime UI is verified.','Legacy SiteMap publication can include a wider scope; inspect publish_sitemap preview separately.']};
}
