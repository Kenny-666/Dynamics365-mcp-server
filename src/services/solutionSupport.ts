import {CrmRequestError,type CrmErrorDetails} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {evidence} from './pluginStepValidation.js';
export type Row = Record<string,any>;
export class SolutionError extends CrmRequestError {
  constructor(code:string,message:string,readonly data:Row = {},details:CrmErrorDetails = {outcome:'not_sent'}) {super('D365_SOLUTION_' + code,message,details);}
  override toJSON() {return {...super.toJSON(),data:this.data};}
}
export function fail(code:string,message:string,data:Row = {}):never {throw new SolutionError(code,message,data);}
export function row(value:unknown):Row {if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RESPONSE_INVALID','The native solution response is invalid.');return value as Row;}
export function guid(value:unknown,nullable = false):string|null {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) fail('INVALID','A native GUID is required.');
  return value.toLowerCase();
}
export function objectId(value:unknown):string {const id = guid(value)!;if (id === '00000000-0000-0000-0000-000000000000') fail('INVALID','A nonzero component/solution GUID is required.');return id;}
export function name(value:unknown):string {if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(value)) fail('INVALID','A solution unique name or table logical name is required.');return value;}
export function integer(value:unknown,fallback:number,min = 1,max = 2147483647):number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail('INVALID','A numeric argument is outside its supported range.');return value as number;
}
export function flag(value:unknown,fallback = false):boolean {if (value === undefined) return fallback;if (typeof value !== 'boolean') fail('INVALID','A Boolean argument is required.');return value;}
const aliases:Record<string,string> = {solutionUniqueName:'solution_unique_name',solutionId:'solution_id',componentId:'component_id',componentType:'component_type',
  logicalName:'logical_name',maxPages:'max_pages',dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write'};
export function args(raw:unknown,allowed:string[]):Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 30) fail('INVALID','Expected bounded solution arguments.');
  const result:Row = {};
  for (const [key,value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const field = Object.hasOwn(aliases,key) ? aliases[key] : key;
    if (!allowed.includes(field) || value !== null && !['string','number','boolean'].includes(typeof value) || typeof value === 'string' && value.length > 512) fail('INVALID','An unknown or invalid solution argument was supplied.');
    if (Object.hasOwn(result,field) && result[field] !== value) fail('INVALID','Conflicting solution aliases.');
    result[field] = value;
  }
  return result;
}
export async function protect<T>(run:()=>Promise<T>):Promise<T> {
  try {
    const result = await run();
    if (Buffer.byteLength(JSON.stringify(result)) > 5 * 1024 * 1024) {
      const state = result && typeof result === 'object' ? result as Row : {};
      fail('RESULT_LIMIT','The solution result exceeds 5 MiB.',{saved:state.saved,operation:state.operation,phase:'result',
        solutionId:state.solution?.solutionid,componentId:state.component?.objectId});
    }
    return result;
  } catch (error) {
    if (error instanceof SolutionError) throw error;
    if (error instanceof CrmRequestError && error.code === 'D365_REQUEST_ABORTED') throw error;
    const details = evidence(error);
    throw new SolutionError('REQUEST_FAILED','The native solution operation failed. Platform text and raw responses are withheld.',
      {sourceStatus:details.status === 403 ? 'forbidden' : details.status === 404 ? 'unavailable_or_hidden' : 'failed'},details);
  }
}
export function project(value:unknown,fields:string):Row {
  const source = row(value),result:Row = {};
  for (const key of fields.split(',')) if (Object.hasOwn(source,key)) {
    const value = source[key];
    if (value !== null && !['number','string','boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)
      || typeof value === 'string' && value.length > 4096) fail('RESPONSE_INVALID','A native solution column is malformed.');
    result[key] = value;
  }
  return result;
}
/** Bounded native collection reads. Continuations cannot change service, path or query scope. */
export class SolutionReader {
  constructor(readonly client:CrmRequestClient,private readonly environment:{orgUrl:string;apiVersion:string},readonly signal?:AbortSignal) {}
  async request(endpoint:string,method:'GET'|'POST' = 'GET',body?:unknown,headers:Record<string,string> = {}) {
    if (this.signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','The solution operation was cancelled.',{outcome:'not_sent'});
    this.client.validateEndpoint?.(endpoint);
    const response = await this.client.requestWithResponse(endpoint,method,body,{headers,signal:this.signal});
    if (response.status < 200 || response.status >= 300) throw new CrmRequestError('D365_SOLUTION_RESPONSE_INVALID','Unexpected native solution status.',
      {status:response.status,outcome:method === 'POST' && response.status >= 500 ? 'unknown' : 'rejected'});
    return response;
  }
  private url(endpoint:string):URL {
    const base = new URL(this.environment.orgUrl.replace(/\/+$/,'') + '/api/data/' + this.environment.apiVersion + '/');
    let url:URL;
    try {url = /^[a-z][a-z\d+.-]*:/i.test(endpoint) ? new URL(endpoint) : endpoint.startsWith(base.pathname)
      ? new URL(endpoint,base.origin) : new URL(endpoint.replace(/^\//,''),base);} catch {return fail('PAGING_SCOPE','The native continuation URI is invalid.');}
    if (endpoint.startsWith('//') || endpoint.includes('\\') || url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password || url.hash) fail('PAGING_SCOPE','A native continuation leaves the configured service.');
    return url;
  }
  private next(endpoint:unknown,initial:URL):string|undefined {
    if (endpoint === undefined || endpoint === null) return undefined;
    if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 32768) fail('RESPONSE_INVALID','A native continuation is invalid.');
    const next = this.url(endpoint);
    if (next.pathname !== initial.pathname) fail('PAGING_SCOPE','A native continuation changes collection/function scope.');
    for (const key of ['$top','$skip','$skiptoken']) if (next.searchParams.getAll(key).length > 1) fail('PAGING_SCOPE','Duplicate native paging options are invalid.');
    if (next.searchParams.has('$skip') || next.searchParams.has('$top')) fail('PAGING_SCOPE','Native solution paging must not introduce $skip/$top.');
    const keys = new Set([...initial.searchParams.keys(),...next.searchParams.keys()]);
    for (const key of keys) {
      if (key === '$skiptoken') continue;
      if (JSON.stringify(initial.searchParams.getAll(key)) !== JSON.stringify(next.searchParams.getAll(key))) fail('PAGING_SCOPE','A native continuation changes the original query scope.');
    }
    this.client.validateEndpoint?.(next.href);
    return next.href;
  }
  async list(endpoint:string,limit:number,maxPages:number,convert:(row:unknown)=>Row,id:(row:Row)=>string) {
    const initial = this.url(endpoint),seen = new Set<string>(),ids = new Set<string>(),items:Row[] = [];
    let next:string|undefined = endpoint,pages = 0;
    const pageSize = Math.min(500,limit+1);
    while (next && pages < maxPages && items.length <= limit) {
      const key = this.url(next).href;
      if (seen.has(key)) fail('RESPONSE_INVALID','The native collection paging repeats a page.');seen.add(key);
      const data = row((await this.request(next,'GET',undefined,{Prefer:'odata.maxpagesize=' + pageSize})).data);
      if (Buffer.byteLength(JSON.stringify(data)) > 5 * 1024 * 1024 || !Array.isArray(data.value) || data.value.length > 5000) fail('RESPONSE_INVALID','The native collection is invalid or exceeds its page bound.');
      for (const value of data.value) {
        const item = convert(value),identity = id(item);
        if (ids.has(identity)) fail('RESPONSE_INVALID','A native collection repeats an identity.');ids.add(identity);
        if (items.length <= limit) items.push(item);
      }
      pages++;next = this.next(data['@odata.nextLink'],initial);
      if (items.length > limit) break;
    }
    const more = !!next || items.length > limit;
    return {items:items.slice(0,limit),paging:{limit,maxPages,pages,complete:!more,hasMore:more,visibility:'current_caller',snapshot:false}};
  }
}
