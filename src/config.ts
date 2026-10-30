import type { D365Config } from './types/index.js';

export class ConfigurationError extends Error {
  readonly code = 'D365_CONFIG_INVALID';

  constructor(readonly issues: string[]) {
    // Report setting names only: URLs and credentials can contain secrets.
    super(`Invalid Dynamics 365 configuration: ${issues.join('; ')}`);
    this.name = 'ConfigurationError';
  }
}

/** Read configuration without creating a connection or throwing on missing settings. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): D365Config {
  const cacheTtl = Number(env.CACHE_TTL || env.CACHE_TTL_SECONDS || '7200');
  return {
    tenantId: (env.TENANT_ID || '').trim().replace(/^["']|["']$/g, ''),
    clientId: (env.CLIENT_ID || '').trim(),
    clientSecret: env.CLIENT_SECRET || '',
    environmentUrl: (env.ENVIRONMENT_URL || '').trim(),
    orgUrl: (env.ORG_URL || env.ENVIRONMENT_URL || '').trim(),
    authType: (env.AUTH_TYPE?.trim() || 'online') as D365Config['authType'],
    apiVersion: env.API_VERSION?.trim() || 'v9.2',
    cacheTtl,
    cacheTtlSeconds: cacheTtl,
    requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS || '30000'),
    maxReadRetries: Number(env.MAX_READ_RETRIES || '2'),
    maxRetryDelayMs: Number(env.MAX_RETRY_DELAY_MS || '30000'),
    ad: {
      username: env.AD_USERNAME?.trim(),
      password: env.AD_PASSWORD,
      domain: env.AD_DOMAIN?.trim(),
      workstation: env.AD_WORKSTATION?.trim(),
    },
    ifd: {
      adfsUrl: env.IFD_ADFS_URL?.trim(),
      clientId: env.IFD_CLIENT_ID?.trim(),
      clientSecret: env.IFD_CLIENT_SECRET,
      username: env.IFD_USERNAME?.trim(),
      password: env.IFD_PASSWORD,
      resource: (env.IFD_RESOURCE || env.ORG_URL || env.ENVIRONMENT_URL)?.trim(),
      grantType: env.IFD_GRANT_TYPE || 'password',
      tokenPath: env.IFD_TOKEN_PATH || '/adfs/oauth2/token',
    },
  };
}

/** Validate before constructing auth/services, including partial AD/IFD settings. */
export function validateConfig(config: D365Config): void {
  const issues: string[] = [];
  const requireValue = (name: string, value?: string) => {
    if (!value?.trim()) issues.push(`${name} is required`);
  };
  const requireUrl = (name: string, value?: string) => {
    if (!value) {
      issues.push(`${name} is required`);
      return;
    }
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('Invalid endpoint');
      }
    } catch {
      issues.push(`${name} must be an HTTP(S) URL without credentials, query or fragment`);
    }
  };

  requireUrl('ORG_URL or ENVIRONMENT_URL', config.orgUrl || config.environmentUrl);
  if (!/^v[1-9]\d*\.\d+$/.test(config.apiVersion || 'v9.2')) {
    issues.push('API_VERSION must use a version such as v9.1 or v9.2');
  }
  if (!Number.isSafeInteger(config.cacheTtl) || config.cacheTtl < 0) {
    issues.push('CACHE_TTL (or CACHE_TTL_SECONDS) must be a non-negative integer');
  }

  for (const [name, value, min, max] of [
    ['REQUEST_TIMEOUT_MS', config.requestTimeoutMs ?? 30000, 1, 300000],
    ['MAX_READ_RETRIES', config.maxReadRetries ?? 2, 0, 5],
    ['MAX_RETRY_DELAY_MS', config.maxRetryDelayMs ?? 30000, 0, 300000],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      issues.push(`${name} must be an integer between ${min} and ${max}`);
    }
  }

  switch (config.authType || 'online') {
    case 'online':
      requireValue('TENANT_ID', config.tenantId);
      requireValue('CLIENT_ID', config.clientId);
      requireValue('CLIENT_SECRET', config.clientSecret);
      if (config.tenantId?.includes('://')) {
        requireUrl('TENANT_ID authority', config.tenantId);
      } else if (config.tenantId && !/^[\w.-]+$/.test(config.tenantId)) {
        issues.push('TENANT_ID must be a tenant ID, domain or authority URL');
      }
      // Requests and token scopes must resolve to the same organization.
      if (config.environmentUrl && config.orgUrl &&
          config.environmentUrl.replace(/\/+$/, '') !== config.orgUrl.replace(/\/+$/, '')) {
        issues.push('ORG_URL and ENVIRONMENT_URL must identify the same organization');
      }
      break;
    case 'op_ad':
      requireValue('AD_USERNAME', config.ad?.username);
      requireValue('AD_PASSWORD', config.ad?.password);
      requireValue('AD_DOMAIN', config.ad?.domain);
      break;
    case 'op_ifd':
      requireUrl('IFD_ADFS_URL', config.ifd?.adfsUrl);
      requireValue('IFD_CLIENT_ID', config.ifd?.clientId);
      requireValue('IFD_USERNAME', config.ifd?.username);
      requireValue('IFD_PASSWORD', config.ifd?.password);
      if (config.ifd?.resource) requireUrl('IFD_RESOURCE', config.ifd.resource);
      if (config.ifd?.grantType && config.ifd.grantType !== 'password') {
        issues.push('IFD_GRANT_TYPE currently supports password only');
      }
      if (config.ifd?.tokenPath && !/^\/(?!\/)[^?#\\]*$/.test(config.ifd.tokenPath)) {
        issues.push('IFD_TOKEN_PATH must be an absolute path without query or fragment');
      }
      break;
    default:
      issues.push('AUTH_TYPE must be online, op_ad or op_ifd');
  }

  if (issues.length) throw new ConfigurationError(issues);
}
