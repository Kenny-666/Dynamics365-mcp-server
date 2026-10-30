import type { CrmDataClient } from '../types/crmRequest.js';
import type { FetchXmlValidationResult } from '../types/index.js';
import type { QueryOptions, QueryPage, QueryState } from '../types/query.js';
import { toolErrorPayload } from '../errors.js';
import { checkResumeOptions, identifier, integer, QueryMetadata, queryError, queryOptions, statePolicy } from './queryState.js';
import { collectQuery, resumeQuery } from './queryPaging.js';
import { children, pagingCookie, parseXml, rootStateInFetch, xml } from './queryXml.js';

export class FetchXmlService {
  constructor(private readonly auth: CrmDataClient) {}

  async query(fetchXml: string | undefined, options: QueryOptions = {}) {
    const normalized = queryOptions(options);
    if (options.continuation !== undefined) {
      checkResumeOptions(options, [fetchXml]);
      return collectQuery(this.auth, resumeQuery(this.auth, options.continuation, 'fetchxml'), options,
        (state, endpoint, page) => this.advance(state, endpoint, page));
    }
    const document = parseXml(fetchXml!, 'fetch');
    const fetch = document.documentElement!;
    const roots = children(fetch, 'entity');
    if (roots.length !== 1) throw queryError('FetchXML must contain exactly one root entity.');
    const entity = roots[0];
    const logicalName = identifier(entity.getAttribute('name') || '', 'entity name');
    const top = fetch.hasAttribute('top') ? integer(Number(fetch.getAttribute('top')), 'FetchXML top', 5000) : undefined;
    if (top !== undefined && (options.page_size !== undefined || ['count','page','paging-cookie'].some(name => fetch.hasAttribute(name)))) {
      throw queryError('FetchXML top cannot be combined with count, page, paging-cookie or page_size.');
    }
    const count = fetch.hasAttribute('count') ? integer(Number(fetch.getAttribute('count')), 'FetchXML count', 5000) : normalized.page_size;
    if (options.page_size !== undefined && fetch.hasAttribute('count') && count !== normalized.page_size) {
      throw queryError('page_size conflicts with FetchXML count; use only one page-size setting.');
    }
    const pageNumber = fetch.hasAttribute('page') ? integer(Number(fetch.getAttribute('page')), 'FetchXML page', 50000) : 1;
    if (fetch.hasAttribute('paging-cookie')) parseXml(fetch.getAttribute('paging-cookie')!, 'cookie');
    if (!top && !fetch.hasAttribute('paging-cookie') && (pageNumber - 1) * count >= 50000) {
      throw queryError('Simple FetchXML paging cannot start beyond 50000 rows; use a paging cookie.');
    }

    const metadata = new QueryMetadata(this.auth);
    const info = await metadata.byLogicalName(logicalName);
    const stateFilter = await statePolicy(metadata, logicalName, options, rootStateInFetch(entity));
    if (stateFilter.values) {
      const and = document.createElement('filter');
      and.setAttribute('type', 'and');
      for (const old of children(entity, 'filter')) and.appendChild(old);
      const states = document.createElement('filter');
      states.setAttribute('type', 'or');
      for (const value of stateFilter.values) {
        const condition = document.createElement('condition');
        condition.setAttribute('attribute', 'statecode');
        condition.setAttribute('operator', 'eq');
        condition.setAttribute('value', String(value));
        states.appendChild(condition);
      }
      and.appendChild(states);
      entity.appendChild(and);
    }
    const special = ['aggregate', 'distinct'].some(name => ['true','1'].includes(fetch.getAttribute(name) || ''));
    const order = children(entity, 'order');
    if (!special && info.PrimaryIdAttribute && !order.some(node =>
      node.getAttribute('attribute') === info.PrimaryIdAttribute && !node.hasAttribute('entityname'))) {
      const primaryOrder = document.createElement('order');
      primaryOrder.setAttribute('attribute', info.PrimaryIdAttribute);
      entity.appendChild(primaryOrder);
    }
    const ordered = children(entity, 'order').length > 0;
    if (special && !ordered && normalized.fetch_all && !top) {
      throw queryError('Automatic paging of distinct/aggregate FetchXML requires an explicit root order; no primary-key column is injected.');
    }
    if (!top) {
      fetch.setAttribute('count', String(count));
      fetch.setAttribute('page', String(pageNumber));
    }
    const effective = xml(document);
    const annotations = ['Microsoft.Dynamics.CRM.fetchxmlpagingcookie', 'Microsoft.Dynamics.CRM.morerecords'];
    if (normalized.formatted_values) annotations.push('OData.Community.Display.V1.FormattedValue');
    const warnings = [
      'Legacy mode uses numeric statecode=0 where defined, without inferring a business label.',
      'Paging is dynamic, not a database snapshot. No related collection is independently auto-paged.',
    ];
    if (pageNumber > 1) warnings.push('The supplied FetchXML starts after page 1; completion refers to that starting position.');
    if (special) warnings.push('Distinct/aggregate columns are preserved; caller-supplied ordering must be deterministic.');
    const state: QueryState = {
      kind:'fetchxml', scope:logicalName,
      nextRequest:'/' + info.EntitySetName + '?fetchXml=' + encodeURIComponent(effective),
      headers:{Prefer:'odata.include-annotations="' + annotations.join(',') + '"'},
      buffer:[], envelope:{}, seen:[],
      fetch:{pageSize:count, ordered, top:top !== undefined, xml:effective},
      query:{kind:'fetchxml', state:stateFilter, fetchXml:effective, top, warnings},
    };
    return collectQuery(this.auth, state, options, (current, endpoint, page) => this.advance(current, endpoint, page));
  }

  private advance(state: QueryState, endpoint: string, page: QueryPage): void {
    const plan = state.fetch!;
    const next = page['@odata.nextLink'];
    if (next !== undefined && (typeof next !== 'string' || !next)) throw queryError('Invalid FetchXML continuation URL.', 'D365_QUERY_RESPONSE_INVALID');
    const more = page['@Microsoft.Dynamics.CRM.morerecords'];
    if (more !== undefined && typeof more !== 'boolean' && more !== 'true' && more !== 'false') {
      throw queryError('Invalid FetchXML more-records annotation.', 'D365_QUERY_RESPONSE_INVALID');
    }
    const moreRecords = more === true || more === 'true';
    const cookieAnnotation = page['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'];
    const hasMore = Boolean(next || moreRecords || (more === undefined && cookieAnnotation));
    state.nextRequest = undefined;
    if (!hasMore) return;
    if (plan.top) throw queryError('Server returned paging information for a top-limited FetchXML query.', 'D365_QUERY_RESPONSE_INVALID');
    if (!plan.ordered) {
      state.blockedMore = 'explicit_order_required';
      return;
    }
    if (typeof next === 'string') this.auth.validateEndpoint?.(next);
    const currentXml = new URL(endpoint, 'https://query.invalid').searchParams.get('fetchXml') || plan.xml;
    const document = parseXml(currentXml, 'fetch');
    const fetch = document.documentElement!;
    const currentPage = integer(Number(fetch.getAttribute('page') || '1'), 'FetchXML page', 50000);
    const cookie = pagingCookie(cookieAnnotation);
    if (cookie) fetch.setAttribute('paging-cookie', cookie);
    else {
      fetch.removeAttribute('paging-cookie');
      if (!state.query.warnings.includes('Server returned no paging cookie; simple paging is limited to 50000 rows.')) {
        state.query.warnings.push('Server returned no paging cookie; simple paging is limited to 50000 rows.');
      }
      if (!next && currentPage * plan.pageSize >= 50000) {
        state.blockedMore = 'simple_paging_limit';
        return;
      }
    }
    fetch.setAttribute('page', String(currentPage + 1));
    plan.xml = xml(document);
    const queryStart = endpoint.indexOf('?');
    const requestPath = queryStart === -1 ? endpoint : endpoint.slice(0, queryStart);
    state.nextRequest = typeof next === 'string' ? next : requestPath + '?fetchXml=' + encodeURIComponent(plan.xml);
  }

  async previewFetchXmlData(fetchXml: string, options: QueryOptions = {}): Promise<FetchXmlValidationResult> {
    try {
      // Use the same preparation/execution path; keep the existing preview result fields.
      const result = await this.query(fetchXml, {...options, fetch_all:false, max_records:1});
      return {isSuccess:true, sampleData:result.value[0] ?? null, query:result.query, paging:result.paging};
    } catch (error) {
      const payload = toolErrorPayload(error);
      return {isSuccess:false, errorMessage:String(payload.error), error:payload};
    }
  }
}

