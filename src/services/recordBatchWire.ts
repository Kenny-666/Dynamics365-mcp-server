import { randomUUID } from 'node:crypto';
import type { MutationPlan, NativeBatchPart, Row } from '../types/recordMutation.js';
import { MAX_BODY_BYTES, RecordMutationError } from './recordMutationInput.js';

export function wireError():never {
  throw new RecordMutationError('D365_BATCH_RESPONSE_INVALID','Native batch response was malformed, incomplete or ambiguously correlated.',{}, {outcome:'unknown'});
}
export function buildBatch(requests:{plan:MutationPlan;contentId:string}[],transaction:boolean,
  absolute:(endpoint:string)=>string):{body:string;contentType:string} {
  const boundary = 'batch_' + randomUUID().replace(/-/g,'');
  const groups = transaction ? [requests] : requests.map(item => [item]);
  const lines:string[] = [];
  for (const group of groups) {
    const change = 'changeset_' + randomUUID().replace(/-/g,'');
    lines.push('--' + boundary,'Content-Type: multipart/mixed; boundary=' + change,'');
    for (const {plan,contentId} of group) {
      const url = absolute(plan.endpoint);
      if (/[\r\n\s]/.test(url) || !/^https?:\/\//.test(url) || !/^\d+$/.test(contentId)) wireError();
      lines.push('--' + change,'Content-Type: application/http','Content-Transfer-Encoding: binary','Content-ID: ' + contentId,'',
        plan.method + ' ' + url + ' HTTP/1.1','Accept: application/json','OData-Version: 4.0','OData-MaxVersion: 4.0');
      for (const [key,value] of Object.entries(plan.headers)) {
        if (!/^[a-zA-Z-]+$/.test(key) || /[\r\n]/.test(value)) wireError();
        lines.push(key + ': ' + value);
      }
      if (plan.body !== undefined) lines.push('Content-Type: application/json; charset=utf-8');
      lines.push('',plan.body === undefined ? '' : JSON.stringify(plan.body));
    }
    lines.push('--' + change + '--');
  }
  lines.push('--' + boundary + '--','');
  const body = lines.join('\r\n');
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new RecordMutationError('D365_BATCH_TOO_LARGE','Batch wire body exceeds 10 MiB. Use smaller chunks.');
  return {body,contentType:'multipart/mixed; boundary=' + boundary};
}

function headers(text:string):Record<string,string> {
  const result:Record<string,string> = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    const match = /^([a-zA-Z0-9-]+):[ \t]*(.*)$/.exec(line);
    if (!match || Object.hasOwn(result,match[1].toLowerCase())) wireError();
    result[match[1].toLowerCase()] = match[2];
  }
  return result;
}
function splitHeaders(text:string):{headers:Record<string,string>;body:string} {
  if (text.startsWith('\n')) return {headers:{},body:text.slice(1)};
  const at = text.indexOf('\n\n');
  if (at < 0) wireError();
  return {headers:headers(text.slice(0,at)),body:text.slice(at + 2)};
}

export function parseBatch(body:unknown,contentType:string):NativeBatchPart[] {
  if (typeof body !== 'string' || Buffer.byteLength(body) > 20 * 1024 * 1024) wireError();
  const output:NativeBatchPart[] = [];
  const parse = (text:string,type:string,depth:number) => {
    if (depth > 1 || !/^multipart\/mixed(?:\s*;|$)/i.test(type)) wireError();
    const boundary = /(?:^|;)\s*boundary=(?:"([a-zA-Z0-9_-]{1,70})"|([a-zA-Z0-9_-]{1,70}))(?:\s*;|\s*$)/i.exec(type);
    if (!boundary) wireError();
    const token = boundary[1] || boundary[2];
    const markers = [...text.matchAll(new RegExp('^--' + token + '(--)?[ \\t]*(?:\\n|$)','gm'))];
    if (markers.length < 2 || markers[0][1] || !markers.at(-1)?.[1] || markers.slice(0,-1).some(marker => marker[1])) wireError();
    for (let index = 0; index < markers.length - 1; index++) {
      const start = markers[index].index! + markers[index][0].length;
      const part = splitHeaders(text.slice(start,markers[index + 1].index));
      const partType = part.headers['content-type'] || '';
      if (/^multipart\/mixed/i.test(partType)) { parse(part.body,partType,depth + 1); continue; }
      if (!/^application\/http(?:\s*;|$)/i.test(partType) || output.length >= 100) wireError();
      const line = /^HTTP\/1\.[01] ([1-5][0-9]{2})[^\n]*\n/.exec(part.body);
      if (!line) wireError();
      const response = splitHeaders(part.body.slice(line[0].length));
      const mimeId = part.headers['content-id'], httpId = response.headers['content-id'];
      if (mimeId && httpId && mimeId !== httpId) wireError();
      const contentId = mimeId || httpId;
      if (contentId !== undefined && !/^[1-9][0-9]*$/.test(contentId)) wireError();
      const status = Number(line[1]);
      if (![200,201,204].includes(status) && !(status >= 400 && status <= 599)) wireError();
      let data:Row | null = null;
      if (response.body.trim()) {
        try {
          const parsed:unknown = JSON.parse(response.body);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) wireError();
          data = parsed as Row;
        } catch { wireError(); }
      }
      if (status === 204 && data !== null) wireError();
      output.push({contentId,changeSet:depth === 1 ? token : undefined,response:{status,data,headers:response.headers}});
    }
  };
  parse(body.replace(/\r\n/g,'\n'),contentType,0);
  if (!output.length) wireError();
  return output;
}
