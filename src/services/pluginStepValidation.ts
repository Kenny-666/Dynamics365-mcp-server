import { CrmRequestError, type CrmErrorDetails, redactSecrets } from '../errors.js';

export type Row = Record<string, any>;
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const aliases: Record<string, string> = {
  pluginTypeName:'plugin_type_name', assemblyName:'assembly_name', primaryEntity:'primary_entity',
  stepId:'step_id', includeUnsecureConfiguration:'include_unsecure_configuration',
  includeSecureConfiguration:'include_secure_configuration', pluginType:'plugin_type',
  supportedDeployment:'supported_deployment', filteringAttributes:'filtering_attributes',
  impersonatingUserId:'impersonating_user_id', unsecureConfiguration:'unsecure_configuration',
  secureConfiguration:'secure_configuration', conflictPolicy:'conflict_policy', ifMatch:'if_match',
  dryRun:'dry_run', allowUnprotectedUpdate:'allow_unprotected_update',
};

export class PluginStepError extends CrmRequestError {
  constructor(code: string, message: string, readonly data: Row = {}, details: CrmErrorDetails = {outcome:'not_sent'}) {
    super(code, message, details);
  }
  override toJSON() { return {...super.toJSON(), data:this.data}; }
}

export function invalid(message: string): never {
  throw new PluginStepError('D365_PLUGIN_INVALID', message);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) =>
    [Object.hasOwn(aliases, key) ? aliases[key] : key, canonical(item)])
    .sort(([left], [right]) => String(left).localeCompare(String(right)));
  return value;
}

/** Normalize only known keys at each object level; compare nested alias values structurally. */
export function object(value: unknown, allowed: string[]): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an argument object.');
  const result: Row = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    const name = aliases[key] || key;
    if (!allowed.includes(name)) invalid('An unknown plugin argument was supplied.');
    if (Object.hasOwn(result, name) && JSON.stringify(canonical(result[name])) !== JSON.stringify(canonical(item))) invalid('Conflicting aliases for ' + name + '.');
    result[name] = item;
  }
  return result;
}

export function text(value: unknown, field: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim())) invalid(field + ' must be ' + (empty ? 'a string.' : 'a non-empty string.'));
  return value;
}
export function guid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !GUID.test(value)) invalid(field + ' must be a GUID.');
  return value.toLowerCase();
}
export function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : text(value, field).trim();
}
export function logical(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const result = text(value, 'primary_entity').trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]*$/.test(result)) invalid('primary_entity must be a logical table name.');
  return result;
}
export function bool(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') invalid(field + ' must be a boolean.');
  return value;
}
export function integer(value: unknown, field: string, max = 2147483647): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) invalid(field + ' must be an integer from 1 to ' + max + '.');
  return value as number;
}
const stages: Row = {PreValidation:10, PreOperation:20, PostOperation:40};
const modes: Row = {Synchronous:0, Asynchronous:1};
const deployments: Row = {ServerOnly:0, OfflineOnly:1, Both:2};
export function choice(value: unknown, field: 'stage' | 'mode' | 'supported_deployment'): number {
  const mapping = field === 'stage' ? stages : field === 'mode' ? modes : deployments;
  const result = typeof value === 'string' && Object.hasOwn(mapping, value) ? mapping[value] : value;
  if (!Object.values(mapping).includes(result)) invalid('Invalid ' + field + ' value.');
  return result as number;
}
export function stageMode(stage: number, mode: number) {
  if (mode === 1 && stage !== 40) invalid('Asynchronous steps require PostOperation (stage 40).');
}
export function etag(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(?:W\/)?"[\x21\x23-\x7e]+"$/.test(value)) invalid('if_match must be a specific ETag such as W/"123".');
  return value;
}
export function attributes(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) invalid('filtering_attributes must be an array of at most 100 logical field names.');
  return [...new Set(value.map(item => {
    const name = text(item, 'filtering_attributes item').trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) invalid('Invalid filtering attribute logical name.');
    return name;
  }))];
}
export interface Mutation {action:'keep' | 'set' | 'clear'; value?:string;}
export function mutation(value: unknown): Mutation {
  if (value === undefined) return {action:'keep'};
  const item = object(value, ['action','value']);
  if (!['keep','set','clear'].includes(item.action)) invalid('Configuration action must be keep, set or clear.');
  if (item.action === 'set') return {action:'set', value:text(item.value, 'configuration value', true)};
  if (item.value !== undefined) invalid('Configuration value is accepted only with action=set.');
  return {action:item.action};
}
export function patch(value: unknown): Row {
  const result = value === undefined ? {} : object(value, ['name','description','stage','mode','rank',
    'supported_deployment','filtering_attributes','enabled','impersonating_user_id']);
  for (const field of ['name','description']) if (result[field] !== undefined) result[field] = text(result[field], field, field === 'description');
  for (const field of ['stage','mode','supported_deployment'] as const) if (result[field] !== undefined) result[field] = choice(result[field], field);
  if (result.rank !== undefined) result.rank = integer(result.rank, 'rank');
  if (result.enabled !== undefined) result.enabled = bool(result.enabled, 'enabled');
  if (result.impersonating_user_id !== undefined && result.impersonating_user_id !== null) result.impersonating_user_id = guid(result.impersonating_user_id, 'impersonating_user_id');
  if (result.filtering_attributes !== undefined) result.filtering_attributes = attributes(result.filtering_attributes);
  return result;
}

export function evidence(error: unknown, secrets: string[] = []): CrmErrorDetails {
  const details = error instanceof CrmRequestError ? error.details : {};
  const identifier = (value: unknown) => typeof value === 'string' && (GUID.test(value) || /^0x[0-9a-f]{8}$/i.test(value))
    ? redactSecrets(value, secrets) : undefined;
  // Never forward platform message text or arbitrary transport data.
  return {status:details.status, attempts:details.attempts, retryAfterMs:details.retryAfterMs,
    retryable:details.retryable, outcome:details.outcome,
    platformCode:identifier(details.platformCode), requestId:identifier(details.requestId)};
}

/** Errors must never echo a submitted secure/unsecure configuration, even from raw transports. */
export async function protect<T>(run: () => Promise<T>, raw?: unknown): Promise<T> {
  const secrets: string[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) if (['secure_configuration','unsecure_configuration'].includes(aliases[key] || key)) {
      if (typeof value === 'string' && value) secrets.push(value);
      else if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'string' && value.value) secrets.push(value.value);
    }
  }
  try { return await run(); } catch (error) {
    if (error instanceof PluginStepError) throw new PluginStepError(error.code, error.message, error.data, evidence(error, secrets));
    throw new CrmRequestError(error instanceof CrmRequestError ? error.code : 'D365_PLUGIN_REQUEST_FAILED',
      'The native plugin operation failed. Configuration and platform message text are withheld.',
      evidence(error, secrets));
  }
}
