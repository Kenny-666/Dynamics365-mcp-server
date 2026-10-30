import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { CrmRequestError } from '../errors.js';
import type { CrmRequestClient } from '../types/crmRequest.js';

const MAX_BYTES = 10 * 1024 * 1024;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = 'webresourceid,name,displayname,description,webresourcetype,ismanaged,modifiedon';
type Input = Record<string, unknown>;
type Resource = Record<string, unknown>;
const aliases: Record<string, string> = {
  nameKeyword:'name_keyword', includeContent:'include_content', includeUnpublished:'include_unpublished', filePath:'file_path',
  displayName:'display_name', webResourceType:'web_resource_type', contentEncoding:'content_encoding',
  solutionUniqueName:'solution_unique_name', ifMatch:'if_match', dryRun:'dry_run',
};

function invalid(message: string): never {
  throw new CrmRequestError('D365_WEBRESOURCE_INVALID', message, {outcome:'not_sent'});
}

function input(value: unknown, allowed: string[]): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Arguments must be an object.');
  const result: Input = {};
  for (const [key, val] of Object.entries(value)) {
    const canonical = aliases[key] || key;
    if (!allowed.includes(canonical)) invalid('Unknown argument: ' + key);
    if (val === undefined) continue;
    if (Object.hasOwn(result, canonical) && result[canonical] !== val) invalid('Conflicting aliases for ' + canonical + '.');
    result[canonical] = val;
  }
  return result;
}

function string(value: unknown, name: string, nonempty = true): string {
  if (typeof value !== 'string' || (nonempty && !value.trim())) invalid(name + ' must be ' + (nonempty ? 'a non-empty string.' : 'a string.'));
  return value;
}

function flag(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') invalid(name + ' must be a boolean.');
  return value;
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !GUID.test(value)) invalid('id must be a GUID.');
  return value.toLowerCase();
}

function etag(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(?:W\/)?"[\x21\x23-\x7e]+"$/.test(value)) invalid('if_match must be a specific quoted ETag, such as W/"123".');
  return value;
}

function query(params: Record<string, string>): string { return new URLSearchParams(params).toString(); }
function literal(value: string): string { return "'" + value.replace(/'/g, "''") + "'"; }
function digest(bytes: Buffer) { return {bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')}; }

/** Preserve confirmed save evidence when a later phase fails. Never suggest replaying the save. */
class WebResourcePhaseError extends CrmRequestError {
  constructor(code: string, message: string, readonly operation: string, readonly data: Resource,
    details: CrmRequestError['details'] = {}) {
    super(code, message, details);
  }
  override toJSON() { return {...super.toJSON(), operation:this.operation, data:this.data}; }
}

/** Native Web Resource table operations and scoped PublishXml, shared by all auth modes. */
export class WebResourceService {
  constructor(private readonly client: CrmRequestClient,
    private readonly environment: {orgUrl:string; authType:string; apiVersion:string}) {}

  private wrap(operation: string, data: unknown) {
    return {operation, version:this.environment.apiVersion, fromCache:false, data};
  }

  async search(raw: unknown) {
    const args = input(raw, ['name_keyword', 'top', 'include_content', 'include_unpublished']);
    const keyword = string(args.name_keyword, 'name_keyword').trim();
    const top = args.top ?? 50;
    if (!Number.isInteger(top) || (top as number) < 1 || (top as number) > 100) invalid('top must be an integer from 1 to 100.');
    const content = flag(args.include_content, 'include_content', false);
    const unpublished = flag(args.include_unpublished, 'include_unpublished', false);
    const endpoint = '/webresourceset' + (unpublished ? '/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()' : '');
    const result = await this.client.makeRequest(endpoint + '?' + query({
      '$select':SELECT + (content ? ',content' : ''), '$filter':'contains(name,' + literal(keyword) + ')',
      '$orderby':'name asc,webresourceid asc', '$top':String(top),
    }));
    if (!result || !Array.isArray(result.value)) this.badResponse('Web Resource search did not return a record array.');
    // Keep the legacy OData envelope. Explicitly exclude content unless requested.
    const value = result.value.map((row: Resource) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) this.badResponse('Invalid Web Resource search record.');
      const record = {...row};
      if (!content) delete record.content;
      return record;
    });
    return this.wrap('searchWebResources', {...result, value});
  }

  async create(raw: unknown) {
    const args = input(raw, ['name', 'display_name', 'web_resource_type', 'file_path', 'content',
      'content_encoding', 'description', 'publish', 'dry_run', 'solution_unique_name']);
    const name = string(args.name, 'name').trim();
    const displayname = string(args.display_name, 'display_name').trim();
    if (!Number.isInteger(args.web_resource_type) || (args.web_resource_type as number) < 1 || (args.web_resource_type as number) > 12) {
      invalid('web_resource_type must be an integer from 1 to 12; the target platform validates type availability.');
    }
    const publish = flag(args.publish, 'publish', true);
    const dryRun = flag(args.dry_run, 'dry_run', false);
    const solution = args.solution_unique_name === undefined ? undefined : string(args.solution_unique_name, 'solution_unique_name');
    if (solution !== undefined && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(solution)) invalid('solution_unique_name must be a solution unique name.');
    const payload: Resource = {name, displayname, webresourcetype:args.web_resource_type};
    if (args.description !== undefined) payload.description = string(args.description, 'description', false);
    const bytes = await this.content(args);
    // Include saved/unpublished resources in duplicate detection. No silent downgrade on unsupported versions.
    const existing = await this.client.makeRequest('/webresourceset/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?' + query({
      '$select':'webresourceid,name', '$filter':'name eq ' + literal(name), '$top':'1',
    }));
    if (!existing || !Array.isArray(existing.value)) this.badResponse('Duplicate check did not return a record array.');
    if (existing.value.length || existing['@odata.nextLink']) {
      throw new CrmRequestError('D365_WEBRESOURCE_NAME_EXISTS', 'A saved Web Resource already has that name. Create will not overwrite it.', {outcome:'not_sent'});
    }
    const operation = 'createWebResourceAndPublish';
    if (dryRun) return this.wrap(operation, {
      dryRun:true, saved:false, published:false, environment:this.environment, target:{name},
      changes:{...payload, content:{before:null, after:digest(bytes)}}, publish, solutionUniqueName:solution,
      note:'Preview only. Duplicate checks are not a uniqueness lock; platform validation and privileges are evaluated on save.',
    });
    const response = await this.client.requestWithResponse<Resource>('/webresourceset?$select=webresourceid', 'POST',
      {...payload, content:bytes.toString('base64')}, {headers:{Prefer:'return=representation',
        ...(solution ? {'MSCRM.SolutionUniqueName':solution} : {})}});
    let createdId: string | undefined;
    if (typeof response.data?.webresourceid === 'string' && GUID.test(response.data.webresourceid)) createdId = response.data.webresourceid.toLowerCase();
    if (!createdId) {
      const header = response.headers['odata-entityid'];
      if (header) {
        // An invalid response ID must not erase evidence that POST already succeeded.
        let validEndpoint = true;
        try { this.client.validateEndpoint?.(header); } catch { validEndpoint = false; }
        const match = /\/webresourceset\(([0-9a-f-]{36})\)$/i.exec(header);
        if (validEndpoint && match && GUID.test(match[1])) createdId = match[1].toLowerCase();
      }
    }
    if (!createdId) throw new WebResourcePhaseError('D365_WEBRESOURCE_CREATE_ID_MISSING',
      'Save succeeded but no valid created ID was returned. Find the saved resource by name before publishing; do not recreate it.',
      operation, {success:false, saved:true, webresourceid:null, name, published:false, publication:{status:'not_attempted'}}, {outcome:'unknown'});
    return this.finish(operation, createdId, publish, {name});
  }

  async update(raw: unknown) {
    const args = input(raw, ['id', 'file_path', 'content', 'content_encoding', 'display_name', 'description', 'publish', 'dry_run', 'if_match']);
    const resourceId = id(args.id);
    const match = etag(args.if_match);
    const publish = flag(args.publish, 'publish', true);
    const dryRun = flag(args.dry_run, 'dry_run', false);
    const payload: Resource = {};
    if (args.display_name !== undefined) payload.displayname = string(args.display_name, 'display_name');
    if (args.description !== undefined) payload.description = string(args.description, 'description', false);
    const bytes = await this.content(args);
    const operation = 'updateWebResourceAndPublish';
    if (dryRun) {
      const before = await this.client.makeRequest('/webresourceset(' + resourceId + ')/Microsoft.Dynamics.CRM.RetrieveUnpublished()?$select=' + SELECT + ',content');
      if (!before || typeof before.webresourceid !== 'string' || before.webresourceid.toLowerCase() !== resourceId || typeof before.content !== 'string') {
        this.badResponse('Unpublished Web Resource read did not return the expected resource and content.');
      }
      const changes: Resource = {content:{before:digest(this.base64(before.content)), after:digest(bytes)}};
      for (const [field, value] of Object.entries(payload)) changes[field] = {before:before[field] ?? null, after:value};
      return this.wrap(operation, {dryRun:true, saved:false, published:false, environment:this.environment,
        target:{webresourceid:resourceId, name:before.name}, etag:before['@odata.etag'] ?? null,
        ifMatch:match ?? null, changes, publish,
        note:'Preview reads the latest saved definition. It does not lock the resource or validate write privileges. Pass the returned ETag as if_match when saving.',
      });
    }
    await this.client.requestWithResponse('/webresourceset(' + resourceId + ')', 'PATCH',
      {...payload, content:bytes.toString('base64')}, {headers:{'If-Match':match ?? '*'}});
    return this.finish(operation, resourceId, publish);
  }

  async publish(raw: unknown) {
    const args = input(raw, ['id', 'dry_run']);
    const resourceId = id(args.id);
    if (flag(args.dry_run, 'dry_run', false)) return this.wrap('publishWebResource', {
      dryRun:true, environment:this.environment, target:{webresourceid:resourceId},
      published:false, scope:'single_web_resource',
    });
    // Publish-only recovery must never save or replay content.
    return this.finish('publishWebResource', resourceId, true, {}, false);
  }

  private async finish(operation: string, resourceId: string, publish: boolean, extra: Resource = {}, saved = true) {
    const data: Resource = {success:true, webresourceid:resourceId, ...extra, saved, published:false,
      publication:{status:'not_requested'}};
    if (publish) {
      try {
        await this.client.requestWithResponse('/PublishXml', 'POST', {
          ParameterXml:'<importexportxml><webresources><webresource>{' + resourceId + '}</webresource></webresources></importexportxml>',
        });
        data.published = true;
        data.publication = {status:'succeeded'};
      } catch (error) {
        const details = error instanceof CrmRequestError ? error.details : {outcome:'unknown' as const};
        // Do not echo platform text: it can contain source snippets supplied by the caller.
        throw new WebResourcePhaseError('D365_WEBRESOURCE_PUBLISH_FAILED',
          saved ? 'Save succeeded; publication failed or its outcome is unknown. Retry publish_web_resource with this ID, without saving again.'
            : 'Publication failed or its outcome is unknown. Check the resource before retrying publication.',
          operation, {...data, success:false, published:details.outcome === 'unknown' ? null : false,
            publication:{status:details.outcome === 'unknown' ? 'unknown' : 'failed',
              code:error instanceof CrmRequestError ? error.code : 'D365_REQUEST_FAILED'}}, details);
      }
    }
    return this.wrap(operation, data);
  }

  private base64(value: string): Buffer {
    if (value.length > Math.ceil(MAX_BYTES / 3) * 4 ||
        value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) invalid('content must be canonical Base64 within the 10 MiB limit.');
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length > MAX_BYTES || bytes.toString('base64') !== value) invalid('content must be canonical Base64 within the 10 MiB limit.');
    return bytes;
  }

  private async content(args: Input): Promise<Buffer> {
    if ((args.file_path !== undefined) === (args.content !== undefined)) invalid('Provide exactly one of file_path or content.');
    if (args.file_path !== undefined) {
      if (args.content_encoding !== undefined) invalid('content_encoding applies only to inline content.');
      const path = string(args.file_path, 'file_path');
      if (!isAbsolute(path)) invalid('file_path must be an absolute path on the MCP server machine.');
      try {
        const file = await open(path, 'r');
        try {
          const info = await file.stat();
          if (!info.isFile() || info.size > MAX_BYTES) invalid('file_path must identify a regular file of at most 10 MiB.');
          const chunks: Buffer[] = [];
          let total = 0;
          while (total <= MAX_BYTES) {
            const buffer = Buffer.alloc(Math.min(65536, MAX_BYTES + 1 - total));
            const {bytesRead} = await file.read(buffer);
            if (!bytesRead) break;
            total += bytesRead;
            chunks.push(buffer.subarray(0, bytesRead));
          }
          if (total > MAX_BYTES) invalid('File exceeds the 10 MiB content limit.');
          return Buffer.concat(chunks);
        } finally { await file.close(); }
      } catch (error) {
        if (error instanceof CrmRequestError) throw error;
        invalid('Cannot read file_path. Verify that the file exists and is readable on the MCP server machine.');
      }
    }
    const value = string(args.content, 'content', false);
    const encoding = args.content_encoding ?? 'utf8';
    if (encoding === 'base64') return this.base64(value);
    if (encoding !== 'utf8') invalid('content_encoding must be utf8 or base64.');
    if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) invalid('content exceeds the 10 MiB limit.');
    return Buffer.from(value, 'utf8');
  }

  private badResponse(message: string): never {
    throw new CrmRequestError('D365_RESPONSE_INVALID', message);
  }
}
