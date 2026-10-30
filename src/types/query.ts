export interface QueryOptions {
  state_mode?: 'legacy' | 'all' | 'values';
  state_values?: number[];
  page_size?: number;
  max_records?: number;
  max_pages?: number;
  fetch_all?: boolean;
  formatted_values?: boolean;
  continuation?: string;
}

export interface ODataQueryOptions extends QueryOptions {
  orderby?: string;
  expand?: string;
}

export interface EffectiveQuery {
  kind: 'odata' | 'fetchxml';
  state: {mode:string; disposition:string; values?:number[]};
  filter?: string;
  fetchXml?: string;
  orderby?: string;
  top?: number;
  warnings: string[];
}

export interface QueryState {
  kind: 'odata' | 'fetchxml';
  scope: string;
  nextRequest?: string;
  headers: Record<string, string>;
  buffer: unknown[];
  envelope: Record<string, unknown>;
  query: EffectiveQuery;
  seen: string[];
  blockedMore?: string;
  fetch?: {pageSize:number; ordered:boolean; top:boolean; xml:string};
}

export interface QueryPage extends Record<string, unknown> {value:unknown[];}
