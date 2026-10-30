import type { CrmDataClient } from '../types/crmRequest.js';
import type { ODataQueryOptions, QueryPage, QueryState } from '../types/query.js';
import { checkResumeOptions, integer, QueryMetadata, queryError, queryOptions, rootStateInOData, statePolicy } from './queryState.js';
import { collectQuery, resumeQuery } from './queryPaging.js';
import { RecordMutationService } from './recordMutation.js';
import { guid, identifier, RecordMutationError } from './recordMutationInput.js';
import { ApiOperationService } from './apiOperation.js';

export class RecordService {
  private auth: CrmDataClient;

  constructor(auth: CrmDataClient, private readonly writer?: RecordMutationService) {
    this.auth = auth;
  }

  /**
   * Preserve legacy state=0 filtering where valid; make state and pagination explicit.
   */
  async searchRecords(collectionName: string, select?: string, filter?: string, top?: number,
    options: ODataQueryOptions = {}): Promise<any> {
    queryOptions(options);
    if (options.continuation !== undefined) {
      checkResumeOptions(options, [select, filter, top]);
      return collectQuery(this.auth, resumeQuery(this.auth, options.continuation, 'odata', collectionName), options,
        (state, _endpoint, page) => this.advanceOData(state, page));
    }
    if (top !== undefined) {
      integer(top, 'top', 5000);
      if (options.page_size !== undefined) throw queryError('top and page_size cannot be combined.');
    }
    for (const [key, value] of Object.entries({select, filter, orderby:options.orderby, expand:options.expand})) {
      if (value !== undefined && (typeof value !== 'string' || !value.trim())) throw queryError(key + ' must be a non-empty string.');
    }
    const normalized = queryOptions(options);
    const metadata = new QueryMetadata(this.auth);
    const entity = await metadata.byCollection(collectionName);
    const stateFilter = await statePolicy(metadata, entity.LogicalName, options, rootStateInOData(filter || ''));
    const params = new URLSearchParams();
    if (select) params.append('$select', select);
    let finalFilter = filter;
    if (stateFilter.values) {
      const condition = stateFilter.values.map(value => 'statecode eq ' + value).join(' or ');
      finalFilter = filter ? '(' + filter + ') and (' + condition + ')' : condition;
    }
    if (finalFilter) params.set('$filter', finalFilter);
    if (top !== undefined) params.set('$top', String(top));
    const ordering = (options.orderby || '').split(',').map(value => value.trim()).filter(Boolean);
    if (ordering.some(value => !/^[a-zA-Z_][\w/]*(?:\s+(?:asc|desc))?$/i.test(value))) throw queryError('orderby must contain property paths with optional asc/desc.');
    if (entity.PrimaryIdAttribute && !ordering.some(value => value.split(/\s/)[0] === entity.PrimaryIdAttribute)) ordering.push(entity.PrimaryIdAttribute);
    if (ordering.length) params.set('$orderby', ordering.join(','));
    if (options.expand) params.set('$expand', options.expand);
    const preferences = [];
    if (top === undefined) preferences.push('odata.maxpagesize=' + Math.min(normalized.page_size, normalized.max_records));
    if (normalized.formatted_values) preferences.push('odata.include-annotations="OData.Community.Display.V1.FormattedValue"');
    const warnings = [
      'Legacy mode uses numeric statecode=0 where defined; it does not infer a business label such as Active.',
      'Paging is evaluated per request, not from a database snapshot. Expanded child collections are not auto-paged.',
    ];
    if (!entity.PrimaryIdAttribute) warnings.push('No primary key metadata was returned; deterministic ordering cannot be guaranteed.');
    const state: QueryState = {
      kind:'odata', scope:collectionName, nextRequest:'/' + collectionName + '?' + params.toString(),
      buffer:[], envelope:{}, seen:[], headers:preferences.length ? {Prefer:preferences.join(', ')} : {},
      query:{kind:'odata', state:stateFilter, filter:finalFilter, orderby:ordering.join(','), top, warnings},
    };
    return collectQuery(this.auth, state, options, (current, _endpoint, page) => this.advanceOData(current, page));
  }

  private advanceOData(state: QueryState, page: QueryPage): void {
    const next = page['@odata.nextLink'];
    if (next !== undefined && (typeof next !== 'string' || !next)) throw queryError('Invalid OData continuation URL.', 'D365_QUERY_RESPONSE_INVALID');
    if (typeof next === 'string') this.auth.validateEndpoint?.(next);
    state.nextRequest = next as string | undefined;
  }

  /**
   * Get a single record by ID
   */
  async getRecordById(collectionName: string, id: string, select?: string): Promise<any> {
    identifier(collectionName, 'collection_name');
    id = guid(id);
    if (select !== undefined && (typeof select !== 'string' || !select.split(',').every(field => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.trim())))) {
      throw new RecordMutationError('D365_RECORD_INVALID', 'select must contain comma-separated logical attribute names.');
    }
    const endpoint = `/${collectionName}(${id})${select ? '?$select=' + select : ''}`;
    return await this.auth.makeRequest(endpoint, 'GET');
  }

  /**
   * Create a new record
   */
  async createNewRecord(collectionName: string, data: any, options:Record<string,unknown> = {}): Promise<any> {
    return this.requireWriter().execute('create', {...options,collection_name:collectionName,data});
  }

  /**
   * Update an existing record (PATCH)
   */
  async updateExistingRecord(collectionName: string, id: string, data: any, options:Record<string,unknown> = {}): Promise<any> {
    return this.requireWriter().execute('update', {...options,collection_name:collectionName,id,data});
  }

  /**
   * Delete a record
   */
  async deleteRecordById(collectionName: string, id: string, options:Record<string,unknown> = {}): Promise<any> {
    return this.requireWriter().execute('delete', {...options,collection_name:collectionName,id});
  }

  private requireWriter():RecordMutationService {
    if (!this.writer) throw new RecordMutationError('D365_RECORD_WRITER_REQUIRED','RecordService writes require the configured mutation service.');
    return this.writer;
  }

  /**
   * Invoke a Dataverse Custom Action or Function
   */
  async callD365Action(actionName: string, parameters?: any, isFunction?: boolean): Promise<any> {
    return new ApiOperationService(this.auth).invoke({action_name:actionName,parameters,is_function:isFunction});
  }
}
