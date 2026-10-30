import { CrmRequestError } from '../errors.js';
import { ModelMetadataService,ModelMetadataError,NS,args,allowed,definition,fail,fieldPath,flag,issue,labels,logical,name,tablePath,type Row } from './modelMetadata.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_TYPES = ['String','Integer','Decimal','DateTime','Lookup','Picklist'];
const STATE_NAMES = ['Pending','InProgress','Active','Failed'];
const MENU = {Behavior:'UseCollectionName',Group:'Details',Order:10000};
function nativeId(value:unknown):string {
  if (typeof value !== 'string' || !GUID.test(value)) fail('RESPONSE_INVALID','A native metadata identifier was missing or invalid.');
  return value.toLowerCase();
}
function relationType(row:Row):'OneToMany'|'ManyToMany' {
  if ([0,'OneToManyRelationship'].includes(row.RelationshipType)) return 'OneToMany';
  if ([1,'ManyToManyRelationship'].includes(row.RelationshipType)) return 'ManyToMany';
  fail('RESPONSE_INVALID','Native relationship type was unavailable or unsupported.');
}
function keyFields(value:unknown):string[] {
  if (!Array.isArray(value) || !value.length || value.length > 16) fail('INVALID','key_attributes must contain 1–16 distinct logical names.');
  const fields = value.map(value => logical(value,'key_attributes'));
  if (new Set(fields).size !== fields.length) fail('INVALID','Duplicate key column.');
  return fields;
}
function cascade(value:unknown):Row {
  const input = value === undefined ? {} : args(value,['assign','delete','merge','reparent','share','unshare']);
  const result:Row = {};
  for (const field of ['assign','delete','merge','reparent','share','unshare']) {
    const options = field === 'delete' ? ['Restrict','RemoveLink','Cascade'] : ['NoCascade','Cascade'];
    const selected = input[field] ?? (field === 'delete' ? 'Restrict' : 'NoCascade');
    if (!options.includes(selected)) fail('INVALID','Unsupported cascade setting for ' + field);
    result[field[0].toUpperCase() + field.slice(1)] = selected;
  }
  return result;
}
function subset(actual:any,wanted:any):boolean {
  if (Array.isArray(wanted)) return Array.isArray(actual) && wanted.every((item,index) =>
    subset(item?.LanguageCode === undefined ? actual[index] : actual.find(row => row?.LanguageCode === item.LanguageCode),item));
  if (wanted && typeof wanted === 'object') return !!actual && typeof actual === 'object' &&
    Object.entries(wanted).every(([key,value]) => key === '@odata.type' || subset(actual[key],value));
  return actual === wanted;
}

export class ModelStructureService extends ModelMetadataService {
  protected async tableMetadata(table:string,signal?:AbortSignal):Promise<Row> {
    const row = definition(await this.read(tablePath(table),signal)); this.identity(row,table); return row;
  }
  private async eligibility(action:'CanBeReferenced'|'CanBeReferencing'|'CanManyToMany',table:string,signal?:AbortSignal) {
    let response;
    try { response = await this.request('/' + action,'POST',{EntityName:table},{},signal); }
    catch (error) {
      if (error instanceof CrmRequestError && (error.code === 'D365_REQUEST_ABORTED' || error.details.status === 401)) throw error;
      throw new ModelMetadataError('D365_MODEL_ELIGIBILITY_UNAVAILABLE','The native read-only relationship eligibility check failed; no schema write was sent.',
        {action,table,issue:issue(error)},{outcome:'not_sent'});
    }
    if (response.status !== 200 || typeof response.data?.[action] !== 'boolean') fail('RESPONSE_INVALID','The native eligibility response was incomplete.');
    if (!response.data[action]) fail('RELATIONSHIP_INELIGIBLE','The platform disallows the requested relationship participation.',{action,table});
    return {action,table,eligible:true};
  }
  protected async relationship(schema:string,signal?:AbortSignal):Promise<Row> {
    const rows = await this.rows('/RelationshipDefinitions?' + new URLSearchParams({$select:'MetadataId,SchemaName,RelationshipType',$filter:`SchemaName eq '${schema}'`}),signal);
    if (!rows.length) fail('NOT_FOUND','The requested relationship was not returned.');
    const base = rows[0],id = nativeId(base.MetadataId),type = relationType(base);
    const row = definition(await this.read(`/RelationshipDefinitions(${id})/${NS}${type}RelationshipMetadata`,signal));
    if (nativeId(row.MetadataId) !== id || typeof row.SchemaName !== 'string' || row.SchemaName.toLowerCase() !== schema.toLowerCase() || relationType(row) !== type) fail('RESPONSE_INVALID','The relationship readback identity/type did not match.');
    return row;
  }
  async getRelationship(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['schema_name']),schema = name(a.schema_name,'schema_name');
    const row = await this.relationship(schema,signal);
    return {environment:this.environment,definition:row,publication:'not_determined'};
  }
  async createRelationship(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['type','schema_name','referenced_entity','referencing_entity','lookup','cascade','entity_1','entity_2','intersect_entity_name','solution_unique_name','dry_run']);
    const dry = flag(a.dry_run,'dry_run',true);
    if (!['one_to_many','many_to_many'].includes(a.type)) fail('INVALID','type must be one_to_many or many_to_many.');
    const solution = await this.solution(a.solution_unique_name,signal);
    const schema = this.prefixed(a.schema_name,solution.prefix,'schema_name');
    const body:Row = {SchemaName:schema};
    const eligibility:Row[] = [],tables:string[] = [];
    if (a.type === 'one_to_many') {
      if (['entity_1','entity_2','intersect_entity_name'].some(key => a[key] !== undefined)) fail('INVALID','Many-to-many settings do not apply to one-to-many relationships.');
      const parent = logical(a.referenced_entity,'referenced_entity'),child = logical(a.referencing_entity,'referencing_entity');
      const lookup = args(a.lookup,['schema_name','display_name','description','required_level']);
      const fieldSchema = this.prefixed(lookup.schema_name,solution.prefix,'lookup.schema_name'),field = fieldSchema.toLowerCase();
      const required = lookup.required_level ?? 'None';
      if (!['None','Recommended','ApplicationRequired'].includes(required)) fail('INVALID','Invalid lookup required_level.');
      const parentMeta = await this.tableMetadata(parent,signal),childMeta = parent === child ? parentMeta : await this.tableMetadata(child,signal);
      allowed(parentMeta,'IsCustomizable'); allowed(parentMeta,'CanBePrimaryEntityInRelationship');
      allowed(childMeta,'IsCustomizable'); allowed(childMeta,'CanBeRelatedEntityInRelationship'); allowed(childMeta,'CanCreateAttributes');
      const primary = logical(parentMeta.PrimaryIdAttribute,'native primary ID');
      if ((await this.rows(tablePath(child) + '/Attributes?' + new URLSearchParams({$select:'MetadataId,LogicalName',$filter:`LogicalName eq '${field}'`}),signal)).length) fail('EXISTS','The Lookup logical name already exists; no relationship was created.');
      body['@odata.type'] = NS + 'OneToManyRelationshipMetadata';
      Object.assign(body,{ReferencedEntity:parent,ReferencedAttribute:primary,ReferencingEntity:child,
        AssociatedMenuConfiguration:{...MENU},CascadeConfiguration:cascade(a.cascade),
        Lookup:{'@odata.type':NS + 'LookupAttributeMetadata',AttributeType:'Lookup',AttributeTypeName:{Value:'LookupType'},SchemaName:fieldSchema,
          DisplayName:labels(lookup.display_name,'display_name'),RequiredLevel:{Value:required},
          ...(lookup.description === undefined ? {} : {Description:labels(lookup.description,'description')})}});
      eligibility.push(await this.eligibility('CanBeReferenced',parent,signal),await this.eligibility('CanBeReferencing',child,signal));
      tables.push(parent,child);
    } else {
      if (['referenced_entity','referencing_entity','lookup','cascade'].some(key => a[key] !== undefined)) fail('INVALID','One-to-many settings do not apply to many-to-many relationships.');
      const entity1 = logical(a.entity_1,'entity_1'),entity2 = logical(a.entity_2,'entity_2');
      if (entity1 === entity2) fail('UNSUPPORTED','Self-referential many-to-many relationships require navigation configuration not exposed by this tool.');
      const intersect = this.prefixed(a.intersect_entity_name ?? schema,solution.prefix,'intersect_entity_name').toLowerCase();
      for (const table of [entity1,entity2]) {
        const meta = await this.tableMetadata(table,signal); allowed(meta,'IsCustomizable'); allowed(meta,'CanBeInManyToMany');
        eligibility.push(await this.eligibility('CanManyToMany',table,signal));
      }
      if ((await this.rows('/EntityDefinitions?' + new URLSearchParams({$select:'MetadataId,LogicalName',$filter:`LogicalName eq '${intersect}'`}),signal)).length) fail('EXISTS','The requested intersect table name already exists.');
      Object.assign(body,{'@odata.type':NS + 'ManyToManyRelationshipMetadata',Entity1LogicalName:entity1,Entity2LogicalName:entity2,
        IntersectEntityName:intersect,Entity1AssociatedMenuConfiguration:{...MENU},Entity2AssociatedMenuConfiguration:{...MENU}});
      tables.push(entity1,entity2);
    }
    if ((await this.rows('/RelationshipDefinitions?' + new URLSearchParams({$select:'MetadataId,SchemaName',$filter:`SchemaName eq '${schema}'`}),signal)).length) fail('EXISTS','The relationship schema name already exists; creation is not an upsert.');
    const headers = {'MSCRM.SolutionUniqueName':solution.uniqueName};
    const state = {environment:this.environment,operation:'create_relationship',schemaName:schema,solution,eligibility,
      publication:'not_requested',tablesToReviewForPublication:[...new Set(tables)],formPlacement:'not_performed'};
    if (dry) return {...state,dryRun:true,saved:false,request:{method:'POST',path:'/RelationshipDefinitions',headers,body},platformWriteValidation:'not_executed'};
    await this.write('/RelationshipDefinitions','POST',body,headers,state,signal);
    try {
      const row = await this.relationship(schema,signal);
      // Lookup is a navigation property and may not expand on all deployments. Read it separately by logical name.
      const expected = {...body}; delete expected.Lookup;
      // CRM 9.1 normalizes the 1:N merge cascade to Cascade regardless of the submitted value.
      if (expected.CascadeConfiguration) delete expected.CascadeConfiguration.Merge;
      if (!subset(row,expected)) this.mismatch(state);
      let lookupCheck:Row|undefined;
      if (body.Lookup) {
        const field = body.Lookup.SchemaName.toLowerCase(),meta = definition(await this.read(fieldPath(body.ReferencingEntity,field) + '/' + NS + 'LookupAttributeMetadata',signal));
        this.identity(meta,field);
        if (!subset(meta,body.Lookup) || row.ReferencingAttribute !== field || !Array.isArray(meta.Targets) || meta.Targets.length !== 1 || meta.Targets[0] !== body.ReferencedEntity) this.mismatch(state);
        lookupCheck = {status:'matched',logicalName:field,metadataId:meta.MetadataId};
      }
      return {...state,saved:true,readback:{status:'matched',metadataId:row.MetadataId,lookup:lookupCheck},modelDrivenUi:'not_verified'};
    } catch (error) { return this.afterSave(error,state); }
  }
  private mismatch(state:Row):never {
    throw new ModelMetadataError('D365_MODEL_READBACK_MISMATCH','The schema was saved, but native readback did not match. Inspect the component before another write.',
      {...state,saved:true,readback:{status:'mismatch'}});
  }
  private afterSave(error:unknown,state:Row):never {
    if (error instanceof ModelMetadataError && ['D365_MODEL_READBACK_MISMATCH','D365_MODEL_KEY_INDEX_FAILED'].includes(error.code)) throw error;
    throw new ModelMetadataError('D365_MODEL_READBACK_FAILED','The schema was saved, but readback did not complete. Do not repeat the create operation.',
      {...state,saved:true,readback:{status:'failed',issue:issue(error)}});
  }
  protected async keys(table:string,signal?:AbortSignal):Promise<Row[]> {
    const result = definition(await this.read(tablePath(table) + '/Keys',signal));
    if (!Array.isArray(result.value) || result.value.length > 100) fail('RESPONSE_INVALID','The key metadata collection was incomplete or exceeded its bound.');
    const ids = new Set<string>(),names = new Set<string>();
    for (const key of result.value) {
      if (!key || typeof key !== 'object' || Array.isArray(key)) fail('RESPONSE_INVALID','Invalid native key definition.');
      const id = nativeId(key.MetadataId),schema = name(key.SchemaName,'native key schema').toLowerCase();
      if (ids.has(id) || names.has(schema) || (key.EntityLogicalName !== undefined && key.EntityLogicalName !== table)) fail('RESPONSE_INVALID','Duplicate or mismatched native key definition.');
      ids.add(id); names.add(schema);
      if (!Array.isArray(key.KeyAttributes) || !key.KeyAttributes.length || key.KeyAttributes.length > 16 || key.KeyAttributes.some((field:unknown) => typeof field !== 'string' || !/^[a-z][a-z0-9_]*$/.test(field)) || new Set(key.KeyAttributes).size !== key.KeyAttributes.length) fail('RESPONSE_INVALID','Invalid native key column set.');
    }
    return result.value;
  }
  protected keyState(key:Row):Row {
    const raw = key.EntityKeyIndexStatus;
    if (raw !== undefined && raw !== null && typeof raw !== 'string' && !Number.isInteger(raw)) fail('RESPONSE_INVALID','The native key index state had an invalid type.');
    const status = Number.isInteger(raw) && raw >= 0 && raw <= 3 ? STATE_NAMES[raw] : STATE_NAMES.includes(raw) ? raw : 'Unknown';
    if (key.AsyncJob !== undefined && key.AsyncJob !== null) nativeId(key.AsyncJob);
    return {status,nativeStatus:raw ?? null,usableForAlternateKeyOperations:status === 'Active',asyncJobId:key.AsyncJob ?? null};
  }
  async getKey(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['logical_name','schema_name','include_job']),table = logical(a.logical_name,'logical_name'),schema = name(a.schema_name,'schema_name');
    const includeJob = flag(a.include_job,'include_job');
    await this.tableMetadata(table,signal);
    const key = (await this.keys(table,signal)).find(key => key.SchemaName.toLowerCase() === schema.toLowerCase());
    if (!key) fail('NOT_FOUND','The requested key was not returned.');
    const index = this.keyState(key);
    const result:Row = {environment:this.environment,logicalName:table,definition:key,index,job:{status:'not_requested'},publication:'not_determined'};
    if (includeJob) {
      if (!index.asyncJobId || index.asyncJobId === '00000000-0000-0000-0000-000000000000') result.job = {status:'not_linked'};
      else {
        try {
          const row = await this.read(`/asyncoperations(${index.asyncJobId})?$select=asyncoperationid,statecode,statuscode,errorcode,createdon,completedon`,signal);
          if (nativeId(row.asyncoperationid) !== index.asyncJobId.toLowerCase()) fail('RESPONSE_INVALID','Index job identity mismatch.');
          const data = Object.fromEntries(['asyncoperationid','statecode','statuscode','errorcode','createdon','completedon']
            .filter(key => row[key] === null || ['string','number','boolean'].includes(typeof row[key])).map(key => [key,row[key]]));
          result.job = {status:'retrieved',data};
        } catch (error) {
          if (error instanceof CrmRequestError && (error.details.status === 401 || error.code === 'D365_REQUEST_ABORTED')) throw error;
          result.job = {status:error instanceof CrmRequestError && error.details.status === 403 ? 'forbidden' : 'unavailable',issue:issue(error)};
        }
      }
    }
    return result;
  }
  async createKey(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['logical_name','schema_name','key_attributes','display_name','solution_unique_name','dry_run']);
    const dry = flag(a.dry_run,'dry_run',true),table = logical(a.logical_name,'logical_name'),fields = keyFields(a.key_attributes);
    const solution = await this.solution(a.solution_unique_name,signal),schema = this.prefixed(a.schema_name,solution.prefix,'schema_name');
    const body = {'@odata.type':NS + 'EntityKeyMetadata',SchemaName:schema,DisplayName:labels(a.display_name,'display_name'),KeyAttributes:fields};
    const parent = await this.tableMetadata(table,signal); allowed(parent,'IsCustomizable');
    if (parent.DataProviderId && parent.DataProviderId !== '00000000-0000-0000-0000-000000000000') fail('UNSUPPORTED','Alternate keys on virtual/provider-backed tables are not supported.');
    const keys = await this.keys(table,signal);
    if (keys.some(key => key.SchemaName.toLowerCase() === schema.toLowerCase() || key.KeyAttributes.length === fields.length && key.KeyAttributes.every((field:string) => fields.includes(field)))) fail('EXISTS','A key with this schema name or the same column set already exists; its index state must be inspected.');
    if (keys.length >= 10) fail('KEY_LIMIT','This tool supports at most ten keys per table.');
    const checked:Row[] = [];
    for (const field of fields) {
      const column = definition(await this.read(fieldPath(table,field),signal)); this.identity(column,field);
      if (!KEY_TYPES.includes(column.AttributeType)) fail('UNSUPPORTED','A key column has an unsupported native type.',{field,type:column.AttributeType});
      if (column.IsSecured !== false) fail('KEY_FIELD_SECURITY','Key columns must explicitly have field security disabled.',{field});
      checked.push({logicalName:field,type:column.AttributeType,fieldSecurity:false});
    }
    const path = tablePath(table) + '/Keys',headers = {'MSCRM.SolutionUniqueName':solution.uniqueName};
    const state = {environment:this.environment,operation:'create_key',logicalName:table,schemaName:schema,solution,columns:checked,
      publication:'not_requested',indexSizeValidation:'platform',existingDataUniqueness:'not_scanned',nullValues:'not_uniqueness_enforced_by_alternate_key',
      reservedValueCharacters:'may_prevent_native_get_update_upsert_even_with_an_active_index'};
    if (dry) return {...state,dryRun:true,saved:false,request:{method:'POST',path,headers,body},index:{status:'not_created',usableForAlternateKeyOperations:false}};
    await this.write(path,'POST',body,headers,state,signal);
    try {
      const key = (await this.keys(table,signal)).find(key => key.SchemaName.toLowerCase() === schema.toLowerCase());
      if (!key || !subset(key.DisplayName,body.DisplayName) || key.KeyAttributes.length !== fields.length || !fields.every(field => key.KeyAttributes.includes(field))) this.mismatch(state);
      const index = this.keyState(key);
      const result = {...state,saved:true,readback:{status:'matched',metadataId:key.MetadataId},index};
      if (index.status === 'Failed') throw new ModelMetadataError('D365_MODEL_KEY_INDEX_FAILED','The key definition was saved, but native index creation failed. Inspect its job; creation was not replayed.',result);
      return result;
    } catch (error) { return this.afterSave(error,state); }
  }
}
