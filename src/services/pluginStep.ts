import { randomUUID } from 'node:crypto';
import type { CrmRequestClient } from '../types/crmRequest.js';
import { bool, choice, etag, evidence, GUID, guid, integer, invalid,
  logical, mutation, object, optionalText, patch, PluginStepError, protect, stageMode, text,
  type Mutation, type Row } from './pluginStepValidation.js';

const STEP_ID = 'sdkmessageprocessingstepid';
const CONFIG_ID = 'sdkmessageprocessingstepsecureconfigid';
const STEP_SELECT = [STEP_ID,'name','description','stage','mode','rank','filteringattributes',
  'supporteddeployment','statecode','statuscode','_eventhandler_value','_sdkmessageid_value',
  '_sdkmessagefilterid_value','_impersonatinguserid_value','_' + CONFIG_ID + '_value'].join(',');
const EXPAND = 'eventhandler_plugintype($select=plugintypeid,typename,friendlyname),sdkmessageid($select=sdkmessageid,name),sdkmessagefilterid($select=sdkmessagefilterid,primaryobjecttypecode)';
const discoveryFields = ['plugin_type_name','assembly_name','message','primary_entity'];
const lit = (value: string) => "'" + value.replace(/'/g, "''") + "'";
const query = (params: Record<string, string>) => new URLSearchParams(params).toString();
const bind = (set: string, id: string) => '/' + set + '(' + id + ')';

function responseError(): never { throw new PluginStepError('D365_PLUGIN_RESPONSE_INVALID', 'Native plugin metadata or response was incomplete or invalid.'); }
function rowId(value: unknown): string {
  if (typeof value !== 'string' || !GUID.test(value)) responseError();
  return value.toLowerCase();
}

/** Native registrations only: this service does not upload assemblies or execute arbitrary code. */
export class PluginStepService {
  constructor(private readonly client: CrmRequestClient,
    private readonly environment: {orgUrl:string; authType:string; apiVersion:string},
    private readonly newId: () => string = randomUUID) {}

  metadata(raw: unknown) { return protect(async () => {
    const args = this.discovery(object(raw, discoveryFields));
    const types = await this.types(args);
    const messages = await this.messages(args.message);
    // Do not silently choose one message from a bounded discovery listing.
    const filters = args.primary_entity || args.message
      ? await this.filters(args.message ? rowId(this.unique(messages, 'message').sdkmessageid) : undefined, args.primary_entity)
      : {rows:[], hasMore:false, atLimit:false};
    return {success:true, pluginTypes:types.rows.map(row => this.typeItem(row)),
      messages:messages.rows.map(row => ({id:rowId(row.sdkmessageid), name:row.name})),
      messageFilters:filters.rows.map(row => ({id:rowId(row.sdkmessagefilterid), messageId:rowId(row._sdkmessageid_value),
        primaryEntity:row.primaryobjecttypecode ?? null, secondaryEntity:row.secondaryobjecttypecode ?? null,
        customProcessingStepAllowed:row.iscustomprocessingstepallowed === true})),
      limits:{pluginTypes:100,messages:100,messageFilters:500},
      limited:{pluginTypes:types.hasMore || types.atLimit, messages:messages.hasMore || messages.atLimit,
        messageFilters:filters.hasMore || filters.atLimit},
    };
  }); }

  query(raw: unknown, signal?:AbortSignal) { return protect(async () => {
    const args = this.discovery(object(raw, [...discoveryFields,'step_id','stage','mode','enabled',
      'include_unsecure_configuration','include_secure_configuration','top']));
    const top = args.top === undefined ? 50 : integer(args.top, 'top', 500);
    const includeUnsecure = bool(args.include_unsecure_configuration, 'include_unsecure_configuration', true);
    const includeSecure = bool(args.include_secure_configuration, 'include_secure_configuration', false);
    const filters: string[] = [];
    if (args.step_id !== undefined) filters.push(STEP_ID + ' eq ' + guid(args.step_id, 'step_id'));
    if (args.stage !== undefined) filters.push('stage eq ' + choice(args.stage, 'stage'));
    if (args.mode !== undefined) filters.push('mode eq ' + choice(args.mode, 'mode'));
    if (args.enabled !== undefined) filters.push('statecode eq ' + (bool(args.enabled, 'enabled') ? 0 : 1));
    if (args.plugin_type_name) filters.push('eventhandler_plugintype/typename eq ' + lit(args.plugin_type_name));
    if (args.assembly_name) filters.push('eventhandler_plugintype/pluginassemblyid/name eq ' + lit(args.assembly_name));
    if (args.message) filters.push('sdkmessageid/name eq ' + lit(args.message));
    if (args.primary_entity) filters.push('sdkmessagefilterid/primaryobjecttypecode eq ' + lit(args.primary_entity));
    const page = await this.stepRows(filters.join(' and '), top, includeUnsecure, includeSecure,signal);
    return {success:true, items:page.rows.map(row => this.stepItem(row, includeUnsecure, includeSecure)), count:page.rows.length,
      paging:{top, hasMore:page.hasMore, atLimit:page.atLimit,
        note:'Bounded query; a full top-sized result does not prove that no other matching registrations exist.'}};
  }); }

  register(raw: unknown) { return protect(async () => {
    const args = object(raw, ['plugin_type','message','primary_entity','name','description','stage','mode','rank',
      'supported_deployment','filtering_attributes','impersonating_user_id','unsecure_configuration',
      'secure_configuration','conflict_policy','dry_run','allow_unprotected_update']);
    const reference = this.discovery(object(args.plugin_type, ['id','plugin_type_name','assembly_name']));
    if (reference.id !== undefined) reference.id = guid(reference.id, 'plugin_type.id');
    if (!reference.id && !reference.plugin_type_name) invalid('plugin_type requires id or plugin_type_name.');
    args.message = text(args.message, 'message').trim();
    args.primary_entity = logical(args.primary_entity);
    const values = patch(Object.fromEntries(Object.entries(args).filter(([key]) =>
      ['name','description','stage','mode','rank','supported_deployment','filtering_attributes','impersonating_user_id'].includes(key))));
    const stage = choice(args.stage, 'stage'), mode = choice(args.mode, 'mode');
    stageMode(stage, mode);
    integer(args.rank, 'rank');
    const dryRun = bool(args.dry_run, 'dry_run');
    const allow = bool(args.allow_unprotected_update, 'allow_unprotected_update');
    const policy = args.conflict_policy ?? 'error';
    if (!['error','return_existing','update_existing'].includes(policy)) invalid('Invalid conflict_policy.');
    const secure: Mutation = args.secure_configuration === undefined ? {action:'keep'}
      : {action:'set', value:text(args.secure_configuration, 'secure_configuration', true)};
    const unsecure: Mutation = args.unsecure_configuration === undefined ? {action:'keep'}
      : {action:'set', value:text(args.unsecure_configuration, 'unsecure_configuration', true)};
    if ((values.filtering_attributes?.length ?? 0) && args.message.toLowerCase() !== 'update') invalid('Filtering attributes require the Update message.');
    const pluginType = await this.resolveType(reference);
    const message = await this.resolveMessage(args.message);
    const filter = args.primary_entity ? await this.resolveFilter(message.sdkmessageid, args.primary_entity) : null;
    await this.validateAttributes(values.filtering_attributes || [], message.name, args.primary_entity);
    const signature = {type:pluginType.plugintypeid, message:message.sdkmessageid,
      filter:filter?.sdkmessagefilterid ?? null, stage, mode};
    const duplicate = await this.duplicate(signature);
    if (duplicate) {
      if (policy === 'error') throw new PluginStepError('D365_PLUGIN_DUPLICATE_STEP', 'An equivalent step already exists.', {stepId:rowId(duplicate[STEP_ID])});
      if (policy === 'return_existing') return {success:true, created:false, changed:false, conflictPolicy:policy,
        dryRun, item:this.stepItem(duplicate), note:'No fields or configuration were applied.'};
      const result = await this.updateResolved(duplicate, values, unsecure, secure, undefined, allow, dryRun);
      return {...result, created:false, conflictPolicy:policy};
    }
    const payload: Row = {name:values.name ?? pluginType.typename + ': ' + message.name + ' of ' + (args.primary_entity ?? 'none'),
      description:values.description ?? '', stage, mode, rank:args.rank,
      supporteddeployment:values.supported_deployment ?? 0,
      filteringattributes:values.filtering_attributes?.length ? values.filtering_attributes.join(',') : null,
      'eventhandler_plugintype@odata.bind':bind('plugintypes', rowId(pluginType.plugintypeid)),
      'sdkmessageid@odata.bind':bind('sdkmessages', rowId(message.sdkmessageid))};
    if (filter) payload['sdkmessagefilterid@odata.bind'] = bind('sdkmessagefilters', rowId(filter.sdkmessagefilterid));
    this.impersonation(payload, values.impersonating_user_id);
    if (unsecure.action === 'set') payload.configuration = unsecure.value;
    if (dryRun) return this.preview('register', payload, secure, unsecure, null);
    const state = this.state(guid(this.newId()), secure.action);
    payload[STEP_ID] = state.stepId;
    if (secure.action === 'set') {
      const secureId = await this.allocateSecure(secure.value!, state);
      payload[CONFIG_ID + '@odata.bind'] = bind('sdkmessageprocessingstepsecureconfigs', secureId);
    }
    await this.writeStep('POST', '/sdkmessageprocessingsteps', payload, undefined, state);
    return this.readback(state, true);
  }, raw); }

  update(raw: unknown) { return protect(async () => {
    const args = object(raw, ['step_id','if_match','patch','unsecure_configuration','secure_configuration','dry_run','allow_unprotected_update']);
    const stepId = guid(args.step_id, 'step_id');
    const match = etag(args.if_match);
    const values = patch(args.patch);
    const unsecure = mutation(args.unsecure_configuration), secure = mutation(args.secure_configuration);
    const dryRun = bool(args.dry_run, 'dry_run');
    const allow = bool(args.allow_unprotected_update, 'allow_unprotected_update');
    return this.updateResolved(await this.getStep(stepId), values, unsecure, secure, match, allow, dryRun);
  }, raw); }

  private discovery(args: Row): Row {
    for (const field of ['plugin_type_name','assembly_name','message']) if (args[field] !== undefined) args[field] = optionalText(args[field], field);
    if (args.primary_entity !== undefined) args.primary_entity = logical(args.primary_entity);
    return args;
  }

  private async rows(set: string, select: string, filter = '', expand = '', top = 100, signal?:AbortSignal) {
    const params: Row = {'$select':select};
    if (!set.startsWith('EntityDefinitions(')) {
      params.$top = String(top);
      params.$orderby = select.split(',')[0] + ' asc';
    }
    if (filter) params.$filter = filter;
    if (expand) params.$expand = expand;
    let next: string | undefined = '/' + set + '?' + query(params);
    const rows: Row[] = [], seen = new Set<string>();
    while (next && rows.length < top) {
      const key = this.client.validateEndpoint?.(next) ?? next;
      if (seen.has(key) || seen.size >= 10) throw new PluginStepError('D365_PLUGIN_LOOKUP_INCOMPLETE', 'Plugin lookup pagination did not complete within its safe limit.');
      seen.add(key);
      const page: Row | null = await this.client.makeRequest(next,'GET',undefined,{signal});
      if (!page || !Array.isArray(page.value) || page.value.some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row))) responseError();
      if (page['@odata.nextLink'] !== undefined && (typeof page['@odata.nextLink'] !== 'string' || !page['@odata.nextLink'])) responseError();
      if (page.value.length > top - rows.length) throw new PluginStepError('D365_PLUGIN_RESPONSE_INVALID', 'The plugin query exceeded its requested bound.');
      rows.push(...page.value);
      next = page['@odata.nextLink'];
      if (next) this.client.validateEndpoint?.(next);
    }
    return {rows, hasMore:!!next, atLimit:rows.length === top};
  }

  private types(args: Row, top = 100) {
    const filters = [];
    if (args.id) filters.push('plugintypeid eq ' + args.id);
    if (args.plugin_type_name) filters.push('typename eq ' + lit(args.plugin_type_name));
    if (args.assembly_name) filters.push('pluginassemblyid/name eq ' + lit(args.assembly_name));
    return this.rows('plugintypes', 'plugintypeid,typename,friendlyname,isworkflowactivity,_pluginassemblyid_value',
      filters.join(' and '), 'pluginassemblyid($select=pluginassemblyid,name)', top);
  }
  private messages(name?: string, top = 100) {
    return this.rows('sdkmessages', 'sdkmessageid,name,isprivate,isactive', name ? 'name eq ' + lit(name) : '', '', top);
  }
  private filters(message?: string, entity?: string, top = 500) {
    const filters = [];
    if (message) filters.push('_sdkmessageid_value eq ' + rowId(message));
    if (entity) filters.push('primaryobjecttypecode eq ' + lit(entity));
    return this.rows('sdkmessagefilters', 'sdkmessagefilterid,primaryobjecttypecode,secondaryobjecttypecode,iscustomprocessingstepallowed,_sdkmessageid_value', filters.join(' and '), '', top);
  }
  private unique(page: {rows:Row[]; hasMore:boolean}, kind: string): Row {
    if (page.rows.length > 1 || page.hasMore) throw new PluginStepError('D365_PLUGIN_AMBIGUOUS', 'The ' + kind + ' reference did not resolve uniquely.');
    if (!page.rows.length) throw new PluginStepError('D365_PLUGIN_NOT_FOUND', 'The ' + kind + ' reference was not found.');
    return page.rows[0];
  }
  private async resolveType(reference: Row) {
    const result = this.unique(await this.types(reference, 2), 'plugin type');
    rowId(result.plugintypeid);
    if (typeof result.typename !== 'string' || !result.typename) responseError();
    if (result.isworkflowactivity === true) invalid('Workflow activities cannot be registered as plugin steps.');
    return result;
  }
  private async resolveMessage(name: string) {
    const result = this.unique(await this.messages(name, 2), 'message');
    rowId(result.sdkmessageid);
    if (typeof result.name !== 'string' || !result.name) responseError();
    if (result.isprivate === true || result.isactive === false) invalid('Private or inactive messages cannot be registered by this tool.');
    return result;
  }
  private async resolveFilter(message: string, entity: string) {
    const page = await this.filters(message, entity, 500);
    if (page.hasMore || page.atLimit) throw new PluginStepError('D365_PLUGIN_LOOKUP_INCOMPLETE', 'Message filters reached the lookup bound; no filter was selected.');
    const allowed = page.rows.filter(row => row.iscustomprocessingstepallowed === true);
    if (!allowed.length) throw new PluginStepError('D365_PLUGIN_CUSTOM_STEP_NOT_ALLOWED', 'No custom-processing filter was found for this message and table.');
    const result = this.unique({rows:allowed,hasMore:false}, 'message filter');
    rowId(result.sdkmessagefilterid);
    return result;
  }
  private stepRows(filter: string, top = 50, unsecure = false, secure = false, signal?:AbortSignal) {
    return this.rows('sdkmessageprocessingsteps', STEP_SELECT + (unsecure ? ',configuration' : ''), filter,
      EXPAND + (secure ? ',' + CONFIG_ID + '($select=' + CONFIG_ID + ',secureconfig)' : ''), top,signal);
  }
  private async getStep(stepId: string): Promise<Row> {
    const row = this.unique(await this.stepRows(STEP_ID + ' eq ' + stepId, 2), 'plugin step');
    if (rowId(row[STEP_ID]) !== stepId) responseError();
    return row;
  }
  private async duplicate(signature: Row, except?: string) {
    const filters = ['_eventhandler_value eq ' + rowId(signature.type), '_sdkmessageid_value eq ' + rowId(signature.message),
      '_sdkmessagefilterid_value eq ' + (signature.filter === null ? 'null' : rowId(signature.filter)),
      'stage eq ' + signature.stage, 'mode eq ' + signature.mode];
    if (except) filters.push(STEP_ID + ' ne ' + except);
    const page = await this.stepRows(filters.join(' and '), 2);
    if (page.rows.length > 1 || page.hasMore) throw new PluginStepError('D365_PLUGIN_DUPLICATE_AMBIGUOUS', 'Multiple equivalent steps exist; choose a step_id explicitly.');
    return page.rows[0] ?? null;
  }
  private async validateAttributes(attrs: string[], message: string, entity?: string) {
    if (!attrs.length) return;
    if (message.toLowerCase() !== 'update' || !entity) invalid('Filtering attributes require an entity-specific Update message.');
    const endpoint = '/EntityDefinitions(LogicalName=' + lit(entity) + ')';
    const definition = await this.client.makeRequest(endpoint + '?$select=PrimaryIdAttribute');
    if (typeof definition?.PrimaryIdAttribute !== 'string') responseError();
    if (attrs.includes(definition.PrimaryIdAttribute.toLowerCase())) invalid('The primary key cannot be a filtering attribute.');
    const page = await this.rows(endpoint.slice(1) + '/Attributes', 'LogicalName', attrs.map(name => 'LogicalName eq ' + lit(name)).join(' or '), '', 100);
    const found = new Set(page.rows.map(row => row.LogicalName));
    if (page.hasMore || attrs.some(name => !found.has(name))) invalid('Filtering attributes were missing or could not be completely validated against table metadata.');
  }

  private typeItem(row: Row) {
    return {id:rowId(row.plugintypeid), typeName:row.typename, friendlyName:row.friendlyname ?? null,
      assemblyId:row._pluginassemblyid_value ?? row.pluginassemblyid?.pluginassemblyid ?? null,
      assemblyName:row.pluginassemblyid?.name ?? null};
  }
  private stepItem(row: Row, unsecure = false, secure = false) {
    const secureId = row['_' + CONFIG_ID + '_value'] ?? row[CONFIG_ID]?.[CONFIG_ID] ?? null;
    return {stepId:rowId(row[STEP_ID]), name:row.name ?? null, description:row.description ?? null,
      pluginType:{id:row._eventhandler_value ?? null, typeName:row.eventhandler_plugintype?.typename ?? null,
        friendlyName:row.eventhandler_plugintype?.friendlyname ?? null},
      message:{id:row._sdkmessageid_value ?? null, name:row.sdkmessageid?.name ?? null},
      primaryEntity:row.sdkmessagefilterid?.primaryobjecttypecode ?? null,
      stage:{value:row.stage, name:({10:'PreValidation',20:'PreOperation',40:'PostOperation'} as Row)[row.stage] ?? 'Unknown'},
      mode:{value:row.mode, name:row.mode === 0 ? 'Synchronous' : row.mode === 1 ? 'Asynchronous' : 'Unknown'},
      rank:row.rank ?? null, supportedDeployment:row.supporteddeployment ?? null,
      filteringAttributes:typeof row.filteringattributes === 'string' ? row.filteringattributes.split(',').filter(Boolean) : [],
      enabled:row.statecode === 0, impersonatingUserId:row._impersonatinguserid_value ?? null,
      unsecureConfiguration:unsecure ? row.configuration ?? null : null,
      secureConfiguration:{id:secureId, present:secureId !== null, included:secure,
        value:secure ? row[CONFIG_ID]?.secureconfig ?? null : null}, etag:row['@odata.etag'] ?? null};
  }

  private async updateResolved(existing: Row, values: Row, unsecure: Mutation, secure: Mutation,
    suppliedMatch: string | undefined, allow: boolean, dryRun: boolean) {
    const stepId = rowId(existing[STEP_ID]);
    const stage = values.stage ?? existing.stage, mode = values.mode ?? existing.mode;
    choice(stage, 'stage'); choice(mode, 'mode'); stageMode(stage, mode);
    if (!existing.eventhandler_plugintype) invalid('Only plugin-type event handlers can be updated.');
    await this.validateAttributes(values.filtering_attributes ?? [], existing.sdkmessageid?.name ?? '', existing.sdkmessagefilterid?.primaryobjecttypecode);
    if (stage !== existing.stage || mode !== existing.mode) {
      const other = await this.duplicate({type:existing._eventhandler_value, message:existing._sdkmessageid_value,
        filter:existing._sdkmessagefilterid_value ?? null, stage, mode}, stepId);
      if (other) throw new PluginStepError('D365_PLUGIN_DUPLICATE_STEP', 'The proposed stage/mode matches another step.', {stepId:rowId(other[STEP_ID])});
    }
    const payload: Row = {};
    const fields: Row = {name:'name', description:'description', stage:'stage', mode:'mode', rank:'rank', supported_deployment:'supporteddeployment'};
    for (const [key, field] of Object.entries(fields)) if (values[key] !== undefined) payload[field] = values[key];
    if (values.filtering_attributes !== undefined) payload.filteringattributes = values.filtering_attributes.length ? values.filtering_attributes.join(',') : null;
    if (values.enabled !== undefined) { payload.statecode = values.enabled ? 0 : 1; payload.statuscode = values.enabled ? 1 : 2; }
    this.impersonation(payload, values.impersonating_user_id);
    if (unsecure.action !== 'keep') payload.configuration = unsecure.action === 'clear' ? null : unsecure.value;
    if (secure.action === 'clear') payload[CONFIG_ID + '@odata.bind'] = null;
    const oldId = existing['_' + CONFIG_ID + '_value'] ?? null;
    if (oldId !== null) rowId(oldId);
    const changed = Object.keys(payload).length > 0 || secure.action === 'set';
    if (!changed) return {success:true, changed:false, created:false, item:this.stepItem(existing), dryRun};
    const definition = await this.client.makeRequest("/EntityDefinitions(LogicalName='sdkmessageprocessingstep')?$select=IsOptimisticConcurrencyEnabled");
    const concurrency = definition?.IsOptimisticConcurrencyEnabled === true;
    const match = concurrency ? suppliedMatch ?? etag(existing['@odata.etag']) : allow && !suppliedMatch ? '*' : undefined;
    const blockedBy = !concurrency && (suppliedMatch || !allow) ? 'D365_PLUGIN_CONCURRENCY_UNSUPPORTED'
      : !match ? 'D365_PLUGIN_ETAG_REQUIRED'
      : suppliedMatch && existing['@odata.etag'] && suppliedMatch !== existing['@odata.etag'] ? 'D365_CONCURRENCY_CONFLICT' : null;
    if (dryRun) return {...this.preview('update', payload, secure, unsecure, existing), ifMatch:match ?? null,
      concurrencyProtected:concurrency && !!match, canWrite:blockedBy === null, blockedBy};
    if (blockedBy === 'D365_PLUGIN_CONCURRENCY_UNSUPPORTED') throw new PluginStepError('D365_PLUGIN_CONCURRENCY_UNSUPPORTED',
      'Optimistic concurrency is not confirmed for this table. No write was sent. Explicit allow_unprotected_update is required for an unprotected update.');
    if (!match) throw new PluginStepError('D365_PLUGIN_ETAG_REQUIRED', 'No ETag was returned; provide a specific if_match before updating.');
    if (suppliedMatch && existing['@odata.etag'] && suppliedMatch !== existing['@odata.etag']) {
      throw new PluginStepError('D365_CONCURRENCY_CONFLICT', 'The supplied ETag no longer matches the step.', {stepId}, {status:412, outcome:'not_sent'});
    }
    const state = this.state(stepId, secure.action);
    state.previousSecureConfigId = oldId;
    if (secure.action === 'set') {
      const secureId = await this.allocateSecure(secure.value!, state);
      payload[CONFIG_ID + '@odata.bind'] = bind('sdkmessageprocessingstepsecureconfigs', secureId);
    }
    await this.writeStep('PATCH', bind('sdkmessageprocessingsteps', stepId), payload, match, state);
    if (secure.action !== 'keep' && oldId) state.retainedSecureConfigIds.push(oldId);
    return {...await this.readback(state, false), concurrencyProtected:concurrency};
  }

  private impersonation(payload: Row, user: string | null | undefined) {
    if (user !== undefined) payload['impersonatinguserid@odata.bind'] = user === null ? null : bind('systemusers', user);
  }
  private preview(operation: string, payload: Row, secure: Mutation, unsecure: Mutation, existing: Row | null) {
    const changes: Row = {};
    for (const [field, value] of Object.entries(payload)) if (field !== 'configuration') changes[field] = {before:existing?.[field] ?? null, after:value};
    return {success:true, dryRun:true, saved:false, operation, environment:this.environment,
      stepId:existing?.[STEP_ID] ?? null, changes,
      configurationChanges:{unsecure:{action:unsecure.action}, secure:{action:secure.action}},
      note:'Configuration values are withheld. Preview does not lock records, enforce uniqueness or validate all platform business rules.'};
  }
  private state(stepId: string, action: string): Row {
    return {stepId, saved:false, secureConfiguration:{action, id:null, created:false, binding:'unchanged'},
      previousSecureConfigId:null, retainedSecureConfigIds:[]};
  }
  private async allocateSecure(value: string, state: Row): Promise<string> {
    const configId = guid(this.newId());
    state.secureConfiguration.id = configId;
    try {
      const response = await this.client.requestWithResponse<Row>('/sdkmessageprocessingstepsecureconfigs', 'POST',
        {[CONFIG_ID]:configId, secureconfig:value}, {headers:{Prefer:'return=representation'}});
      state.secureConfiguration.created = true;
      this.confirmId(response, CONFIG_ID, 'sdkmessageprocessingstepsecureconfigs', configId);
    } catch (error) {
      state.secureConfiguration.created = state.secureConfiguration.created === true ? true : evidence(error).outcome === 'unknown' || !evidence(error).outcome ? 'unknown' : false;
      throw this.phaseError('secure_configuration_create', state, error);
    }
    return configId;
  }
  private async writeStep(method: 'POST' | 'PATCH', endpoint: string, payload: Row, match: string | undefined, state: Row) {
    try {
      const response = await this.client.requestWithResponse<Row>(endpoint, method, payload,
        {headers:method === 'POST' ? {Prefer:'return=representation'} : {'If-Match':match!}});
      state.saved = true;
      state.secureConfiguration.binding = state.secureConfiguration.action === 'keep' ? 'unchanged' : 'write_succeeded';
      if (method === 'POST') this.confirmId(response, STEP_ID, 'sdkmessageprocessingsteps', state.stepId);
    } catch (error) {
      if (state.saved !== true) {
        state.saved = evidence(error).outcome === 'unknown' || !evidence(error).outcome ? 'unknown' : false;
        if (state.secureConfiguration.action !== 'keep') state.secureConfiguration.binding = state.saved === 'unknown' ? 'unknown' : 'not_applied';
      }
      throw this.phaseError('step_write', state, error);
    }
  }
  private confirmId(response: {data:Row | null; headers:Record<string,string>}, field: string, set: string, expected: string) {
    const direct = response.data?.[field];
    const header = response.headers['odata-entityid'];
    let returned = direct;
    if (header) {
      this.client.validateEndpoint?.(header);
      const match = new RegExp('/' + set + '\\(([0-9a-f-]{36})\\)$', 'i').exec(header);
      if (!match || rowId(match[1]) !== expected) responseError();
      returned ??= match[1];
    }
    if (returned !== undefined && rowId(returned) !== expected) responseError();
    // Client-assigned IDs make successful empty responses and unknown outcomes reconcilable.
  }
  private async readback(state: Row, created: boolean) {
    try {
      const item = this.stepItem(await this.getStep(state.stepId));
      if ((state.secureConfiguration.action === 'set' && item.secureConfiguration.id !== state.secureConfiguration.id) ||
          (state.secureConfiguration.action === 'clear' && item.secureConfiguration.id !== null)) {
        state.secureConfiguration.binding = 'not_confirmed';
        responseError();
      }
      if (state.secureConfiguration.action !== 'keep') state.secureConfiguration.binding = 'verified';
      return {success:true, created, changed:true, ...state, item,
        note:'Retained configuration rows are not deleted automatically; check all references before any manual cleanup.'};
    } catch (error) { throw this.phaseError('readback', state, error); }
  }
  private phaseError(phase: string, state: Row, error: unknown) {
    return new PluginStepError('D365_PLUGIN_WRITE_FAILED',
      'A plugin write phase failed or could not be confirmed. Inspect the reported IDs before retrying; no automatic rollback or write replay was performed.',
      {success:false, phase, ...state, reconciliationRequired:true,
        note:'Do not delete configuration rows until the step reference and operation outcome have been checked.'},
      {...evidence(error), retryable:false});
  }
}

