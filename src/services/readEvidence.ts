import { CrmRequestError, type CrmErrorDetails, redactSecrets } from '../errors.js';
import type { CrmRequestClient } from '../types/crmRequest.js';

export type Row = Record<string,any>;
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const aliases:Record<string,string> = {
  fromTime:'from_time',toTime:'to_time',correlationId:'correlation_id',pluginTypeName:'plugin_type_name',
  stepId:'step_id',includeText:'include_text',maxTextChars:'max_text_chars',maxPages:'max_pages',
  exceptionsOnly:'exceptions_only',nameKeyword:'name_keyword',principalType:'principal_type',principalId:'principal_id',
  businessUnitId:'business_unit_id',includeTeamRoles:'include_team_roles',teamLimit:'team_limit',roleLimit:'role_limit',
  collectionName:'collection_name',recordId:'record_id',auditId:'audit_id',includeValues:'include_values',
  pageSize:'page_size',pageNumber:'page_number',pagingCookie:'paging_cookie',
};
export class EvidenceError extends CrmRequestError {
  constructor(code:string,message:string,readonly data:Row = {},details:CrmErrorDetails = {}) { super(code,message,details); }
  override toJSON() { return {...super.toJSON(),data:this.data}; }
}
export function invalid(message:string):never { throw new EvidenceError('D365_READ_INVALID',message,{},{outcome:'not_sent'}); }
export function malformed():never { throw new EvidenceError('D365_READ_RESPONSE_INVALID','The native read response was incomplete or invalid.'); }
export function record(value:unknown):Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) malformed();
  return value as Row;
}
function stable(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.entries(value).map(([key,item]) => [key,stable(item)]).sort(([a],[b]) => String(a).localeCompare(String(b)));
  return value;
}
export function input(value:unknown,allowed:string[]):Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Arguments must be an object.');
  const result:Row = {};
  for (const [key,item] of Object.entries(value)) {
    if (item === undefined) continue;
    const name = Object.hasOwn(aliases,key) ? aliases[key] : key;
    if (!allowed.includes(name)) invalid('An unknown read argument was supplied.');
    if (Object.hasOwn(result,name) && JSON.stringify(stable(result[name])) !== JSON.stringify(stable(item))) invalid('Conflicting aliases for ' + name + '.');
    result[name] = item;
  }
  return result;
}
export function guid(value:unknown,field:string):string {
  if (typeof value !== 'string' || !GUID.test(value)) invalid(field + ' must be a GUID.');
  return value.toLowerCase();
}
export function rowGuid(value:unknown):string {
  if (typeof value !== 'string' || !GUID.test(value)) malformed();
  return value.toLowerCase();
}
export function identifier(value:unknown,field:string):string {
  if (typeof value !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) invalid(field + ' must be a logical identifier.');
  return value;
}
export function text(value:unknown,field:string):string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) invalid(field + ' must be a non-empty string of at most 500 characters.');
  return value.trim();
}
export function bool(value:unknown,field:string,fallback = false):boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') invalid(field + ' must be a boolean.');
  return value;
}
export function integer(value:unknown,field:string,fallback:number,min:number,max:number):number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) invalid(field + ' is outside its supported integer range.');
  return value as number;
}
export function timestamp(value:unknown,field:string):string {
  if (typeof value !== 'string') invalid(field + ' must be an ISO timestamp with an explicit timezone.');
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) invalid(field + ' must be a valid ISO timestamp with an explicit timezone.');
  const [year,month,day,hour,minute,second] = match.slice(1,7).map(Number);
  const check = new Date(Date.UTC(year,month - 1,day));
  if (year < 1000 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
      hour > 23 || minute > 59 || second > 59) invalid(field + ' contains an invalid calendar date/time.');
  return new Date(value).toISOString();
}
export const filterFields = ['from_time','to_time','correlation_id','step_id','top','max_pages','include_text','max_text_chars'];
export function filters(args:Row,now:Date):Row {
  for (const field of ['correlation_id','step_id']) if (args[field] !== undefined) args[field] = guid(args[field],field);
  if (args.plugin_type_name !== undefined) args.plugin_type_name = text(args.plugin_type_name,'plugin_type_name');
  args.to_time = args.to_time === undefined ? now.toISOString() : timestamp(args.to_time,'to_time');
  args.from_time = args.from_time === undefined ? new Date(Date.parse(args.to_time) - 86400000).toISOString() : timestamp(args.from_time,'from_time');
  if (Date.parse(args.from_time) >= Date.parse(args.to_time)) invalid('from_time must be earlier than to_time.');
  args.top = integer(args.top,'top',50,1,100);
  args.max_pages = integer(args.max_pages,'max_pages',5,1,20);
  args.include_text = bool(args.include_text,'include_text');
  args.max_text_chars = integer(args.max_text_chars,'max_text_chars',2000,100,8000);
  if (args.exceptions_only !== undefined) args.exceptions_only = bool(args.exceptions_only,'exceptions_only');
  return args;
}
export const literal = (value:string) => "'" + value.replace(/'/g,"''") + "'";
export const query = (values:Record<string,string>) => new URLSearchParams(values).toString();
export function evidence(error:unknown):Row {
  const e = error instanceof CrmRequestError ? error : undefined, d = e?.details ?? {};
  return {code:e?.code ?? 'D365_READ_FAILED',status:d.status,retryable:d.retryable,
    platformCode:typeof d.platformCode === 'string' && /^0x[0-9a-f]{8}$/i.test(d.platformCode) ? d.platformCode : undefined,
    requestId:typeof d.requestId === 'string' && GUID.test(d.requestId) ? d.requestId : undefined};
}
export function sourceStatus(error:unknown):string {
  if (!(error instanceof CrmRequestError)) return 'failed';
  return error.details.status === 403 ? 'forbidden' : error.details.status === 404 ? 'unavailable_or_hidden'
    : error.code === 'D365_READ_RESPONSE_INVALID' ? 'invalid_response' : 'failed';
}
export function cleanText(value:unknown,limit:number):{text:string|null;truncated:boolean} {
  if (value === undefined || value === null) return {text:null,truncated:false};
  if (typeof value !== 'string') malformed();
  return {text:redactSecrets(value,[]).slice(0,limit),truncated:value.length > limit};
}
export function pick(row:Row,columns:string[]):Row {
  const result:Row = {};
  for (const field of columns) if (Object.hasOwn(row,field)) {
    const value = row[field];
    if (value !== null && !['string','number','boolean'].includes(typeof value)) malformed();
    if (typeof value === 'number' && !Number.isFinite(value)) malformed();
    result[field] = typeof value === 'string' ? redactSecrets(value,[]) : value;
  }
  return result;
}
export function bounded(value:unknown,limit:number,depth = 0,field = ''):unknown {
  if (depth > 8) return '[DEPTH_LIMIT]';
  if (/(?:password|secret|token|configuration|secureconfig|content)/i.test(field)) return '[REDACTED]';
  if (typeof value === 'string') return cleanText(value,limit).text;
  if (Array.isArray(value)) {
    if (value.length > 1000) malformed();
    return value.map(item => bounded(item,limit,depth + 1));
  }
  if (value && typeof value === 'object') {
    if (Object.keys(value).length > 1000) malformed();
    return Object.fromEntries(Object.entries(value).filter(([key]) => !key.includes('@')).map(([key,item]) => [key,bounded(item,limit,depth + 1,key)]));
  }
  return value;
}
export async function protect<T>(run:()=>Promise<T>):Promise<T> {
  try {
    const result = await run();
    if (Buffer.byteLength(JSON.stringify(result)) > 5 * 1024 * 1024) throw new EvidenceError('D365_READ_RESULT_LIMIT','Read result exceeds 5 MiB. Reduce the page size, top or text inclusion.');
    return result;
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    const e = evidence(error);
    const {code:ignoredCode,...details} = e;
    throw new EvidenceError(e.status === 403 ? 'D365_READ_FORBIDDEN' : e.code,
      'The native read failed. Platform message text and response data are withheld.',{sourceStatus:sourceStatus(error)},details);
  }
}

export class EvidenceReader {
  constructor(readonly client:CrmRequestClient,readonly signal?:AbortSignal) {}
  async get(endpoint:string):Promise<Row> {
    if (this.signal?.aborted) throw new EvidenceError('D365_REQUEST_ABORTED','The read was cancelled.');
    this.client.validateEndpoint?.(endpoint);
    return record(await this.client.makeRequest(endpoint,'GET',undefined,{signal:this.signal}));
  }
  async list(endpoint:string,top:number,maxPages:number):Promise<Row> {
    let next:string|undefined = endpoint;
    const rows:Row[] = [],seen = new Set<string>();
    while (next && rows.length < top && seen.size < maxPages) {
      const key = this.client.validateEndpoint?.(next) ?? next;
      if (seen.has(key)) malformed();
      seen.add(key);
      const page = await this.get(next);
      if (!Array.isArray(page.value) || page.value.length > top - rows.length) malformed();
      for (const row of page.value) rows.push(record(row));
      next = page['@odata.nextLink'];
      if (next !== undefined && (typeof next !== 'string' || !next)) malformed();
      if (next) this.client.validateEndpoint?.(next);
    }
    return {rows,paging:{top,pages:seen.size,hasMore:!!next,atLimit:rows.length === top,
      limited:!!next || rows.length === top,stoppedBecause:next ? rows.length === top ? 'top' : 'max_pages' : 'query_finished',
      note:'Bounded native query; reaching top does not prove that all matching records were returned.'}};
  }
  async component(name:string,run:()=>Promise<unknown>):Promise<Row> {
    try { return {source:name,status:'ok',data:await run()}; }
    catch (error) {
      if (this.signal?.aborted || (error instanceof CrmRequestError && (error.details.status === 401 || error.code === 'D365_AUTH_FAILED' || error.code === 'D365_REQUEST_ABORTED'))) throw error;
      return {source:name,status:sourceStatus(error),issue:evidence(error)};
    }
  }
}
