import {CrmRequestError} from '../errors.js';
import {CacheService} from './cache.js';
import {ModelStructureService} from './modelStructure.js';
import {ModelMetadataError,NS,args,allowed,columnKind,definition,fail,flag,hash,integer,issue,labels,logical,name,nativeOptions,type Row} from './modelMetadata.js';

const aliases:Record<string,string> = {isAuditEnabled:'is_audit_enabled',isValidForAdvancedFind:'is_valid_for_advanced_find',entity1Menu:'entity_1_menu',entity2Menu:'entity_2_menu'};
const controls = ['solution_unique_name','dry_run','expected_hash','allow_unprotected_write'];
function input(value:unknown,keys:string[]):Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID','Expected maintenance arguments.');
  if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024) fail('INVALID','Maintenance arguments exceed 2 MiB.');
  const normalized:Row = {};
  for (const [key,item] of Object.entries(value)) {
    if (item === undefined) continue;
    const target = aliases[key] ?? key;
    if (Object.hasOwn(normalized,target) && hash(normalized[target]) !== hash(item)) fail('INVALID','Conflicting maintenance aliases.');
    normalized[target] = item;
  }
  return args(normalized,keys);
}
function stable(value:any):any {
  return Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'HasChanged').map(([key,value]) =>
      [key,key === 'LocalizedLabels' && Array.isArray(value) ? value.map(stable).sort((left,right) => left.LanguageCode - right.LanguageCode) : stable(value)])) : value;
}
function same(left:unknown,right:unknown):boolean { return hash(stable(left) ?? null) === hash(stable(right) ?? null); }
function managedValue(current:Row,key:string,value:unknown):Row {
  if (!current[key] || current[key].CanBeChanged !== true) fail('MANAGED_PROPERTY','The requested setting is not confirmed changeable.',{property:key});
  return {...current[key],Value:value};
}
function virtualGuard(table:Row):void {
  allowed(table,'IsCustomizable');
  if (table.DataProviderId && table.DataProviderId !== '00000000-0000-0000-0000-000000000000') fail('UNSUPPORTED','Provider-backed/virtual table maintenance is outside this scope.');
}
function fullLabel(current:unknown,changes:unknown):Row {
  const wanted = labels(changes,'display_name');
  if (!current || typeof current !== 'object' || !Array.isArray((current as Row).LocalizedLabels)) fail('RESPONSE_INVALID','Existing menu labels are incomplete.');
  const result = structuredClone(current) as Row;
  const codes = new Set<number>();
  for (const label of result.LocalizedLabels) {
    if (!Number.isInteger(label.LanguageCode) || typeof label.Label !== 'string' || codes.has(label.LanguageCode)) fail('RESPONSE_INVALID','Existing menu labels are invalid.');
    codes.add(label.LanguageCode);
  }
  for (const next of wanted.LocalizedLabels) {
    const existing = result.LocalizedLabels.find((item:Row) => item.LanguageCode === next.LanguageCode);
    if (existing) existing.Label = next.Label; else result.LocalizedLabels.push(next);
  }
  return result;
}

/** Conservative existing-component maintenance, separate from create/labels/publish. */
export class ModelMaintenanceService extends ModelStructureService {
  private review(a:Row,planHash:string,dry:boolean):void {
    if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('INVALID','expected_hash must be a preview planHash.');
    if (a.expected_hash !== undefined && a.expected_hash !== planHash) fail('CONFLICT','The maintenance plan changed; preview it again.',{planHash});
    if (!dry && (!a.expected_hash || !flag(a.allow_unprotected_write,'allow_unprotected_write'))) fail('CONCURRENCY','Execution requires the current preview planHash as expected_hash and allow_unprotected_write=true. Native metadata PUT/actions have no confirmed atomic protection.');
  }
  private async savePlan(a:Row,state:Row,body:Row,readback:()=>Promise<Row>,verify:(actual:Row)=>boolean,signal?:AbortSignal):Promise<Row> {
    const dry = flag(a.dry_run,'dry_run',true);
    flag(a.allow_unprotected_write,'allow_unprotected_write');
    this.review(a,state.planHash,dry);
    if (dry) return {...state,dryRun:true,saved:false,request:{method:'PUT',path:state.path,headers:state.headers,body},platformValidation:'not_executed'};
    if (!Object.keys(state.changes).length) return {...state,dryRun:false,saved:false,noChange:true};
    await this.write(state.path,'PUT',body,state.headers,state,signal);
    try {
      const actual = await readback();
      if (!verify(actual)) throw new ModelMetadataError('D365_MODEL_READBACK_MISMATCH','The metadata was saved, but readback differs from the reviewed changes.',{...state,saved:true,readback:{status:'mismatch'}});
      return {...state,dryRun:false,saved:true,readback:{status:'matched',metadataId:actual.MetadataId},modelDrivenUi:'not_verified'};
    } catch (error) {
      if (error instanceof ModelMetadataError && error.code === 'D365_MODEL_READBACK_MISMATCH') throw error;
      throw new ModelMetadataError('D365_MODEL_READBACK_FAILED','The metadata was saved, but readback was not confirmed. Do not replay the write.',
        {...state,saved:true,readback:{status:'failed',issue:issue(error)}});
    }
  }
  async updateColumn(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = input(raw,['logical_name','attribute_name','patch',...controls]);
    const patch = input(a.patch,['max_length','min_value','max_value','precision','required_level','default_value','format','is_audit_enabled','is_valid_for_advanced_find']);
    if (!Object.keys(patch).length) fail('INVALID','A non-empty field settings patch is required.');
    logical(a.attribute_name,'attribute_name');
    const target = await this.target(a,signal),current = target.metadata,kind = columnKind(current);
    virtualGuard(target.tableMeta); allowed(current,'IsCustomizable');
    if (current.IsManaged !== false || current.IsCustomAttribute !== true || current.IsPrimaryId !== false || current.IsPrimaryName !== false
      || current.IsLogical !== false || current.SourceType !== 0 || current.AttributeOf != null || current.AutoNumberFormat) fail('UNSUPPORTED','Only ordinary unmanaged custom columns with confirmed simple storage are supported.');
    const solution = await this.solution(a.solution_unique_name,signal);
    this.prefixed(current.SchemaName,solution.prefix,'existing column schema');
    const body = structuredClone(current),changes:Row = {};
    const set = (key:string,value:unknown) => { if (!same(current[key],value)) { body[key] = value; changes[key] = {before:current[key] ?? null,after:value}; } };
    for (const [key,types] of Object.entries({max_length:['String','Memo'],min_value:['Integer','Decimal','Money'],max_value:['Integer','Decimal','Money'],
      precision:['Decimal','Money'],default_value:['Boolean','Picklist'],format:['DateTime']})) {
      if (patch[key] !== undefined && !types.includes(kind)) fail('INVALID','A setting does not apply to the current column type.',{setting:key,type:kind});
    }
    if (patch.required_level !== undefined) {
      if (!['None','Recommended','ApplicationRequired'].includes(patch.required_level) || !['None','Recommended','ApplicationRequired'].includes(current.RequiredLevel?.Value)) fail('INVALID','System-required or unknown requirement levels cannot be changed.');
      set('RequiredLevel',managedValue(current,'RequiredLevel',patch.required_level));
    }
    for (const [key,field] of [['is_audit_enabled','IsAuditEnabled'],['is_valid_for_advanced_find','IsValidForAdvancedFind']]) {
      if (patch[key] !== undefined) set(field,managedValue(current,field,flag(patch[key],key)));
    }
    if (Object.keys(patch).some(key => !['required_level','is_audit_enabled','is_valid_for_advanced_find'].includes(key))) allowed(current,'CanModifyAdditionalSettings');
    if (patch.max_length !== undefined) {
      const max = kind === 'String' ? 4000 : 1048576,next = integer(patch.max_length,'max_length',0,1,max);
      if (!Number.isInteger(current.MaxLength) || current.MaxLength < 1 || current.MaxLength > max) fail('RESPONSE_INVALID','The current text length is invalid.');
      if (next < current.MaxLength) fail('DATA_RESTRICTION','Text length reductions require a separate data assessment and are not supported.');
      set('MaxLength',next);
    }
    if (patch.min_value !== undefined || patch.max_value !== undefined) {
      const min = kind === 'Integer' ? -2147483648 : -100000000000,max = kind === 'Integer' ? 2147483647 : 100000000000;
      const valid = (value:unknown) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (kind !== 'Integer' || Number.isInteger(value));
      if (!valid(current.MinValue) || !valid(current.MaxValue) || current.MinValue > current.MaxValue) fail('RESPONSE_INVALID','The current numeric range is unavailable or outside the supported scope.');
      const low = patch.min_value === undefined ? current.MinValue : patch.min_value,high = patch.max_value === undefined ? current.MaxValue : patch.max_value;
      if (!valid(low) || !valid(high) || low > high) fail('INVALID','Invalid numeric settings range.');
      if (low > current.MinValue || high < current.MaxValue) fail('DATA_RESTRICTION','Narrowing an existing numeric range is not supported.');
      if (patch.min_value !== undefined) set('MinValue',low);
      if (patch.max_value !== undefined) set('MaxValue',high);
    }
    if (patch.precision !== undefined) {
      const max = kind === 'Money' ? 4 : 10,next = integer(patch.precision,'precision',0,0,max);
      if (!Number.isInteger(current.Precision) || current.Precision < 0 || current.Precision > max) fail('RESPONSE_INVALID','The current precision is unavailable.');
      if (kind === 'Money' && current.PrecisionSource !== 0) fail('UNSUPPORTED','Currency/organization-derived precision cannot be changed through column precision.');
      if (next < current.Precision) fail('DATA_RESTRICTION','Precision reductions are not supported.');
      set('Precision',next);
    }
    if (patch.default_value !== undefined) {
      if (kind === 'Boolean') set('DefaultValue',flag(patch.default_value,'default_value'));
      else {
        const value = integer(patch.default_value,'default_value',0,0,2147483647);
        if (!nativeOptions(current.OptionSet).some(option => option.Value === value)) fail('INVALID','The default must be an existing option value.');
        set('DefaultFormValue',value);
      }
    }
    if (patch.format !== undefined) {
      if (!['DateOnly','DateAndTime'].includes(patch.format) || !['DateOnly','DateAndTime'].includes(current.Format)
        || !['UserLocal','DateOnly','TimeZoneIndependent'].includes(current.DateTimeBehavior?.Value)
        || current.DateTimeBehavior.Value === 'DateOnly' && patch.format !== 'DateOnly') fail('INVALID','The display format is incompatible with the existing date behavior.');
      set('Format',patch.format);
    }
    const safeBody = definition(body),path = target.path,headers = {'MSCRM.MergeLabels':'true','MSCRM.SolutionUniqueName':solution.uniqueName};
    const state = {environment:this.environment,operation:'update_column_settings',path,headers,logicalName:target.table,attributeName:target.field,type:kind,solution,
      publication:'not_requested',concurrency:'unprotected_native_put',changes,definitionHash:hash(current),
      planHash:hash({operation:'update_column_settings',environment:this.environment,solution,current,body:safeBody,parent:target.tableMeta}),
      existingDataValidation:'not_scanned',auditEffectiveness:'requires_table_and_environment_auditing',requirementValidation:'platform_and_client_specific'};
    const preserved = ['MetadataId','LogicalName','SchemaName','EntityLogicalName','AttributeType','AttributeTypeName','SourceType','AttributeOf',
      'IsManaged','IsCustomAttribute','IsPrimaryId','IsPrimaryName','IsLogical','AutoNumberFormat','DisplayName','Description','OptionSet','DateTimeBehavior','PrecisionSource',
      'MaxLength','MinValue','MaxValue','Precision','RequiredLevel','DefaultValue','DefaultFormValue','Format','IsAuditEnabled','IsValidForAdvancedFind'];
    return this.savePlan(a,state,safeBody,async () => (await this.target(a,signal)).metadata,actual =>
      Object.keys(changes).every(key => same(actual[key],safeBody[key])) && preserved.every(key => same(actual[key],safeBody[key])),signal);
  }
  private menu(current:unknown,raw:unknown):Row {
    if (!current || typeof current !== 'object' || Array.isArray(current) || (current as Row).IsCustomizable !== true) fail('MANAGED_PROPERTY','The relationship menu is not confirmed customizable.');
    const patch = input(raw,['behavior','group','order','label']);
    if (!Object.keys(patch).length) fail('INVALID','A menu patch must not be empty.');
    const result = structuredClone(current) as Row;
    for (const [key,field,options] of [['behavior','Behavior',['UseCollectionName','UseLabel','DoNotDisplay']],['group','Group',['Details','Sales','Service','Marketing']]] as const) {
      if (patch[key] !== undefined) { if (!(options as readonly unknown[]).includes(patch[key])) fail('INVALID','Invalid relationship menu setting.'); result[field] = patch[key]; }
    }
    if (patch.order !== undefined) result.Order = integer(patch.order,'order',0,0,2147483647);
    if (patch.label !== undefined) result.Label = fullLabel(result.Label,patch.label);
    if (result.Behavior === 'UseLabel' && (!result.Label?.LocalizedLabels?.length || !result.Label.LocalizedLabels.some((item:Row) => typeof item.Label === 'string' && item.Label.trim()))) fail('INVALID','UseLabel requires a non-empty localized label.');
    return result;
  }
  async updateRelationship(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = input(raw,['schema_name','patch',...controls]),schema = name(a.schema_name,'schema_name');
    const patch = input(a.patch,['menu','entity_1_menu','entity_2_menu','cascade']);
    if (!Object.keys(patch).length) fail('INVALID','A relationship patch must not be empty.');
    const current = await this.relationship(schema,signal);
    if (current.IsManaged !== false || current.IsCustomRelationship !== true) fail('UNSUPPORTED','Only confirmed unmanaged custom relationships can be maintained.');
    allowed(current,'IsCustomizable');
    const kind = [0,'OneToManyRelationship'].includes(current.RelationshipType) ? 'OneToMany' : 'ManyToMany';
    const tables = kind === 'OneToMany' ? [current.ReferencedEntity,current.ReferencingEntity] : [current.Entity1LogicalName,current.Entity2LogicalName];
    const parents:Row[] = [];
    for (const table of [...new Set(tables)]) { const metadata = await this.tableMetadata(logical(table,'relationship table'),signal); virtualGuard(metadata); parents.push(metadata); }
    const solution = await this.solution(a.solution_unique_name,signal); this.prefixed(current.SchemaName,solution.prefix,'existing relationship schema');
    if (Object.keys(patch).some(key => kind === 'OneToMany' ? !['menu','cascade'].includes(key) : !['entity_1_menu','entity_2_menu'].includes(key))) fail('INVALID','A patch setting does not apply to this relationship type.');
    const body = structuredClone(current),changes:Row = {};
    for (const [key,field] of [['menu','AssociatedMenuConfiguration'],['entity_1_menu','Entity1AssociatedMenuConfiguration'],['entity_2_menu','Entity2AssociatedMenuConfiguration']]) {
      if (patch[key] === undefined) continue;
      const next = this.menu(current[field],patch[key]);
      if (!same(next,current[field])) { body[field] = next; changes[field] = {before:current[field],after:next}; }
    }
    if (patch.cascade !== undefined) {
      if (!current.CascadeConfiguration || typeof current.CascadeConfiguration !== 'object') fail('RESPONSE_INVALID','The existing cascade configuration is incomplete.');
      const cascade = input(patch.cascade,['assign','delete','merge','reparent','share','unshare']);
      if (!Object.keys(cascade).length) fail('INVALID','A cascade patch must not be empty.');
      const next = structuredClone(current.CascadeConfiguration);
      for (const [key,value] of Object.entries(cascade)) {
        const options = key === 'delete' ? ['Restrict','RemoveLink','Cascade'] : ['NoCascade','Cascade'];
        if (!options.includes(value)) fail('INVALID','Unsupported cascade setting.');
        const field = key[0].toUpperCase() + key.slice(1);
        if (typeof next[field] !== 'string') fail('RESPONSE_INVALID','An existing cascade value is missing.');
        next[field] = value;
      }
      if (!same(next,current.CascadeConfiguration)) { body.CascadeConfiguration = next; changes.CascadeConfiguration = {before:current.CascadeConfiguration,after:next}; }
    }
    body['@odata.type'] = NS + kind + 'RelationshipMetadata';
    const safeBody = definition(body),path = '/RelationshipDefinitions(' + current.MetadataId + ')',headers = {'MSCRM.MergeLabels':'true','MSCRM.SolutionUniqueName':solution.uniqueName};
    const state = {environment:this.environment,operation:'update_relationship',schemaName:schema,type:kind,path,headers,solution,changes,
      publication:'not_requested',concurrency:'unprotected_native_put',definitionHash:hash(current),
      planHash:hash({operation:'update_relationship',environment:this.environment,solution,current,body:safeBody,parents}),
      cascadeImpact:patch.cascade ? 'future_platform_operations_may_change_related_record_deletion_ownership_or_access' : 'not_changed',
      platformRelationshipRules:'not_executed',publicationTables:[...new Set(tables)]};
    const preserved = ['MetadataId','SchemaName','RelationshipType','IsManaged','IsCustomRelationship','IsCustomizable',
      'ReferencedEntity','ReferencedAttribute','ReferencingEntity','ReferencingAttribute','Entity1LogicalName','Entity2LogicalName','IntersectEntityName'];
    const settings = ['AssociatedMenuConfiguration','Entity1AssociatedMenuConfiguration','Entity2AssociatedMenuConfiguration','CascadeConfiguration'];
    return this.savePlan(a,state,safeBody,() => this.relationship(schema,signal),actual =>
      [...preserved,...settings].every(key => same(actual[key],safeBody[key])),signal);
  }
  async reactivateKey(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = input(raw,['logical_name','schema_name',...controls]),table = logical(a.logical_name,'logical_name'),schema = name(a.schema_name,'schema_name');
    const dry = flag(a.dry_run,'dry_run',true); flag(a.allow_unprotected_write,'allow_unprotected_write');
    const parent = await this.tableMetadata(table,signal); virtualGuard(parent);
    const solution = await this.solution(a.solution_unique_name,signal); this.prefixed(schema,solution.prefix,'key schema');
    const key = (await this.keys(table,signal)).find(item => item.SchemaName.toLowerCase() === schema.toLowerCase());
    if (!key) fail('NOT_FOUND','The alternate key was not returned.');
    allowed(key,'IsCustomizable');
    if (key.IsManaged !== false || key.EntityLogicalName !== table) fail('UNSUPPORTED','Only a confirmed unmanaged key on the selected table can be reactivated.');
    const keyName = logical(key.LogicalName,'native key logical name'),index = this.keyState(key),body = {EntityKeyLogicalName:keyName,EntityLogicalName:table};
    const state = {environment:this.environment,operation:'reactivate_key',logicalName:table,schemaName:key.SchemaName,metadataId:key.MetadataId,solution,
      submitted:false,previousIndex:index,concurrency:'unprotected_native_action',publication:'not_requested',
      planHash:hash({operation:'reactivate_key',environment:this.environment,parent,key,solution}),
      indexFailureCause:'not_corrected_by_this_action',existingDataValidation:'not_scanned',canSubmit:index.status === 'Failed',blockedBy:index.status === 'Failed' ? null : 'INDEX_NOT_FAILED'};
    this.review(a,state.planHash,dry);
    if (dry) return {...state,dryRun:true,request:{method:'POST',path:'/ReactivateEntityKey',body},note:'Submits a new asynchronous index job; action acceptance does not mean the key is Active.'};
    if (!state.canSubmit) fail('KEY_STATE','Only a Failed key index may be reactivated by this tool.',{index});
    try {
      const response = await this.request('/ReactivateEntityKey','POST',body,{},signal);
      if (response.status < 200 || response.status >= 300) throw new CrmRequestError('D365_MODEL_RESPONSE_INVALID','Unexpected Action response.',{outcome:'unknown'});
      CacheService.flushExisting();
    } catch (error) {
      const outcome = error instanceof CrmRequestError ? error.details.outcome ?? 'unknown' : 'unknown';
      throw new ModelMetadataError('D365_MODEL_KEY_REACTIVATE_FAILED','The index submission was not confirmed. An unknown submission must not be replayed.',
        {...state,submitted:outcome === 'unknown' ? null : false,canSubmit:false,phase:'submit',issue:issue(error)},{outcome});
    }
    try {
      const actual = (await this.keys(table,signal)).find(item => item.MetadataId.toLowerCase() === key.MetadataId.toLowerCase());
      if (!actual || actual.LogicalName !== key.LogicalName || actual.SchemaName !== key.SchemaName || actual.EntityLogicalName !== table || !same(actual.KeyAttributes,key.KeyAttributes)) fail('READBACK_MISMATCH','The alternate key identity or columns changed after submission.');
      const next = this.keyState(actual),newJob = !!next.asyncJobId && next.asyncJobId !== '00000000-0000-0000-0000-000000000000' && next.asyncJobId.toLowerCase() !== index.asyncJobId?.toLowerCase();
      const result = {...state,submitted:true,canSubmit:false,dryRun:false,index:next,jobLinkConfirmed:newJob,readback:{status:'observed'},
        nextAction:'Inspect get_model_key; do not repeat submission merely because the previous job/state is still visible.',
        operationStatus:newJob ? next.status === 'Active' ? 'index_active' : next.status === 'Failed' ? 'index_failed' : 'job_observed' : 'accepted_new_job_not_confirmed'};
      if (newJob && next.status === 'Failed') throw new ModelMetadataError('D365_MODEL_KEY_INDEX_FAILED','The new index job was submitted, but the observed index is Failed. No additional submission was attempted.',result);
      return result;
    } catch (error) {
      if (error instanceof ModelMetadataError && error.code === 'D365_MODEL_KEY_INDEX_FAILED') throw error;
      throw new ModelMetadataError('D365_MODEL_KEY_REACTIVATE_READBACK_FAILED','The Action was accepted, but key readback was not confirmed. Do not repeat submission.',
        {...state,submitted:true,canSubmit:false,phase:'readback',issue:issue(error)});
    }
  }
}
