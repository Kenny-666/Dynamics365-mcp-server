import {createHash} from 'node:crypto';
import type {Node,Element} from '@xmldom/xmldom';
import {CrmRequestError,type CrmErrorDetails} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {uiXml} from './modelUiXml.js';
import {CacheService} from './cache.js';

type Row = Record<string,any>;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = 'sitemapid,sitemapname,sitemapnameunique,isappaware,sitemapxml';
const aliases:Record<string,string> = {dryRun:'dry_run',expectedHash:'expected_hash',allowSitemapScopePublish:'allow_sitemap_scope_publish'};
export class SiteMapPublicationError extends CrmRequestError {
  constructor(code:string,message:string,readonly data:Row = {},details:CrmErrorDetails = {outcome:'not_sent'}) {
    super('D365_SITEMAP_' + code,message,details);
  }
  override toJSON() {return {...super.toJSON(),data:this.data};}
}
function fail(code:string,message:string):never {throw new SiteMapPublicationError(code,message);}
function input(raw:unknown):Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID','Expected publication arguments.');
  const result:Row = {};
  for (const [key,value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const name = aliases[key] ?? key;
    if (!['id','dry_run','expected_hash','allow_sitemap_scope_publish'].includes(name)) fail('INVALID','Unknown publication argument.');
    if (Object.hasOwn(result,name) && result[name] !== value) fail('INVALID','Conflicting publication aliases.');
    result[name] = value;
  }
  if (typeof result.id !== 'string' || !GUID.test(result.id)) fail('INVALID','id must be a SiteMap GUID without braces.');
  result.id = result.id.toLowerCase();
  for (const key of ['dry_run','allow_sitemap_scope_publish']) if (result[key] !== undefined && typeof result[key] !== 'boolean') fail('INVALID',key + ' must be a boolean.');
  if (result.expected_hash !== undefined && (typeof result.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(result.expected_hash))) fail('INVALID','expected_hash must be the SHA-256 planHash from a preview.');
  result.dry_run ??= true;
  if (!result.dry_run && (!result.expected_hash || result.allow_sitemap_scope_publish !== true)) fail('PREVIEW_REQUIRED','Execution requires the current preview planHash and allow_sitemap_scope_publish=true.');
  return result;
}
function digest(value:unknown):string {return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function xmlFingerprint(value:unknown):string {
  let root:Element;
  try {root = uiXml(value,'SiteMap').documentElement!;} catch {return fail('XML_INVALID','The native sitemapxml is malformed, oversized or outside the supported SiteMap XML format.');}
  function signature(node:Node):unknown {
    if (node.nodeType !== 1) return node.nodeValue;
    const element = node as Element;
    const attributes = Array.from(element.attributes).map(item=>[item.name,item.value]).sort(([a],[b])=>a.localeCompare(b));
    const children = Array.from(node.childNodes).filter(child=>child.nodeType === 1 || (child.nodeType === 3 || child.nodeType === 4) && !!child.nodeValue?.trim()).map(signature);
    return [element.tagName,attributes,children];
  }
  return digest(signature(root));
}
function evidence(error:unknown):CrmErrorDetails {
  if (!(error instanceof CrmRequestError)) return {};
  const d = error.details;
  return {status:d.status,outcome:d.outcome,retryable:false,
    platformCode:/^0x[0-9a-f]+$/i.test(d.platformCode ?? '') ? d.platformCode : undefined,
    requestId:/^[0-9a-f-]{36}$/i.test(d.requestId ?? '') ? d.requestId : undefined};
}

/** Publish saved navigation XML separately from CRUD, without requiring a healthy CSDL endpoint. */
export class SiteMapPublicationService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:{orgUrl:string;authType:string;apiVersion:string}) {}

  private cancelled(signal?:AbortSignal) {
    if (signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','Site map publication was cancelled before dispatch.',{outcome:'not_sent'});
  }
  private snapshot(row:unknown,id:string):Row {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof (row as Row).sitemapid !== 'string' || (row as Row).sitemapid.toLowerCase() !== id) fail('RESPONSE_INVALID','The native SiteMap identity is missing or does not match the target.');
    const value = row as Row;
    return {id,definitionHash:xmlFingerprint(value.sitemapxml),
      name:typeof value.sitemapname === 'string' ? value.sitemapname : null,
      uniqueName:typeof value.sitemapnameunique === 'string' ? value.sitemapnameunique : null,
      isAppAware:typeof value.isappaware === 'boolean' ? value.isappaware : null};
  }
  private async read(id:string,unpublished:boolean,signal?:AbortSignal):Promise<Row|null> {
    this.cancelled(signal);
    const endpoint = unpublished ? '/sitemaps/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?' + new URLSearchParams({
      '$select':SELECT,'$filter':'sitemapid eq ' + id,'$top':'2',
    }) : '/sitemaps(' + id + ')?' + new URLSearchParams({'$select':SELECT});
    let response;
    try {response = await this.client.requestWithResponse<Row>(endpoint,'GET',undefined,{headers:{Consistency:'Strong','Cache-Control':'no-cache'},signal});}
    catch (error) {if (!unpublished && error instanceof CrmRequestError && error.details.status === 404) return null;throw error;}
    if (!unpublished && response.status === 404) return null;
    if (response.status !== 200 || !response.data) fail('RESPONSE_INVALID','The native SiteMap read did not return a complete response.');
    if (!unpublished) return this.snapshot(response.data,id);
    const page = response.data;
    if (!Array.isArray(page.value) || page.value.length !== 1 || page['@odata.nextLink'] !== undefined) fail('RESPONSE_INVALID','The unpublished SiteMap read is missing, ambiguous or incomplete.');
    return this.snapshot(page.value[0],id);
  }
  async publish(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = input(raw);
    this.cancelled(signal);
    let saved:Row,published:Row|null;
    try {saved = (await this.read(a.id,true,signal))!;published = await this.read(a.id,false,signal);}
    catch (error) {
      if (error instanceof SiteMapPublicationError || error instanceof CrmRequestError && error.code === 'D365_REQUEST_ABORTED') throw error;
      throw new SiteMapPublicationError('READ_FAILED','The saved/published SiteMap baseline could not be read. No publication was submitted.',{sitemapId:a.id,publicationAccepted:false,published:false},{...evidence(error),outcome:'not_sent'});
    }
    const body = {ParameterXml:'<importexportxml><sitemaps><sitemap>' + a.id + '</sitemap></sitemaps></importexportxml>'};
    const planHash = digest({environment:this.environment,target:saved,publishedHash:published?.definitionHash ?? null,body});
    const state = {operation:'publish_sitemap',environment:this.environment,sitemapId:a.id,target:saved,planHash,
      savedDefinitionHash:saved.definitionHash,publishedDefinitionHash:published?.definitionHash ?? null,
      scope:'native_sitemap_component_scope',scopeNote:'Legacy PublishXml implementations may ignore the sitemap ID. Publication may include other pending SiteMap changes. No entity, app module or Web Resource publication is requested.',
      concurrencyProtected:false,publicationAccepted:false,published:false,publishedDefinitionVerified:false,runtimeVerified:false,
      noChange:published?.definitionHash === saved.definitionHash,request:{method:'POST',path:'/PublishXml',body}};
    if (a.expected_hash !== undefined && a.expected_hash !== planHash) throw new SiteMapPublicationError('CONFLICT','The SiteMap baseline changed. Preview again before publishing.',state);
    if (a.dry_run) return {...state,dryRun:true};
    if (state.noChange) return {...state,dryRun:false,published:true,publishedDefinitionVerified:true,publicationStatus:'already_matches'};
    this.cancelled(signal);
    let response;
    try {response = await this.client.requestWithResponse('/PublishXml','POST',body,{signal});}
    catch (error) {
      const details = evidence(error),outcome = details.outcome ?? 'unknown';
      throw new SiteMapPublicationError('PUBLISH_FAILED','SiteMap publication failed or its outcome is unknown. No save, publication retry or PublishAllXml fallback was submitted.',
        {...state,published:outcome === 'unknown' ? null : false,publicationAccepted:outcome === 'unknown' ? null : false}, {...details,outcome,retryable:false});
    }
    if (![200,204].includes(response.status)) throw new SiteMapPublicationError('PUBLISH_RESPONSE_INVALID','The publication response does not confirm synchronous completion. Inspect the SiteMap before any further publication.',
      {...state,publicationAccepted:null,published:null},{status:response.status,outcome:'unknown',retryable:false});
    CacheService.flushExisting();
    const accepted = {...state,dryRun:false,publicationAccepted:true,publicationStatus:'accepted',published:null};
    let after:Row|null;
    try {after = await this.read(a.id,false,signal);}
    catch (error) {throw new SiteMapPublicationError('READBACK_FAILED','PublishXml was accepted, but the published SiteMap could not be verified. Publication was not replayed.',accepted,{...evidence(error),outcome:'unknown',retryable:false});}
    if (!after || after.definitionHash !== saved.definitionHash) throw new SiteMapPublicationError('READBACK_MISMATCH','PublishXml was accepted, but the published definition does not match the saved baseline. Inspect publication, concurrent changes and cache propagation before retrying.',
      {...accepted,publishedDefinitionHash:after?.definitionHash ?? null},{outcome:'unknown',retryable:false});
    return {...accepted,published:true,publishedDefinitionVerified:true,publishedDefinitionHash:after.definitionHash,publicationStatus:'verified'};
  }
}
