import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { CrmRequestError } from '../errors.js';

/** Do not reflect JSON parser snippets, tool names or malformed envelopes into error responses. */
export function parseDebugCall(source: string): {name:string;arguments:Record<string,unknown>} {
  const invalid = ():never => {throw new CrmRequestError('D365_DEBUG_INVALID_REQUEST','Expected a JSON object with a tool name and an arguments object.');};
  let value:unknown;
  try { value = JSON.parse(source); } catch { return invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const input = value as Record<string,unknown>;
  if (Object.keys(input).some(key => !['name','arguments'].includes(key)) || typeof input.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(input.name)) return invalid();
  if (input.arguments !== undefined && (!input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments))) return invalid();
  return {name:input.name,arguments:(input.arguments ?? {}) as Record<string,unknown>};
}

/** The debugger can read local source files and invoke writes, so only its own UI may call it. */
export function validateDebugRequest(req: Pick<IncomingMessage, 'headers' | 'method'>, port: number): number | undefined {
  const hosts = new Set(['localhost:' + port, '127.0.0.1:' + port]);
  const host = req.headers.host?.toLowerCase();
  if (!host || !hosts.has(host)) return 403;
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== 'http://' + host) return 403;
  if (req.headers['sec-fetch-site'] === 'cross-site') return 403;
  if (req.method === 'POST' && req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return 415;
  return undefined;
}

export function debugStaticPath(root: string, rawUrl: string): string | undefined {
  try {
    const pathname = decodeURIComponent(rawUrl.split('?')[0]);
    if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\x00-\x1f\x7f\\:]/.test(pathname)) return undefined;
    // Windows normalizes trailing dots/spaces and treats these names as devices even under a directory.
    if (pathname.split('/').some(part => part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return undefined;
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return undefined;
    return target;
  } catch { return undefined; }
}
