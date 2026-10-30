import { CrmRequestError, type CrmErrorDetails } from '../errors.js';
import type { MutationKind, Row } from '../types/recordMutation.js';

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const mutationAliases: Record<string,string> = {
  collectionName:'collection_name', ifMatch:'if_match', dryRun:'dry_run',
  allowUnprotectedWrite:'allow_unprotected_write', alternateKey:'alternate_key',
  navigationProperty:'navigation_property', relatedCollectionName:'related_collection_name', relatedId:'related_id',
  continueOnError:'continue_on_error', chunkSize:'chunk_size',
};
export const MAX_BODY_BYTES = 10 * 1024 * 1024;
export class RecordMutationError extends CrmRequestError {
  constructor(code: string, message: string, readonly data:Row = {}, details:CrmErrorDetails = {outcome:'not_sent'}) {
    super(code, message, details);
  }
  override toJSON() { return {...super.toJSON(), data:this.data}; }
}
export function invalid(message: string): never {
  throw new RecordMutationError('D365_RECORD_INVALID', message);
}
export function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) invalid(field + ' must be a logical identifier.');
  return value;
}
export function guid(value: unknown): string {
  if (typeof value !== 'string' || !GUID.test(value)) invalid('Record IDs must be GUIDs.');
  return value.toLowerCase();
}
export function bool(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') invalid(field + ' must be a boolean.');
  return value;
}
export function etag(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(?:W\/)?"[\x21\x23-\x7e]+"$/.test(value)) invalid('if_match requires a specific quoted ETag.');
  return value;
}
export function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected a JSON object.');
  return value as Row;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.entries(value).map(([key,item]) => [key,canonical(item)])
    .sort(([a],[b]) => String(a).localeCompare(String(b)));
  return value;
}
export function argumentsObject(value: unknown, allowed: string[]): Row {
  const result:Row = {};
  for (const [key,item] of Object.entries(object(value))) {
    if (item === undefined) continue;
    const name = Object.hasOwn(mutationAliases, key) ? mutationAliases[key] : key;
    if (!allowed.includes(name)) invalid('An unknown mutation argument was supplied.');
    if (Object.hasOwn(result,name) && JSON.stringify(canonical(result[name])) !== JSON.stringify(canonical(item))) invalid('Conflicting aliases for ' + name + '.');
    result[name] = item;
  }
  return result;
}
export const fieldsByKind: Record<MutationKind,string[]> = {
  create:['collection_name','data','dry_run'],
  update:['collection_name','id','data','if_match','allow_unprotected_write','dry_run'],
  delete:['collection_name','id','if_match','allow_unprotected_write','dry_run'],
  upsert:['collection_name','alternate_key','data','mode','if_match','allow_unprotected_write','dry_run'],
  associate:['collection_name','id','navigation_property','related_collection_name','related_id','if_match','allow_unprotected_write','dry_run'],
  disassociate:['collection_name','id','navigation_property','related_collection_name','related_id','if_match','allow_unprotected_write','dry_run'],
};
export function normalize(kind: MutationKind, raw: unknown): Row {
  const args = argumentsObject(raw, fieldsByKind[kind]);
  args.collection_name = identifier(args.collection_name,'collection_name');
  if (['update','delete','associate','disassociate'].includes(kind)) args.id = guid(args.id);
  args.dry_run = bool(args.dry_run,'dry_run');
  if (kind !== 'create') {
    args.if_match = etag(args.if_match);
    args.allow_unprotected_write = bool(args.allow_unprotected_write,'allow_unprotected_write');
  }
  if (['create','update','upsert'].includes(kind)) {
    args.data = object(args.data);
    if (!Object.keys(args.data).length) invalid('data must contain at least one attribute.');
    json(args.data);
  }
  if (kind === 'upsert') {
    args.alternate_key = object(args.alternate_key);
    const entries = Object.entries(args.alternate_key);
    if (!entries.length || entries.length > 16) invalid('alternate_key must contain 1–16 key columns.');
    for (const [field,value] of entries) {
      identifier(field,'alternate_key field');
      if (!['string','number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) invalid('Alternate key values must be non-null strings or finite numbers.');
    }
    args.mode ??= 'upsert';
    if (!['upsert','create_only','update_only'].includes(args.mode)) invalid('mode must be upsert, create_only or update_only.');
    if (args.mode === 'create_only' && args.if_match) invalid('create_only cannot be combined with if_match.');
  }
  if (kind === 'associate' || kind === 'disassociate') {
    args.navigation_property = identifier(args.navigation_property,'navigation_property');
    args.related_collection_name = identifier(args.related_collection_name,'related_collection_name');
    args.related_id = guid(args.related_id);
  }
  return args;
}
export function json(value: unknown): string {
  let serialized:string | undefined;
  try {
    serialized = JSON.stringify(value, (_key,item) => {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol' ||
          (typeof item === 'number' && !Number.isFinite(item))) invalid('data must use finite, serializable JSON values.');
      return item;
    });
  } catch { invalid('data must be a serializable JSON value.'); }
  if (serialized === undefined || Buffer.byteLength(serialized) > MAX_BODY_BYTES) invalid('The JSON body exceeds the 10 MiB limit.');
  return serialized;
}
export function safeDetails(error: unknown): CrmErrorDetails {
  const d = error instanceof CrmRequestError ? error.details : {};
  return {status:d.status, attempts:d.attempts, retryAfterMs:d.retryAfterMs, outcome:d.outcome, retryable:false,
    platformCode:typeof d.platformCode === 'string' && /^0x[0-9a-f]{8}$/i.test(d.platformCode) ? d.platformCode : undefined,
    requestId:typeof d.requestId === 'string' && GUID.test(d.requestId) ? d.requestId : undefined};
}
export function redact(value: unknown, key = ''): unknown {
  if (/(?:password|secret|token|secureconfig|configuration|content)/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([field,item]) => [field,redact(item,field)]));
  return value;
}
