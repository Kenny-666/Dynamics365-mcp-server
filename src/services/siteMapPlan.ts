import { CrmRequestError } from '../errors.js';
import { guid } from './modelUiXml.js';
type Row=Record<string,any>;
type Dependencies={publishSiteMap:(input:Row,signal?:AbortSignal)=>Promise<Row>;inspectApplications:(input:Row,signal?:AbortSignal)=>Promise<Row>;publishApp:(input:Row,signal?:AbortSignal)=>Promise<Row>;dependencies:(input:Row,signal?:AbortSignal)=>Promise<Row>};
function problem(error:unknown) {return {status:'unavailable',code:error instanceof CrmRequestError?error.code:'D365_PLAN_READ_FAILED'};}
/** Read-only plan, with component previews kept separate so acceptance is not confused with verification. */
export async function planSiteMapPublication(input:unknown,service:Dependencies,signal?:AbortSignal) {
 if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>k!=='id'))throw new CrmRequestError('D365_PLAN_INVALID','Expected a SiteMap id only.',{outcome:'not_sent'});
 const id=guid((input as Row).id,'id');
 const [sitemap,apps,dependencies]=await Promise.all([
  service.publishSiteMap({id},signal),
  service.inspectApplications({id},signal).then(value=>({status:'available',...value})).catch(problem),
  service.dependencies({component_id:id,component_type:62,direction:'required',top:100,max_pages:2},signal).then(value=>({status:'available',...value})).catch(problem),
 ]);
 if(signal?.aborted)throw new CrmRequestError('D365_REQUEST_ABORTED','Publication planning was cancelled.',{outcome:'not_sent'});
 const previews=[];
 for(const app of Array.isArray((apps as Row).applications)?(apps as Row).applications:[]) {
  try {previews.push({appId:app.id,status:'available',preview:await service.publishApp({id:app.id},signal)});}
  catch(error){if(signal?.aborted)throw new CrmRequestError('D365_REQUEST_ABORTED','Publication planning was cancelled.',{outcome:'not_sent'});previews.push({appId:app.id,...problem(error)});}
 }
 return {operation:'plan_sitemap_publication',dryRun:true,publicationAttempted:false,sitemap,applications:apps,requiredDependencies:dependencies,appPreviews:previews,
  limitations:['Only direct visible application links and bounded native dependency results are inspected.','Individual previews are not an atomic snapshot; refresh each before executing.','Publish SiteMap and each AppModule separately; their results independently report accepted and verified status.']};
}
