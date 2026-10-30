import { CrmRequestError } from '../errors.js';

/** Retry-After may contain seconds or an HTTP date. Invalid values do not override backoff. */
export function retryAfterMilliseconds(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const result = Number(trimmed) * 1000;
    return Number.isSafeInteger(result) ? result : undefined;
  }
  if (/^[\d.+-]+$/.test(trimmed)) return undefined;
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export function abortedError(): CrmRequestError {
  return new CrmRequestError('D365_REQUEST_ABORTED', 'Dynamics 365 request was cancelled.', {
    retryable:false, outcome:'not_sent',
  });
}

export function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    // The shared token fetch can outlive this cancelled caller.
    void promise.catch(() => {});
    return Promise.reject(abortedError());
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(abortedError()); };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, {once:true});
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortedError());
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(abortedError()); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, {once:true});
  });
}
