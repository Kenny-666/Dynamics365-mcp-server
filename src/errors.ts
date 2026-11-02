import { ConfigurationError } from './config.js';

export interface CrmErrorDetails {
  status?: number;
  platformCode?: string;
  requestId?: string;
  retryAfterMs?: number;
  attempts?: number;
  retryable?: boolean;
  outcome?: 'not_sent' | 'rejected' | 'unknown';
}

export class CrmRequestError extends Error {
  constructor(readonly code: string, message: string, readonly details: CrmErrorDetails = {}) {
    super(message);
    this.name = 'CrmRequestError';
  }

  toJSON() {
    return { error:this.message, code:this.code, ...this.details };
  }
}

/** Static guidance only: never interpolate platform messages, request bodies or credentials. */
function guidance(error: CrmRequestError): string[] | undefined {
  const {code,details} = error;
  if (details.outcome === 'unknown' || /READBACK_(?:FAILED|MISMATCH)|ROLLBACK_UNKNOWN/.test(code))
    return ['The operation may have reached CRM. Inspect the target and any journal entry before deciding what to do; do not automatically retry.'];
  if (/CONFLICT|ETAG_REQUIRED|CONCURRENCY/.test(code) || details.status === 412)
    return ['Read the latest target state and generate a new preview. Preserve the specific ETag; do not bypass a concurrency conflict.'];
  if (/PREVIEW_REQUIRED/.test(code))
    return ['Run the tool in preview mode, review its scope, and use the returned current hash for execution.'];
  if (details.status === 401)
    return ['Check the selected environment and authentication configuration; renew credentials through the configured authentication method.'];
  if (details.status === 403)
    return ['Check the CRM identity, security roles, privileges and access to the requested component.'];
  if (/METADATA|CSDL|NATIVE_CONTRACT/.test(code))
    return ['Check the selected CRM API version, metadata availability and current identity permissions. A partial metadata response cannot establish full support.'];
  return undefined;
}

/** Never serialize Axios errors: their config contains Authorization and request data. */
export function toolErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof CrmRequestError) {
    const payload = error.toJSON(), advice = guidance(error);
    return advice ? {...payload, guidance:advice} : payload;
  }
  if (error instanceof ConfigurationError) return {error:error.message, code:error.code};
  return {error:error instanceof Error ? error.message : 'Unknown error occurred'};
}

export function redactSecrets(text: string, secrets: (string | undefined)[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join('[REDACTED]');
  }
  return result
    .replace(/\bBearer\s+[^\s,"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:client_secret|access_token|refresh_token|password)["']?\s*[:=]\s*["']?)[^\s,"'&<>]+/gi, '$1[REDACTED]');
}
