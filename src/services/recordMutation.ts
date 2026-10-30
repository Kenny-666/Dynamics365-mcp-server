import { CrmRequestError } from '../errors.js';
import type { CrmRequestClient, CrmResponse } from '../types/crmRequest.js';
import type { MutationEnvironment, MutationKind, MutationPlan, Row } from '../types/recordMutation.js';
import { RecordMetadata, metadataError, query } from './recordMetadata.js';
import { etag, GUID, guid, invalid, json, normalize, RecordMutationError, redact, safeDetails } from './recordMutationInput.js';

/** Prepares validated native requests; the same plans are executed singly or in native change sets. */
export class RecordMutationService {
  constructor(readonly client:CrmRequestClient, readonly environment:MutationEnvironment) {}

  async execute(operation:MutationKind, raw:unknown, signal?:AbortSignal):Promise<Row> {
    let plan:MutationPlan | undefined;
    let dispatched = false;
    try {
      const args = normalize(operation,raw);
      plan = await this.prepare(operation,args,new RecordMetadata(this.client,signal),signal);
      if (args.dry_run) return {success:true,dryRun:true,...plan.preview};
      if (plan.blockedBy) throw new RecordMutationError(plan.blockedBy,'The record write was blocked by preflight.', {preview:plan.preview});
      this.checkCancelled(signal);
      dispatched = true;
      const response = await this.client.requestWithResponse<Row>(plan.endpoint,plan.method,plan.body,{headers:plan.headers,signal});
      const result = this.success(plan,response);
      return plan.relationshipClearCheck ? await this.verifyRelationshipClear(plan,result,signal) : result;
    } catch (error) {
      if (error instanceof RecordMutationError) throw error;
      const details = safeDetails(error);
      const unknown = dispatched && (details.outcome === 'unknown' || details.outcome === undefined);
      throw new RecordMutationError(error instanceof CrmRequestError ? error.code : 'D365_RECORD_REQUEST_FAILED',
        'The native record operation failed. Request bodies and platform message text are withheld.',
        {operation,collectionName:plan?.collectionName,id:plan?.id ?? null,
          saved:unknown ? 'unknown' : false,deleted:operation === 'delete' ? unknown ? 'unknown' : false : undefined},
        {...details,outcome:unknown ? 'unknown' : details.outcome ?? 'not_sent'});
    }
  }

  async prepare(operation:MutationKind, args:Row, metadata:RecordMetadata, signal?:AbortSignal):Promise<MutationPlan> {
    this.checkCancelled(signal);
    const table = await metadata.table(args.collection_name);
    if (table.TableType !== undefined && table.TableType !== 'Standard') invalid('This record writer supports standard/legacy CE tables; the reported table type is unsupported.');
    const root = '/' + args.collection_name;
    const plan:MutationPlan = {operation,collectionName:args.collection_name,primaryId:table.PrimaryIdAttribute,
      id:args.id ?? null,method:operation === 'create' ? 'POST' : operation === 'delete' ? 'DELETE' : 'PATCH',
      endpoint:root,headers:{},concurrencyProtected:false,blockedBy:null,preview:{}};
    if (args.data) { this.validateReferences(args.data); plan.body = JSON.parse(json(args.data)); }
    let before:Row | null = null;
    if (operation === 'create') {
      if (plan.body![table.PrimaryIdAttribute] !== undefined) plan.id = guid(plan.body![table.PrimaryIdAttribute]);
      plan.headers.Prefer = 'return=representation';
      plan.endpoint += '?$select=' + table.PrimaryIdAttribute;
    } else if (operation === 'upsert') {
      const key = await metadata.alternate(table,args.alternate_key);
      for (const field of key.keyFields) if (Object.hasOwn(plan.body!,field)) {
        const supplied = args.alternate_key[field];
        if (supplied === undefined || String(supplied) !== String(plan.body![field])) invalid('data must not change an alternate key column. Put key values only in alternate_key.');
        delete plan.body![field];
      }
      if (Object.hasOwn(plan.body!,table.PrimaryIdAttribute)) invalid('Upsert data cannot contain a primary key.');
      if (key.keyFields.some(field => field.startsWith('_') && field.endsWith('_value')) && Object.keys(plan.body!).some(field => field.endsWith('@odata.bind'))) {
        invalid('Use the association tools separately when upserting with a lookup alternate key.');
      }
      plan.endpoint += '(' + key.selector + ')';
      plan.headers.Prefer = 'return=representation';
      plan.identityMode = args.mode;
      if (args.mode !== 'create_only' || args.dry_run) {
        try { before = await this.read(plan,signal); plan.id = guid(before[plan.primaryId]); }
        catch (error) {
          if (!(error instanceof CrmRequestError) || error.details.status !== 404 || args.if_match || args.mode === 'update_only') throw error;
        }
      }
      if (args.mode === 'create_only' || !before) {
        plan.headers['If-None-Match'] = '*'; plan.identityMode = 'create_only';
        if (before) plan.blockedBy = 'D365_RECORD_ALREADY_EXISTS';
      } else { this.condition(plan,args,table,before); plan.identityMode = 'update_only'; }
      plan.endpoint += '?$select=' + table.PrimaryIdAttribute;
    } else {
      plan.endpoint += '(' + args.id + ')';
      if (operation === 'associate' || operation === 'disassociate') {
        const target = await metadata.table(args.related_collection_name);
        const navigation = await metadata.navigation(table,target,args.navigation_property);
        if (navigation.single) {
          const lookup = '_' + navigation.attribute + '_value';
          before = await this.read(plan,signal,[lookup],operation === 'disassociate'
            ? args.navigation_property + '($select=' + target.PrimaryIdAttribute + ')' : undefined);
          if (operation === 'disassociate' && (!before[args.navigation_property] ||
              typeof before[args.navigation_property][target.PrimaryIdAttribute] !== 'string' ||
              before[args.navigation_property][target.PrimaryIdAttribute].toLowerCase() !== args.related_id)) {
            plan.blockedBy = 'D365_RELATIONSHIP_TARGET_MISMATCH';
          }
          this.condition(plan,args,table,before);
          if (operation === 'associate') plan.body = {[args.navigation_property + '@odata.bind']:'/' + args.related_collection_name + '(' + args.related_id + ')'};
          else {
            plan.method = 'DELETE';
            plan.endpoint += '/' + args.navigation_property + '/$ref';
            // CRM 9.1 rejects If-Match on a single-valued navigation $ref DELETE.
            delete plan.headers['If-Match'];
            plan.concurrencyProtected = false;
            if (args.if_match) plan.blockedBy = 'D365_RELATIONSHIP_CONCURRENCY_UNSUPPORTED';
            plan.relationshipClearCheck = {lookup,navigation:args.navigation_property,relatedKey:target.PrimaryIdAttribute};
          }
        } else {
          plan.method = operation === 'associate' ? 'POST' : 'DELETE';
          plan.endpoint += '/' + args.navigation_property + (operation === 'disassociate' ? '(' + args.related_id + ')' : '') + '/$ref';
          if (operation === 'associate') plan.body = {'@odata.id':this.absolute('/' + args.related_collection_name + '(' + args.related_id + ')')};
          if (!args.allow_unprotected_write || args.if_match) plan.blockedBy = 'D365_RELATIONSHIP_CONCURRENCY_UNSUPPORTED';
        }
      } else {
        before = await this.read(plan,signal);
        if (plan.body?.[plan.primaryId] !== undefined) {
          if (guid(plan.body[plan.primaryId]) !== plan.id) invalid('data cannot change the primary key.');
          delete plan.body[plan.primaryId];
          if (!Object.keys(plan.body).length) invalid('No update attributes remain after removing the primary key.');
        }
        this.condition(plan,args,table,before);
      }
    }
    this.client.validateEndpoint?.(plan.endpoint);
    const changes = Object.fromEntries(Object.entries(plan.body ?? {}).map(([field,value]) => [field,
      {beforeKnown:before !== null && Object.hasOwn(before,field),
        before:before && Object.hasOwn(before,field) ? redact(before[field],field) : null, after:redact(value,field)}]));
    plan.preview = {environment:this.environment,operation,collectionName:plan.collectionName,id:plan.id,
      target:operation === 'upsert' ? {alternateKey:redact(args.alternate_key)} : operation === 'associate' || operation === 'disassociate'
        ? {navigationProperty:args.navigation_property,relatedCollectionName:args.related_collection_name,relatedId:args.related_id} : {id:plan.id},
      changes,ifMatch:plan.headers['If-Match'] ?? null,ifNoneMatch:plan.headers['If-None-Match'] ?? null,
      concurrencyProtected:plan.concurrencyProtected,canWrite:plan.blockedBy === null,blockedBy:plan.blockedBy,
      note:'Read-only preflight is not a lock or full platform validation. Collection relationship changes have no row-version guarantee. Delete preview identifies the target without returning all data.'};
    return plan;
  }

  private async verifyRelationshipClear(plan:MutationPlan,result:Row,signal?:AbortSignal):Promise<Row> {
    const check = plan.relationshipClearCheck!;
    let current:Row;
    const suffix = '/' + check.navigation + '/$ref';
    const readPlan = plan.endpoint.endsWith(suffix) ? {...plan,endpoint:plan.endpoint.slice(0,-suffix.length)} : plan;
    try { current = await this.read(readPlan,signal,[check.lookup]); }
    catch (error) {
      throw new RecordMutationError('D365_RELATIONSHIP_READBACK_FAILED','The write response succeeded, but relationship readback failed. Inspect the target before any further write.',
        {...result,phase:'readback',relationshipVerified:false}, {...safeDetails(error),outcome:'unknown',retryable:false});
    }
    const targetPresent = current[check.lookup] != null || current[check.navigation] != null;
    const explicitNull = Object.hasOwn(current,check.lookup) && current[check.lookup] === null || Object.hasOwn(current,check.navigation) && current[check.navigation] === null;
    if (targetPresent || !explicitNull) throw new RecordMutationError('D365_RELATIONSHIP_READBACK_MISMATCH',
      'The write response succeeded, but the cleared relationship was not confirmed. No retry was submitted.',
      {...result,phase:'readback',relationshipCleared:false,relationshipVerified:false,
        readback:targetPresent ? 'still_associated_or_changed' : 'cleared_state_not_returned'}, {outcome:'unknown',retryable:false});
    return {...result,relationshipCleared:true,relationshipVerified:true};
  }

  private async read(plan:MutationPlan, signal?:AbortSignal, extra:string[] = [], expand?:string):Promise<Row> {
    const columns = [...new Set([plan.primaryId,...Object.keys(plan.body ?? {}).filter(field => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)),...extra])];
    const params:Record<string,string> = {'$select':columns.join(',')};
    if (expand) params.$expand = expand;
    const response = await this.client.requestWithResponse<Row>(plan.endpoint + '?' + query(params),'GET',undefined,{signal});
    const row = response.data;
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row[plan.primaryId] !== 'string' || !GUID.test(row[plan.primaryId])) metadataError();
    if (plan.id && row[plan.primaryId].toLowerCase() !== plan.id) metadataError();
    return {...row,'@odata.etag':row['@odata.etag'] ?? response.headers.etag};
  }
  private condition(plan:MutationPlan,args:Row,table:Row,before:Row) {
    if (table.IsOptimisticConcurrencyEnabled === true) {
      const current = before['@odata.etag'] == null ? undefined : etag(before['@odata.etag']);
      const match = args.if_match ?? current;
      if (!match) plan.blockedBy ??= 'D365_RECORD_ETAG_REQUIRED';
      else if (args.if_match && current && args.if_match !== current) plan.blockedBy ??= 'D365_CONCURRENCY_CONFLICT';
      else { plan.headers['If-Match'] = match; plan.concurrencyProtected = true; }
    } else if (args.allow_unprotected_write && !args.if_match) plan.headers['If-Match'] = '*';
    else plan.blockedBy ??= 'D365_RECORD_CONCURRENCY_UNSUPPORTED';
  }
  private validateReferences(value:unknown, depth = 0) {
    if (depth > 32) invalid('Nested record data exceeds the supported depth.');
    if (Array.isArray(value)) { for (const item of value) this.validateReferences(item,depth + 1); return; }
    if (!value || typeof value !== 'object') return;
    for (const [field,item] of Object.entries(value)) {
      if (field.endsWith('@odata.bind') || field === '@odata.id') {
        for (const reference of Array.isArray(item) ? item : [item]) {
          if (reference === null && field !== '@odata.id') continue;
          if (typeof reference !== 'string') invalid('OData record references must be strings or null binds.');
          const url = new URL(this.absolute(reference));
          if (url.pathname.split('/').some(segment => /^\$\d+$/.test(decodeURIComponent(segment)))) invalid('Content-ID references are not supported by record mutation tools.');
        }
      } else this.validateReferences(item,depth + 1);
    }
  }
  absolute(endpoint:string):string {
    if (this.client.validateEndpoint) return this.client.validateEndpoint(endpoint);
    const base = this.environment.orgUrl.replace(/\/+$/,'') + '/api/data/' + this.environment.apiVersion + '/';
    const url = new URL(endpoint.replace(/^\//,''),base);
    if (!url.href.startsWith(base) || url.hash || url.username || url.password || endpoint.startsWith('//')) invalid('Record references must remain within the organization API.');
    return url.href;
  }
  checkCancelled(signal?:AbortSignal) {
    if (signal?.aborted) throw new RecordMutationError('D365_REQUEST_ABORTED','Record operation cancelled before dispatch.');
  }
  success(plan:MutationPlan,response:CrmResponse<Row>):Row {
    const expected = plan.operation === 'delete' || plan.operation === 'disassociate' ? [204,200] : [200,201,204];
    if (!expected.includes(response.status)) throw new RecordMutationError('D365_RECORD_RESPONSE_INVALID',
      'The native write response does not confirm completion.',{operation:plan.operation,id:plan.id,saved:'unknown'},{outcome:'unknown'});
    if (response.data !== null && (typeof response.data !== 'object' || Array.isArray(response.data))) {
      throw new RecordMutationError('D365_RECORD_RESPONSE_INVALID','The native write response has an invalid body. Inspect the target before retrying.',
        {operation:plan.operation,id:plan.id,saved:'unknown'},{outcome:'unknown'});
    }
    const result:Row = {success:true,operation:plan.operation,collectionName:plan.collectionName,id:plan.id,
      saved:plan.operation !== 'delete',deleted:plan.operation === 'delete',status:response.status,
      concurrencyProtected:plan.concurrencyProtected,etag:response.headers.etag ?? response.data?.['@odata.etag'] ?? null};
    if (plan.relationshipClearCheck) result.relationshipVerified = false;
    if (plan.operation === 'create' || plan.operation === 'upsert') {
      const direct = response.data?.[plan.primaryId];
      const header = response.headers['odata-entityid'];
      let returned:string | null = null;
      try {
        if (direct !== undefined) returned = guid(direct);
        if (header) {
          this.absolute(header);
          const match = new RegExp('/' + plan.collectionName + '\\(([0-9a-f-]{36})\\)$','i').exec(header);
          if (!match) throw new Error('Invalid ID');
          const headerId = guid(match[1]);
          if (returned && returned !== headerId) throw new Error('Conflicting IDs');
          returned = headerId;
        }
        if (returned && plan.id && returned !== plan.id) throw new Error('Conflicting ID');
      } catch {
        throw new RecordMutationError('D365_RECORD_ID_CONFLICT','Write succeeded but response identity could not be trusted. Inspect the target before further writes.',
          {...result,saved:true,identityResolved:false},{outcome:'unknown'});
      }
      result.id = returned ?? plan.id;
      result.identityResolved = result.id !== null;
      result.created = plan.operation === 'create' || plan.identityMode === 'create_only' ? true
        : plan.identityMode === 'update_only' ? false : response.status === 201 ? true : response.status === 200 ? false : null;
      if (!result.identityResolved) result.identityIssue = 'D365_RECORD_ID_NOT_RETURNED';
      result.record = response.data ? redact(response.data) : null;
    }
    return result;
  }
}
