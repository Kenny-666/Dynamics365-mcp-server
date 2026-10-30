import { randomUUID } from 'node:crypto';
import type { CrmDataClient } from '../types/crmRequest.js';
import type { QueryOptions, QueryPage, QueryState } from '../types/query.js';
import { queryError, queryOptions } from './queryState.js';

interface Entry {state:QueryState; expires:number; busy:boolean;}
class Continuations {
  private entries = new Map<string, Entry>();
  private prune() {
    for (const [key, value] of this.entries) if (value.expires <= Date.now() && !value.busy) this.entries.delete(key);
  }
  acquire(token: string, kind: string, scope?: string): QueryState {
    this.prune();
    const entry = this.entries.get(token);
    if (!entry) throw queryError('Continuation is expired, cleared or belongs to another connection. Restart the query.', 'D365_QUERY_CONTINUATION_EXPIRED');
    if (entry.state.kind !== kind || (scope && entry.state.scope !== scope)) throw queryError('Continuation does not match this tool or collection.');
    if (entry.busy) throw queryError('Continuation is already being consumed.', 'D365_QUERY_CONTINUATION_BUSY');
    entry.busy = true;
    return {...entry.state, buffer:[...entry.state.buffer], seen:[...entry.state.seen], envelope:{...entry.state.envelope},
      fetch:entry.state.fetch && {...entry.state.fetch},
      query:{...entry.state.query, warnings:[...entry.state.query.warnings], state:{...entry.state.query.state}}};
  }
  release(token: string) { const entry = this.entries.get(token); if (entry) entry.busy = false; }
  remove(token: string) { this.entries.delete(token); }
  save(state: QueryState): string {
    this.prune();
    if (this.entries.size >= 32) {
      const oldest = [...this.entries].find(([, entry]) => !entry.busy);
      if (oldest) this.entries.delete(oldest[0]);
      else throw queryError('Too many active continuations; finish or clear existing queries.');
    }
    const token = randomUUID();
    this.entries.set(token, {state, expires:Date.now() + 300000, busy:false});
    return token;
  }
  clear() { this.entries.clear(); }
}
const stores = new WeakMap<CrmDataClient, Continuations>();
function store(client: CrmDataClient): Continuations {
  let value = stores.get(client);
  if (!value) { value = new Continuations(); stores.set(client, value); }
  return value;
}
export function clearQueryContinuations(client: CrmDataClient): void { stores.get(client)?.clear(); }
export function resumeQuery(client: CrmDataClient, token: string, kind: string, scope?: string): QueryState {
  if (typeof token !== 'string') throw queryError('continuation must be a token string.');
  return store(client).acquire(token, kind, scope);
}

export async function collectQuery(client: CrmDataClient, state: QueryState, options: QueryOptions,
  advance: (state: QueryState, endpoint: string, page: QueryPage) => void) {
  const normalized = queryOptions(options);
  const values: unknown[] = [];
  let pagesFetched = 0;
  const pageBudget = normalized.fetch_all ? normalized.max_pages : state.buffer.length ? 0 : 1;
  try {
    while (values.length < normalized.max_records) {
      if (state.buffer.length) {
        const count = Math.min(state.buffer.length, normalized.max_records - values.length);
        values.push(...state.buffer.slice(0, count));
        state.buffer = state.buffer.slice(count);
      }
      if (values.length >= normalized.max_records || !state.nextRequest || pagesFetched >= pageBudget) break;
      const endpoint = state.nextRequest;
      const requestKey = client.validateEndpoint?.(endpoint) || endpoint;
      if (state.seen.includes(requestKey)) throw queryError('Server repeated a continuation URL.', 'D365_QUERY_RESPONSE_INVALID');
      const page = await client.makeRequest<QueryPage>(endpoint, 'GET', undefined, {headers:state.headers});
      if (!page || !Array.isArray(page.value) || page.value.length > 5000) throw queryError('Query did not return a valid record page.', 'D365_QUERY_RESPONSE_INVALID');
      state.seen.push(requestKey);
      if (state.seen.length > 1000) state.seen.shift();
      state.buffer = page.value;
      if (!Object.keys(state.envelope).length) {
        state.envelope = Object.fromEntries(Object.entries(page).filter(([key]) =>
          key !== 'value' && key !== '@odata.nextLink' && !key.startsWith('@Microsoft.Dynamics.CRM.fetchxml') && key !== '@Microsoft.Dynamics.CRM.morerecords'));
      }
      advance(state, endpoint, page);
      pagesFetched++;
    }
    const hasMore = Boolean(state.buffer.length || state.nextRequest || state.blockedMore);
    const stoppedBecause = !hasMore ? (state.query.top ? 'query_top_or_complete' : 'complete') :
      values.length >= normalized.max_records ? 'max_records' :
      state.blockedMore && !state.buffer.length ? state.blockedMore :
      normalized.fetch_all ? 'max_pages' : 'single_page';
    // Removing the input token only after success lets callers retry a failed read safely.
    if (options.continuation) store(client).remove(options.continuation);
    const continuation = state.buffer.length || state.nextRequest ? store(client).save(state) : null;
    return {
      ...state.envelope, value:values,
      ...(state.kind === 'odata' && !state.buffer.length && state.nextRequest ? {'@odata.nextLink':state.nextRequest} : {}),
      query:state.query,
      paging:{returned:values.length, pagesFetched, hasMore, complete:!hasMore, truncated:hasMore,
        continuation, stoppedBecause, scope:'root_records', snapshot:false},
    };
  } catch (error) {
    if (options.continuation) store(client).release(options.continuation);
    throw error;
  }
}
