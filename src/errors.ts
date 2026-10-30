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

/** Never serialize Axios errors: their config contains Authorization and request data. */
export function toolErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof CrmRequestError) return error.toJSON();
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
