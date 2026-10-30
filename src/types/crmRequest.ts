export type CrmHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CrmRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface CrmResponse<T = unknown> {
  data: T | null;
  status: number;
  /** Selected response headers, with lowercase names; excludes cookies and credentials. */
  headers: Record<string, string>;
}

export interface CrmDataClient {
  /** Validate a continuation without sending a request, when the transport exposes this check. */
  validateEndpoint?(endpoint: string): string;
  // The default preserves the existing services' data-only contract.
  makeRequest<T = any>(endpoint: string, method?: CrmHttpMethod, data?: unknown,
    options?: CrmRequestOptions): Promise<T | null>;
}

export interface CrmRequestClient extends CrmDataClient {
  requestWithResponse<T = unknown>(endpoint: string, method?: CrmHttpMethod, data?: unknown,
    options?: CrmRequestOptions): Promise<CrmResponse<T>>;
}
