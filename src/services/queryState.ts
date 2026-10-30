import { CrmRequestError } from '../errors.js';
import type { CrmDataClient } from '../types/crmRequest.js';
import type { QueryOptions, EffectiveQuery } from '../types/query.js';

export function queryError(message: string, code = 'D365_QUERY_INVALID'): CrmRequestError {
  return new CrmRequestError(code, message, {
    ...(code === 'D365_QUERY_RESPONSE_INVALID' ? {} : {outcome:'not_sent' as const}), retryable:false,
  });
}

export function identifier(value: string, label: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw queryError(label + ' must be a logical identifier.');
  return value;
}

export function integer(value: unknown, label: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw queryError(label + ' must be an integer between 1 and ' + max + '.');
  }
  return value;
}

export function queryOptions(options: QueryOptions) {
  const state_mode = options.state_mode ?? 'legacy';
  if (!['legacy', 'all', 'values'].includes(state_mode)) throw queryError('state_mode must be legacy, all or values.');
  if (state_mode === 'values') {
    if (!Array.isArray(options.state_values) || !options.state_values.length || options.state_values.length > 100 ||
        options.state_values.some(value => !Number.isSafeInteger(value))) throw queryError('state_values must contain 1 to 100 integers.');
  } else if (options.state_values !== undefined) throw queryError('state_values requires state_mode=values.');
  for (const flag of ['fetch_all', 'formatted_values'] as const) {
    if (options[flag] !== undefined && typeof options[flag] !== 'boolean') throw queryError(flag + ' must be a boolean.');
  }
  return {
    state_mode, state_values:[...new Set(options.state_values || [])],
    page_size:integer(options.page_size ?? 500, 'page_size', 5000),
    max_records:integer(options.max_records ?? 5000, 'max_records', 50000),
    max_pages:integer(options.max_pages ?? 10, 'max_pages', 100),
    fetch_all:options.fetch_all ?? false,
    formatted_values:options.formatted_values ?? false,
  };
}

export function checkResumeOptions(options: QueryOptions, extra: unknown[] = []): void {
  if (extra.some(value => value !== undefined) || Object.entries(options).some(([key, value]) =>
    value !== undefined && !['continuation','fetch_all','max_records','max_pages'].includes(key))) {
    throw queryError('A continuation resumes its saved query. Only fetch_all, max_records and max_pages may be changed.');
  }
}

interface EntityInfo {LogicalName:string; EntitySetName:string; PrimaryIdAttribute?:string;}

export class QueryMetadata {
  constructor(private readonly client: CrmDataClient) {}

  async byCollection(collection: string): Promise<EntityInfo> {
    identifier(collection, 'collection_name');
    const params = new URLSearchParams({'$select':'LogicalName,EntitySetName,PrimaryIdAttribute', '$filter':"EntitySetName eq '" + collection + "'"});
    const result = await this.client.makeRequest('/EntityDefinitions?' + params.toString());
    if (!Array.isArray(result?.value) || result.value.length !== 1) throw queryError('collection_name must identify exactly one EntitySetName.', 'D365_QUERY_METADATA_INVALID');
    return this.validateEntity(result.value[0]);
  }

  async byLogicalName(logicalName: string): Promise<EntityInfo> {
    identifier(logicalName, 'entity name');
    return this.validateEntity(await this.client.makeRequest("/EntityDefinitions(LogicalName='" + logicalName + "')?$select=LogicalName,EntitySetName,PrimaryIdAttribute"));
  }

  private validateEntity(value: EntityInfo | null): EntityInfo {
    if (!value) throw queryError('Entity metadata is missing.', 'D365_QUERY_METADATA_INVALID');
    identifier(value.LogicalName, 'metadata LogicalName');
    identifier(value.EntitySetName, 'metadata EntitySetName');
    if (value.PrimaryIdAttribute) identifier(value.PrimaryIdAttribute, 'metadata PrimaryIdAttribute');
    return value;
  }

  async stateValues(logicalName: string): Promise<number[] | null> {
    const path = "/EntityDefinitions(LogicalName='" + logicalName + "')/Attributes";
    const params = new URLSearchParams({'$select':'LogicalName,AttributeType', '$filter':"LogicalName eq 'statecode'"});
    const attributes = await this.client.makeRequest(path + '?' + params.toString());
    if (!Array.isArray(attributes?.value)) throw queryError('State attribute metadata is invalid.', 'D365_QUERY_METADATA_INVALID');
    if (attributes.value.length === 0) return null;
    if (attributes.value.length !== 1 || attributes.value[0]?.LogicalName !== 'statecode' || attributes.value[0]?.AttributeType !== 'State') {
      throw queryError('statecode is not a State attribute.', 'D365_QUERY_METADATA_INVALID');
    }
    const metadata = await this.client.makeRequest(path + "(LogicalName='statecode')/Microsoft.Dynamics.CRM.StateAttributeMetadata?$select=LogicalName&$expand=OptionSet");
    if (!Array.isArray(metadata?.OptionSet?.Options) || metadata.OptionSet.Options.some((option: {Value?:unknown}) => !Number.isSafeInteger(option?.Value))) {
      throw queryError('State option definitions are missing.', 'D365_QUERY_METADATA_INVALID');
    }
    return metadata.OptionSet.Options.map((option: {Value:number}) => option.Value);
  }
}

export async function statePolicy(metadata: QueryMetadata, logicalName: string, options: QueryOptions,
  explicit: boolean | 'ambiguous'): Promise<EffectiveQuery['state']> {
  const normalized = queryOptions(options);
  const mode = normalized.state_mode;
  if (mode === 'all') return {mode, disposition:'no_implicit_filter'};
  if (explicit) {
    if (mode === 'values') throw queryError('The query already has a root state condition or ambiguous scope; use its filter or state_values, not both.');
    return {mode, disposition:explicit === 'ambiguous' ? 'preserved_ambiguous_filter' : 'preserved_explicit_filter'};
  }
  const values = await metadata.stateValues(logicalName);
  if (values === null) {
    if (mode === 'values') throw queryError('The target table has no statecode field.');
    return {mode, disposition:'skipped_missing_statecode'};
  }
  const requested = mode === 'legacy' ? [0] : normalized.state_values;
  if (requested.some(value => !values.includes(value))) {
    if (mode === 'legacy') return {mode, disposition:'skipped_missing_zero_state'};
    throw queryError('state_values contains a value not defined for this table.');
  }
  return {mode, disposition:'injected', values:requested};
}

/** Lex strings separately so names in literals and navigation/lambda paths cannot mimic root fields. */
export function rootStateInOData(filter: string): boolean | 'ambiguous' {
  const tokens: {kind:'identifier'|'string'|'punct'; text:string}[] = [];
  for (let i = 0; i < filter.length;) {
    if (/\s/.test(filter[i])) { i++; continue; }
    if (filter[i] === "'") {
      let text = ''; let closed = false; i++;
      while (i < filter.length) {
        if (filter[i] === "'") {
          if (filter[i + 1] === "'") { text += "'"; i += 2; continue; }
          closed = true; i++; break;
        }
        text += filter[i++];
      }
      if (!closed) throw queryError('filter contains an unterminated string literal.');
      tokens.push({kind:'string', text});
    } else {
      const word = /^[a-zA-Z_$][a-zA-Z0-9_$]*/.exec(filter.slice(i));
      if (word) { tokens.push({kind:'identifier', text:word[0].toLowerCase()}); i += word[0].length; }
      else tokens.push({kind:'punct', text:filter[i++]});
    }
  }
  const hasLambda = tokens.some(token => token.kind === 'identifier' && ['any','all'].includes(token.text));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === 'identifier' && token.text === 'statecode') {
      if (tokens[i-1]?.text === '/') {
        if (tokens[i-2]?.text === '$it') return true;
      } else return hasLambda ? 'ambiguous' : true;
    }
    // Dataverse query functions such as In(PropertyName='statecode', ...).
    if (token.kind === 'string' && token.text === 'statecode' &&
        tokens[i-1]?.text === '=' && tokens[i-2]?.text === 'propertyname') return hasLambda ? 'ambiguous' : true;
  }
  return false;
}
