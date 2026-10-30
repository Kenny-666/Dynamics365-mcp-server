import {PluginStepError,object,guid,text,bool,integer,etag,evidence,protect,type Row} from './pluginStepValidation.js';
import {CrmRequestError} from '../errors.js';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {CacheService} from './cache.js';
import {hash} from './modelMetadata.js';
import {assemblyBytes,decodeAssembly,assemblyHash,inspectAssembly,assemblyError,type InspectAssembly,type AssemblyMetadata} from './assemblyInspector.js';

const ID = 'pluginassemblyid';
const SELECT = [ID,'name','version','culture','publickeytoken','sourcetype','isolationmode','ismanaged','iscustomizable','modifiedon'].join(',');
const aliases:Record<string,string> = {assemblyId:'assembly_id',filePath:'file_path',contentBase64:'content_base64',expectedFingerprint:'expected_fingerprint'};
function args(raw:unknown,allowed:string[]):Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) assemblyError('INVALID','Expected assembly arguments.');
  const normalized:Row = {};
  for (const [key,value] of Object.entries(raw as Row)) {
    const name = aliases[key] ?? key;
    if (Object.hasOwn(normalized,name) && normalized[name] !== value) assemblyError('INVALID','Conflicting assembly aliases.');
    normalized[name] = value;
  }
  return object(normalized,allowed);
}
function row(value:unknown):Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) assemblyError('RESPONSE_INVALID','The native assembly response is invalid.');
  return value as Row;
}
const culture = (value:unknown) => value === null || value === '' || value === 'neutral' ? '' : typeof value === 'string' ? value.toLowerCase() : undefined;
function version(value:unknown):number[] {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(value)) assemblyError('VERSION_INVALID','A four-part assembly version is required.');
  const parts = (value as string).split('.').map(Number);
  if (parts.some(part => part > 65534)) assemblyError('VERSION_INVALID','Assembly version components must be within 0–65534.');
  return parts;
}
function identityMatches(server:Row,metadata:AssemblyMetadata):boolean {
  return server.name === metadata.name && server.version === metadata.version && culture(server.culture) === culture(metadata.culture)
    && typeof server.publickeytoken === 'string' && server.publickeytoken.toLowerCase() === metadata.publicKeyToken;
}
function summary(metadata:AssemblyMetadata,bytes:Buffer) {
  return {...metadata,sha256:assemblyHash(bytes),size:bytes.length,cryptographicSignatureVerified:false,dependenciesResolved:false,codeExecuted:false};
}

/** Local read-only inspection is available without CRM settings. */
export async function inspectPluginAssembly(raw:unknown,signal?:AbortSignal,inspect:InspectAssembly = inspectAssembly) {
  return protect(async () => {
    const input = args(raw,['file_path','content_base64']);
    const bytes = await assemblyBytes(input);
    const metadata = await inspect(bytes,signal);
    return {success:true,inspection:summary(metadata,bytes),runtimeRequirement:'.NET 10 Runtime (metadata reader only)'};
  });
}

export class PluginAssemblyService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:{orgUrl:string;authType:string;apiVersion:string},
    private readonly inspect:InspectAssembly = inspectAssembly) {}
  private async get(endpoint:string,signal?:AbortSignal):Promise<Row> {
    return row((await this.client.requestWithResponse(endpoint,'GET',undefined,{signal})).data);
  }
  private project(value:Row):Row {
    const result:Row = {};
    for (const field of SELECT.split(',')) if (Object.hasOwn(value,field)) result[field] = value[field];
    result[ID] = guid(value[ID],'assembly_id');
    result['@odata.etag'] = value['@odata.etag'] ?? null;
    return result;
  }
  query(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const input = args(raw,['assembly_id','name','top']);
      const filters:string[] = [];
      if (input.assembly_id !== undefined) filters.push(ID + ' eq ' + guid(input.assembly_id,'assembly_id'));
      if (input.name !== undefined) {
        const name = text(input.name,'name').trim();
        if (name.length > 256) assemblyError('INVALID','Assembly name must contain at most 256 characters.');
        filters.push("name eq '" + name.replace(/'/g,"''") + "'");
      }
      const top = input.top === undefined ? 100 : integer(input.top,'top',500);
      const query = new URLSearchParams({'$select':SELECT,'$orderby':ID,'$top':String(top)});
      if (filters.length) query.set('$filter',filters.join(' and '));
      const result = await this.get('/pluginassemblies?' + query,signal);
      if (!Array.isArray(result.value) || result.value.length > top) assemblyError('RESPONSE_INVALID','The assembly collection is invalid.');
      const items = result.value.map((value:unknown) => this.project(row(value)));
      return {success:true,environment:this.environment,items,count:items.length,complete:!result['@odata.nextLink'] && items.length < top,limit:top};
    });
  }
  private async registeredTypes(id:string,signal?:AbortSignal):Promise<Row[]> {
    const result = await this.get('/plugintypes?$select=plugintypeid,typename,isworkflowactivity,version,culture,publickeytoken,_pluginassemblyid_value&$filter=_pluginassemblyid_value eq ' + id + '&$orderby=plugintypeid&$top=500',signal);
    if (!Array.isArray(result.value) || result.value.length >= 500 || result['@odata.nextLink']) assemblyError('TYPES_INCOMPLETE','A complete list of fewer than 500 registered types is required.');
    const types = result.value.map((value:unknown) => {
      const item = row(value);
      if (guid(item._pluginassemblyid_value,'type assembly') !== id || typeof item.typename !== 'string' || !item.typename) assemblyError('RESPONSE_INVALID','Registered type identity is invalid.');
      return {id:guid(item.plugintypeid,'plugin type ID'),name:item.typename,workflow:item.isworkflowactivity,
        version:item.version,culture:culture(item.culture),publicKeyToken:typeof item.publickeytoken === 'string' ? item.publickeytoken.toLowerCase() : null};
    });
    if (new Set(types.map(item => item.id)).size !== types.length || new Set(types.map(item => item.name)).size !== types.length) assemblyError('RESPONSE_INVALID','Registered types contain duplicate identities.');
    return types.sort((left,right) => left.id.localeCompare(right.id));
  }
  update(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const input = args(raw,['assembly_id','file_path','content_base64','dry_run','expected_fingerprint','if_match','allow_unprotected_update']);
      const id = guid(input.assembly_id,'assembly_id'), dryRun = bool(input.dry_run,'dry_run',true);
      const suppliedMatch = etag(input.if_match), allow = bool(input.allow_unprotected_update,'allow_unprotected_update');
      if (input.expected_fingerprint !== undefined && (typeof input.expected_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.expected_fingerprint))) assemblyError('INVALID','expected_fingerprint must be a preview SHA-256.');
      const bytes = await assemblyBytes(input), candidate = await this.inspect(bytes,signal);
      const concurrency = await this.get("/EntityDefinitions(LogicalName='pluginassembly')?$select=IsOptimisticConcurrencyEnabled",signal);
      // packageid is absent in older on-premise versions. Discover it instead of blindly selecting a new column.
      const attributes = await this.get("/EntityDefinitions(LogicalName='pluginassembly')/Attributes?$select=LogicalName&$filter=LogicalName eq 'packageid'&$top=2",signal);
      if (!Array.isArray(attributes.value) || attributes.value.length > 1 || attributes['@odata.nextLink']
        || attributes.value.some((item:Row) => item?.LogicalName !== 'packageid')) assemblyError('RESPONSE_INVALID','Assembly package capability metadata is incomplete.');
      const packaged = attributes.value.length === 1;
      const endpoint = '/pluginassemblies(' + id + ')?$select=' + SELECT + ',content' + (packaged ? ',_packageid_value' : '');
      const stored = await this.get(endpoint,signal), existing = this.project(stored);
      if (existing[ID] !== id) assemblyError('RESPONSE_INVALID','The returned assembly ID does not match the requested ID.');
      const oldBytes = decodeAssembly(stored.content), original = await this.inspect(oldBytes,signal);
      const registered = await this.registeredTypes(id,signal);
      const blocked:string[] = [];
      if (!identityMatches(existing,original)) blocked.push('STORED_IDENTITY_MISMATCH');
      if (existing.ismanaged !== false || existing.iscustomizable?.Value !== true) blocked.push('MANAGED_OR_NOT_CUSTOMIZABLE');
      if (existing.sourcetype !== 0 || ![1,2].includes(existing.isolationmode)) blocked.push('SOURCE_OR_ISOLATION_UNSUPPORTED');
      if (this.environment.authType === 'online' && existing.isolationmode !== 2) blocked.push('ONLINE_REQUIRES_SANDBOX');
      if (packaged && stored._packageid_value != null) blocked.push('PLUGIN_PACKAGE_REQUIRES_PACKAGE_UPDATE');
      if (/^Microsoft\./i.test(existing.name)) blocked.push('PLATFORM_ASSEMBLY_UNSUPPORTED');
      if (existing.name !== candidate.name) blocked.push('NAME_CHANGED');
      if (culture(existing.culture) !== culture(candidate.culture)) blocked.push('CULTURE_CHANGED');
      if (typeof existing.publickeytoken !== 'string' || existing.publickeytoken.toLowerCase() !== candidate.publicKeyToken) blocked.push('PUBLIC_KEY_CHANGED');
      if (!candidate.signed || !/^[a-f0-9]{16}$/.test(candidate.publicKeyToken)) blocked.push('STRONG_NAME_REQUIRED');
      const oldVersion = version(existing.version), newVersion = version(candidate.version);
      if (oldVersion[0] !== newVersion[0] || oldVersion[1] !== newVersion[1]) blocked.push('MAJOR_MINOR_REQUIRES_SIDE_BY_SIDE');
      else if (newVersion[2] < oldVersion[2] || (newVersion[2] === oldVersion[2] && newVersion[3] < oldVersion[3])) blocked.push('VERSION_DOWNGRADE');
      if (!candidate.ilOnly || !candidate.library || candidate.machine !== 'I386' || candidate.requires32Bit || candidate.nativeImports) blocked.push('ANYCPU_MANAGED_DLL_REQUIRED');
      if (!['.NETFramework,Version=v4.6.2','.NETFramework,Version=v4.7','.NETFramework,Version=v4.7.1','.NETFramework,Version=v4.7.2','.NETFramework,Version=v4.8'].includes(candidate.framework ?? '')) blocked.push('TARGET_FRAMEWORK_UNSUPPORTED');
      if (original.framework !== candidate.framework) blocked.push('TARGET_FRAMEWORK_CHANGED');
      if (hash(original.references) !== hash(candidate.references)) blocked.push('ASSEMBLY_REFERENCES_CHANGED');
      if (!registered.length || registered.some(item => item.workflow !== false) || candidate.types.some(item => item.workflow)) blocked.push('PLUGIN_ONLY_TYPES_REQUIRED');
      if (registered.some(item => item.version !== original.version || item.culture !== culture(original.culture) || item.publicKeyToken !== original.publicKeyToken)) blocked.push('REGISTERED_TYPE_IDENTITY_MISMATCH');
      if (candidate.types.some(item => item.unresolvedInheritance || (item.nested && (item.plugin || item.workflow)))) blocked.push('UNRESOLVED_OR_NESTED_CONTRACT');
      const contracts = candidate.types.filter(item => item.concrete && !item.generic && !item.nested && item.plugin && !item.workflow).map(item => item.name).sort();
      const names = registered.map(item => item.name).sort();
      if (hash(contracts) !== hash(names)) blocked.push('REGISTERED_TYPE_SET_CHANGED_OR_UNRESOLVED');
      const noChange = assemblyHash(oldBytes) === assemblyHash(bytes);
      const supportsConcurrency = concurrency.IsOptimisticConcurrencyEnabled === true;
      const match = supportsConcurrency ? suppliedMatch ?? etag(existing['@odata.etag'] ?? undefined) : allow && !suppliedMatch ? '*' : undefined;
      if (!noChange) {
        if (!supportsConcurrency && (!allow || suppliedMatch)) blocked.push('CONCURRENCY_UNSUPPORTED');
        else if (!match) blocked.push('ETAG_REQUIRED');
        else if (suppliedMatch && existing['@odata.etag'] && suppliedMatch !== existing['@odata.etag']) blocked.push('ETAG_CONFLICT');
      }
      const baseline = hash({environment:this.environment,id,existing,packageId:stored._packageid_value ?? null,
        storedHash:assemblyHash(oldBytes),candidateHash:assemblyHash(bytes),registered});
      const preview = {success:true,dryRun:true,saved:false,assemblyId:id,environment:this.environment,existing,
        candidate:summary(candidate,bytes),registeredTypes:registered,fingerprint:baseline,noChange,
        canWrite:!blocked.length,blockedBy:blocked,concurrencyProtected:supportsConcurrency,ifMatch:match ?? null,
        note:'Static preflight does not validate IL behavior, cryptographic signatures, dependency availability, platform permission or runtime execution. No parent/type lock is acquired.'};
      if (dryRun) return preview;
      if (input.expected_fingerprint !== baseline) assemblyError('PREVIEW_CHANGED','Run a fresh preview and supply its fingerprint before updating.');
      if (blocked.length) throw new PluginStepError('D365_ASSEMBLY_UPDATE_BLOCKED','The assembly update failed compatibility/concurrency preflight. No write was sent.',{assemblyId:id,blockedBy:blocked});
      if (noChange) return {...preview,dryRun:false,noChange:true};
      if (signal?.aborted) assemblyError('CANCELLED','The assembly operation was cancelled before updating.');
      const state:Row = {assemblyId:id,saved:false,readbackConfirmed:false,sha256:assemblyHash(bytes)};
      try {
        await this.client.requestWithResponse('/pluginassemblies(' + id + ')','PATCH',{content:bytes.toString('base64'),version:candidate.version},{signal,headers:{'If-Match':match!}});
        state.saved = true; CacheService.flushExisting();
      } catch (error) {
        state.saved = ['not_sent','rejected'].includes(evidence(error).outcome ?? '') ? false : 'unknown';
        throw new PluginStepError('D365_ASSEMBLY_WRITE_FAILED','The assembly update failed; no automatic replay was attempted.',{...state,phase:'write'},evidence(error));
      }
      try {
        const actual = await this.get(endpoint,signal);
        if (guid(actual[ID]) !== id || assemblyHash(decodeAssembly(actual.content)) !== state.sha256 || !identityMatches(actual,candidate)
          || actual.sourcetype !== existing.sourcetype || actual.isolationmode !== existing.isolationmode
          || (actual._packageid_value ?? null) !== (stored._packageid_value ?? null)) assemblyError('READBACK_MISMATCH','The saved assembly does not match the submitted binary and identity.');
        const types = await this.registeredTypes(id,signal);
        const stable = (values:Row[]) => values.map(item => ({id:item.id,name:item.name,workflow:item.workflow}));
        if (hash(stable(types)) !== hash(stable(registered)) || types.some(item => item.version !== candidate.version
          || item.culture !== culture(candidate.culture) || item.publicKeyToken !== candidate.publicKeyToken)) assemblyError('READBACK_MISMATCH','The registered types do not preserve their IDs/names and the saved assembly identity.');
        return {success:true,...state,readbackConfirmed:true,item:this.project(actual),registeredTypes:types,concurrencyProtected:supportsConcurrency};
      } catch (error) {
        throw new PluginStepError('D365_ASSEMBLY_READBACK_FAILED','The update was saved, but binary/identity/type readback was not confirmed.',
          {...state,phase:'readback',cause:error instanceof CrmRequestError ? error.code : 'D365_PLUGIN_REQUEST_FAILED'},evidence(error));
      }
    });
  }
}
