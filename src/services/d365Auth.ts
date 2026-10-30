import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { createHash } from 'node:crypto';
import { NtlmClient } from 'axios-ntlm';
import { validateConfig } from '../config.js';
import { CrmRequestError, redactSecrets } from '../errors.js';
import type { D365Config } from '../types/index.js';
import type { CrmHttpMethod, CrmRequestClient, CrmRequestOptions, CrmResponse } from '../types/crmRequest.js';
import { CacheService } from './cache.js';
import { abortedError, retryAfterMilliseconds, sleep, waitFor } from './requestPolicy.js';

interface TokenResponse { access_token?: string; expires_in?: number | string; }
interface TokenEntry { token: string; expiresAt: number; }
interface RuntimeDependencies {
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const responseHeaderNames = new Set([
  'etag', 'odata-entityid', 'location', 'content-type', 'retry-after',
  'x-ms-service-request-id', 'x-ms-correlation-request-id', 'req_id', 'activityid',
]);

function selectedHeaders(headers: AxiosResponse['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (responseHeaderNames.has(name.toLowerCase()) && value !== undefined && value !== null) {
      result[name.toLowerCase()] = String(value);
    }
  }
  return result;
}

export class D365AuthService implements CrmRequestClient {
  private readonly config: D365Config;
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl: URL;
  private readonly tokenUrl: string;
  private readonly cache: CacheService;
  private readonly tokenCacheKey: string;
  private tokenRequest?: Promise<string>;
  private readonly now: () => number;
  private readonly delay: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(config: D365Config, runtime: RuntimeDependencies = {}) {
    validateConfig(config);
    this.config = {...config, ad:config.ad && {...config.ad}, ifd:config.ifd && {...config.ifd}};
    this.cache = CacheService.getInstance(config.cacheTtl);
    this.now = runtime.now || Date.now;
    this.delay = runtime.sleep || sleep;
    const orgUrl = (config.orgUrl || config.environmentUrl).replace(/\/+$/, '');
    this.baseUrl = new URL(orgUrl + '/api/data/' + (config.apiVersion || 'v9.2') + '/');
    const options = {
      baseURL:this.baseUrl.href,
      timeout:config.requestTimeoutMs ?? 30000,
      maxRedirects:0,
      headers:{'Content-Type':'application/json', 'OData-Version':'4.0', 'OData-MaxVersion':'4.0'},
    };
    if (config.authType === 'op_ad') {
      this.axiosInstance = NtlmClient({
        username:config.ad!.username!, password:config.ad!.password!, domain:config.ad!.domain!,
        workstation:config.ad!.workstation || '',
      }, options);
      this.tokenUrl = '';
    } else {
      this.axiosInstance = axios.create(options);
      if (config.authType === 'op_ifd') {
        this.tokenUrl = config.ifd!.adfsUrl!.replace(/\/+$/, '') + (config.ifd!.tokenPath || '/adfs/oauth2/token');
      } else {
        const tenant = config.tenantId.trim().replace(/^["']|["']$/g, '');
        const authority = tenant.includes('://') ? tenant.replace(/\/+$/, '') : 'https://login.microsoftonline.com/' + tenant;
        this.tokenUrl = authority + '/oauth2/v2.0/token';
      }
    }
    // A credential change creates a new namespace without exposing credentials in the key.
    const identity = [this.baseUrl.href, config.authType || 'online', this.tokenUrl,
      config.tenantId, config.clientId, config.clientSecret,
      config.ifd?.clientId, config.ifd?.clientSecret, config.ifd?.username, config.ifd?.password,
      config.ifd?.resource || orgUrl, config.ifd?.grantType || 'password'];
    this.tokenCacheKey = 'd365_token_' + createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }

  async getAccessToken(): Promise<string> {
    if (this.config.authType === 'op_ad') return '';
    const cached = this.cache.get<TokenEntry>(this.tokenCacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.token;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.fetchToken();
    try { return await this.tokenRequest; }
    finally { this.tokenRequest = undefined; }
  }

  private async fetchToken(): Promise<string> {
    const params = new URLSearchParams();
    if (this.config.authType === 'op_ifd') {
      const ifd = this.config.ifd!;
      params.set('grant_type', ifd.grantType || 'password');
      params.set('client_id', ifd.clientId!);
      if (ifd.clientSecret) params.set('client_secret', ifd.clientSecret);
      params.set('username', ifd.username!);
      params.set('password', ifd.password!);
      params.set('resource', ifd.resource || (this.config.orgUrl || this.config.environmentUrl).replace(/\/+$/, ''));
    } else {
      params.set('grant_type', 'client_credentials');
      params.set('client_id', this.config.clientId);
      params.set('client_secret', this.config.clientSecret);
      params.set('scope', (this.config.orgUrl || this.config.environmentUrl).replace(/\/+$/, '') + '/.default');
    }
    try {
      const response = await axios.post<TokenResponse>(this.tokenUrl, params, {
        timeout:this.config.requestTimeoutMs ?? 30000,
        maxRedirects:0,
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
      });
      const {access_token:token, expires_in:rawExpiry} = response.data;
      const expiresIn = rawExpiry === undefined ? 3600 : Number(rawExpiry);
      if (!token || typeof token !== 'string' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new CrmRequestError('D365_AUTH_FAILED', 'Identity provider returned an invalid token or lifetime.', {outcome:'not_sent'});
      }
      const lifetime = (expiresIn - Math.min(60, expiresIn / 10)) * 1000;
      this.cache.set<TokenEntry>(this.tokenCacheKey, {token, expiresAt:this.now() + lifetime}, Math.max(1, Math.ceil(lifetime / 1000)));
      return token;
    } catch (error) {
      if (error instanceof CrmRequestError) throw error;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const description = axios.isAxiosError(error) ? error.response?.data?.error_description : undefined;
      const message = typeof description === 'string' ? this.redact(description) : 'Unable to obtain an access token. Check identity settings and connectivity.';
      throw new CrmRequestError('D365_AUTH_FAILED', 'Authentication failed: ' + message, {status, outcome:'not_sent', retryable:false});
    }
  }

  async makeRequest<T = any>(endpoint: string, method: CrmHttpMethod = 'GET', data?: unknown,
    options: CrmRequestOptions = {}): Promise<T | null> {
    return (await this.requestWithResponse<T>(endpoint, method, data, options)).data;
  }

  async requestWithResponse<T = unknown>(endpoint: string, method: CrmHttpMethod = 'GET', data?: unknown,
    options: CrmRequestOptions = {}): Promise<CrmResponse<T>> {
    const url = this.validateEndpoint(endpoint);
    let retries = 0;
    let refreshed = false;
    let attempts = 0;
    for (;;) {
      if (options.signal?.aborted) throw abortedError();
      const token = await waitFor(this.getAccessToken(), options.signal);
      if (options.signal?.aborted) throw abortedError();
      attempts++;
      try {
        const headers = Object.fromEntries(Object.entries(options.headers || {}).filter(([name]) =>
          !['authorization', 'proxy-authorization', 'cookie', 'host'].includes(name.toLowerCase())));
        const response = await this.axiosInstance.request<T>({
          url, method, data, signal:options.signal,
          headers:{...headers, ...(token ? {Authorization:'Bearer ' + token} : {})},
        });
        return {
          data:response.status === 204 || response.data === undefined || response.data === '' ? null : response.data,
          status:response.status,
          headers:selectedHeaders(response.headers),
        };
      } catch (error) {
        const normalized = this.normalizeError(error, method, token, attempts);
        if (normalized.details.status === 401 && token && method === 'GET' && !refreshed) {
          const cached = this.cache.get<TokenEntry>(this.tokenCacheKey);
          if (cached?.token === token) this.cache.del(this.tokenCacheKey);
          refreshed = true;
          continue;
        }
        if (method === 'GET' && normalized.details.retryable &&
            retries < (this.config.maxReadRetries ?? 2)) {
          const delay = normalized.details.retryAfterMs ?? 250 * 2 ** retries;
          // Never shorten a long server Retry-After into an early retry.
          if (delay <= (this.config.maxRetryDelayMs ?? 30000)) {
            retries++;
            await this.delay(delay, options.signal);
            continue;
          }
        }
        throw normalized;
      }
    }
  }

  validateEndpoint(endpoint: string): string {
    try {
      if (!endpoint || endpoint.startsWith('//') || endpoint.includes('\\')) throw new Error('Invalid endpoint');
      const absolute = /^[a-z][a-z\d+.-]*:/i.test(endpoint);
      const url = new URL(absolute ? endpoint : endpoint.replace(/^\//, ''), this.baseUrl);
      if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith(this.baseUrl.pathname) ||
          url.username || url.password || url.hash) throw new Error('Endpoint outside organization');
      if (url.pathname.split('/').some(segment => {
        const decoded = decodeURIComponent(segment);
        return decoded.includes('/') || decoded.includes('\\') || decoded === '.' || decoded === '..';
      })) throw new Error('Encoded path traversal');
      return url.href;
    } catch {
      throw new CrmRequestError('D365_ENDPOINT_INVALID', 'Request endpoint must remain within the configured organization Web API.', {outcome:'not_sent', retryable:false});
    }
  }

  private normalizeError(error: unknown, method: CrmHttpMethod, token: string, attempts: number): CrmRequestError {
    const isAxios = axios.isAxiosError(error);
    const status = isAxios ? error.response?.status : undefined;
    const headers = isAxios && error.response ? selectedHeaders(error.response.headers) : {};
    const retryAfterMs = retryAfterMilliseconds(headers['retry-after'], this.now());
    const platform = isAxios ? error.response?.data?.error : undefined;
    const requestId = headers['x-ms-service-request-id'] || headers.req_id || headers.activityid || headers['x-ms-correlation-request-id'];
    const timeout = isAxios && ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code || '');
    const cancelled = axios.isCancel(error) || (isAxios && error.code === 'ERR_CANCELED');
    const transientNetwork = isAxios && !status && ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ERR_NETWORK'].includes(error.code || '');
    const retryable = method === 'GET' && !cancelled && (status === 429 || (status !== undefined && status >= 500 && status <= 599) || transientNetwork);
    const outcome = method !== 'GET' && (!status || status >= 500) ? 'unknown' : 'rejected';
    const code = cancelled ? 'D365_REQUEST_ABORTED' : timeout ? 'D365_REQUEST_TIMEOUT' :
      status === 429 ? 'D365_RATE_LIMITED' : status === 412 ? 'D365_CONCURRENCY_CONFLICT' :
      status ? 'D365_HTTP_ERROR' : 'D365_NETWORK_ERROR';
    let message = cancelled ? 'Dynamics 365 request was cancelled.' : timeout ? 'Dynamics 365 request timed out.' :
      status ? 'Dynamics 365 returned HTTP ' + status + '.' : 'Unable to reach Dynamics 365.';
    if (typeof platform?.message === 'string') message += ' ' + this.redact(platform.message, token);
    if (outcome === 'unknown') message += ' Request outcome is unknown; verify the target record before retrying.';
    return new CrmRequestError(code, message, {
      status, requestId:requestId && this.redact(requestId, token),
      platformCode:typeof platform?.code === 'string' ? this.redact(platform.code, token) : undefined,
      retryAfterMs, attempts, retryable, outcome,
    });
  }

  private redact(message: string, token?: string): string {
    return redactSecrets(message, [this.config.clientSecret, this.config.ad?.password,
      this.config.ifd?.password, this.config.ifd?.clientSecret, token]).slice(0, 2048);
  }

  getAxiosInstance(): AxiosInstance { return this.axiosInstance; }
}

