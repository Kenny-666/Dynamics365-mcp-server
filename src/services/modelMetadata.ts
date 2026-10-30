import { createHash } from 'node:crypto';
import { CrmRequestError, type CrmErrorDetails } from '../errors.js';
import type { CrmHttpMethod, CrmRequestClient, CrmResponse } from '../types/crmRequest.js';
import { CacheService } from './cache.js';

export type Row = Record<string, any>;
export const NS = 'Microsoft.Dynamics.CRM.';
export const COLUMN_TYPES = ['String','Memo','Integer','Decimal','Money','DateTime','Boolean','Picklist','MultiSelectPicklist'];
const LIMIT = 2 * 1024 * 1024;
const aliases:Record<string,string> = {logicalName:'logical_name',attributeName:'attribute_name',schemaName:'schema_name',
  solutionUniqueName:'solution_unique_name',displayName:'display_name',displayCollectionName:'display_collection_name',
  primaryName:'primary_name',ownershipType:'ownership_type',maxLength:'max_length',minValue:'min_value',maxValue:'max_value',
  requiredLevel:'required_level',dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write',
  referencedEntity:'referenced_entity',referencingEntity:'referencing_entity',entity1:'entity_1',entity2:'entity_2',
  intersectEntityName:'intersect_entity_name',keyAttributes:'key_attributes',includeJob:'include_job',
  globalChoiceName:'global_choice_name',dateTimeBehavior:'date_time_behavior',trueLabel:'true_label',falseLabel:'false_label',defaultValue:'default_value',
  ifMatch:'if_match',nameKeyword:'name_keyword',sectionId:'section_id',templateControlId:'template_control_id',controlId:'control_id',
  libraryName:'library_name',functionName:'function_name',eventName:'event_name',passExecutionContext:'pass_execution_context'};

export class ModelMetadataError extends CrmRequestError {
  constructor(code:string,message:string,readonly data:Row = {},details:CrmErrorDetails = {}) { super(code,message,details); }
  override toJSON() { return {...super.toJSON(),data:this.data}; }
}
export function fail(code:string,message:string,data:Row = {}):never {
  throw new ModelMetadataError('D365_MODEL_' + code,message,data,{outcome:'not_sent'});
}
function object(value:unknown):Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID','Expected an object.');
  return value as Row;
}
export function args(value:unknown,allowed:string[]):Row {
  const result:Row = {};
  for (const [key,item] of Object.entries(object(value))) {
    if (item === undefined) continue;
    const name = Object.hasOwn(aliases,key) ? aliases[key] : key;
    if (!allowed.includes(name)) fail('INVALID','Unknown argument: ' + key);
    if (Object.hasOwn(result,name) && canonical(result[name]) !== canonical(item)) fail('INVALID','Conflicting aliases for ' + name);
    result[name] = item;
  }
  return result;
}
export function name(value:unknown,field:string,max = 100):string {
  if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value) || value.length > max) fail('INVALID',field + ' must be a valid identifier.');
  return value;
}
export function logical(value:unknown,field:string):string { return name(value,field).toLowerCase(); }
export function flag(value:unknown,field:string,fallback = false):boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail('INVALID',field + ' must be a boolean.');
  return value;
}
export function integer(value:unknown,field:string,fallback:number,min:number,max:number):number {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || (result as number) < min || (result as number) > max) fail('INVALID',field + ' is outside its supported range.');
  return result as number;
}
export function labels(value:unknown,field:string):Row {
  if (!Array.isArray(value) || !value.length || value.length > 50) fail('INVALID',field + ' must contain 1–50 localized labels.');
  const seen = new Set<number>();
  return {LocalizedLabels:value.map(item => {
    const row = object(item);
    if (Object.keys(row).some(key => !['language_code','text'].includes(key))) fail('INVALID','Unknown localized label property.');
    const lcid = integer(row.language_code,'language_code',0,1,65535);
    if (seen.has(lcid)) fail('INVALID','Duplicate language_code.');
    seen.add(lcid);
    if (typeof row.text !== 'string' || !row.text.trim() || row.text.length > (field === 'description' ? 2000 : 100)) fail('INVALID','Invalid ' + field + ' label text.');
    return {LanguageCode:lcid,Label:row.text};
  })};
}
function canonical(value:any):string {
  const normalize = (item:any):any => Array.isArray(item) ? item.map(normalize) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key,normalize(item[key])])) : item;
  return JSON.stringify(normalize(value));
}
export function hash(value:unknown):string { return createHash('sha256').update(canonical(value)).digest('hex'); }

export function columnKind(base:Row):string {
  const kind = base.AttributeType === 'Virtual' && base.AttributeTypeName?.Value === 'MultiSelectPicklistType' ? 'MultiSelectPicklist' : base.AttributeType;
  if (!COLUMN_TYPES.includes(kind)) fail('UNSUPPORTED','This native column type is not supported by the model tools.');
  return kind;
}
export function nativeOptions(choice:Row):Row[] {
  const options = choice.OptionSetType === 'Boolean' ? [choice.FalseOption,choice.TrueOption] : choice.Options;
  if (!Array.isArray(options) || options.length > 1000 || options.some(option => !option || typeof option !== 'object' || !Number.isInteger(option.Value) || option.Value < 0 || option.Value > 2147483647) || new Set(options.map(option => option.Value)).size !== options.length) fail('RESPONSE_INVALID','Native choices were incomplete or invalid.');
  if (choice.OptionSetType === 'Boolean' && (options[0].Value !== 0 || options[1].Value !== 1)) fail('RESPONSE_INVALID','Native Boolean values must be 0 and 1.');
  return options;
}
export function optionList(value:unknown):Row[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000) fail('INVALID','options must contain 1–1000 entries.');
  const values = new Set<number>(),signatures = new Set<string>();
  const result = value.map(value => {
    const option = args(value,['value','label','description']);
    const code = option.value === undefined ? null : integer(option.value,'option value',0,0,2147483647);
    if (code !== null && values.has(code)) fail('INVALID','Duplicate option value.');
    if (code !== null) values.add(code);
    const label = labels(option.label,'display_name');
    const signature = canonical([...label.LocalizedLabels].sort((a,b) => a.LanguageCode - b.LanguageCode));
    if (signatures.has(signature)) fail('INVALID','Option label sets must be distinct so allocated values can be verified.');
    signatures.add(signature);
    return {Value:code,Label:label,...(option.description === undefined ? {} : {Description:labels(option.description,'description')})};
  });
  for (const option of result) if (option.Value === null && result.some(other => other !== option && subset(other.Label,option.Label))) fail('INVALID','Automatically allocated options require unambiguous label sets.');
  if (Buffer.byteLength(JSON.stringify(result)) > LIMIT) fail('INVALID','Option payload exceeds 2 MiB.');
  return result;
}
export function subset(actual:any,wanted:any):boolean {
  if (Array.isArray(wanted)) return Array.isArray(actual) && wanted.every((item,index) => subset(item?.LanguageCode === undefined ? actual[index] : actual.find(row => row?.LanguageCode === item.LanguageCode),item));
  if (wanted && typeof wanted === 'object') return !!actual && typeof actual === 'object' && Object.entries(wanted).every(([key,value]) => key === '@odata.type' || subset(actual[key],value));
  return actual === wanted;
}
export function verifyOptions(actual:Row[],wanted:Row[]):Row[] {
  const used = new Set<number>();
  const resolved:Row[] = [];
  for (const option of wanted) {
    const candidates = actual.filter(row => (option.Value === null || row.Value === option.Value) && subset(row.Label,option.Label) &&
      (option.Description === undefined || subset(row.Description,option.Description)));
    if (candidates.length !== 1 || used.has(candidates[0].Value)) fail('READBACK_OPTION_MISMATCH','Saved option values/labels could not be uniquely verified.');
    used.add(candidates[0].Value); resolved.push({value:candidates[0].Value,label:candidates[0].Label});
  }
  return resolved;
}
/** Keep the complete scalar/complex definition, omit transport annotations and read-only per-user labels. */
export function definition(value:unknown):Row {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > LIMIT) fail('RESPONSE_INVALID','Metadata definition exceeds 2 MiB.');
  function clean(item:any,depth = 0):any {
    if (depth > 30) fail('RESPONSE_INVALID','Metadata nesting exceeds the supported bound.');
    if (Array.isArray(item)) return item.map(value => clean(value,depth + 1));
    if (!item || typeof item !== 'object') return item;
    if (Object.keys(item).some(key => /@odata.nextLink$/.test(key))) fail('RESPONSE_INVALID','A partial definition cannot be used for replacement.');
    return Object.fromEntries(Object.entries(item).filter(([key]) =>
      key !== 'UserLocalizedLabel' && (!key.includes('@') || key === '@odata.type')).map(([key,value]) => [key,clean(value,depth + 1)]));
  }
  return clean(object(value));
}
export function allowed(metadata:Row,key:string):void {
  if (metadata[key]?.Value !== true) fail('MANAGED_PROPERTY','Customization is blocked or the required managed property is unavailable.',{property:key,value:metadata[key]?.Value ?? null});
}
export function issue(error:unknown):Row {
  if (!(error instanceof CrmRequestError)) return {code:'D365_MODEL_REQUEST_FAILED'};
  const details = error.details;
  return {code:error.code,status:details.status,platformCode:/^0x[0-9a-f]+$/i.test(details.platformCode || '') ? details.platformCode : undefined,
    requestId:/^[0-9a-f-]{36}$/i.test(details.requestId || '') ? details.requestId : undefined};
}
export function tablePath(table:string):string { return `/EntityDefinitions(LogicalName='${table}')`; }
export function fieldPath(table:string,field:string):string { return tablePath(table) + `/Attributes(LogicalName='${field}')`; }

export class ModelMetadataService {
  constructor(private readonly client:CrmRequestClient,protected readonly environment:{orgUrl?:string;authType:string;apiVersion:string}) {}

  protected async request(endpoint:string,method:CrmHttpMethod = 'GET',body?:unknown,headers:Record<string,string> = {},signal?:AbortSignal) {
    if (signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','The request was cancelled.',{outcome:'not_sent'});
    return this.client.requestWithResponse<Row>(endpoint,method,body,{headers:{...(method === 'GET' ? {Consistency:'Strong'} : {}),...headers},signal});
  }
  protected async read(endpoint:string,signal?:AbortSignal):Promise<Row> {
    const result = await this.request(endpoint,'GET',undefined,{},signal);
    if (result.status !== 200 || !result.data) fail('RESPONSE_INVALID','The native metadata read was incomplete.');
    return object(result.data);
  }
  protected async rows(endpoint:string,signal?:AbortSignal):Promise<Row[]> {
    const result = await this.read(endpoint,signal);
    if (!Array.isArray(result.value) || result.value.length > 1 || result['@odata.nextLink']) fail('RESPONSE_INVALID','A unique metadata lookup was incomplete or ambiguous.');
    return result.value.map(object);
  }
  protected async target(a:Row,signal?:AbortSignal) {
    const table = logical(a.logical_name,'logical_name');
    const tableMeta = definition(await this.read(tablePath(table),signal));
    this.identity(tableMeta,table);
    if (a.attribute_name === undefined) return {table,field:undefined,path:tablePath(table),metadata:tableMeta,tableMeta};
    const field = logical(a.attribute_name,'attribute_name');
    const path = fieldPath(table,field);
    const base = await this.read(path,signal);
    this.identity(base,field);
    const kind = columnKind(base);
    const expanded = ['Boolean','Picklist','MultiSelectPicklist'].includes(kind) ? '?$expand=OptionSet' : '';
    const metadata = definition(await this.read(path + '/' + NS + kind + 'AttributeMetadata' + expanded,signal));
    this.identity(metadata,field);
    if (columnKind(metadata) !== kind) fail('RESPONSE_INVALID','Column type changed during retrieval.');
    if (expanded) { if (!metadata.OptionSet) fail('RESPONSE_INVALID','The native OptionSet expansion was missing.'); nativeOptions(metadata.OptionSet); }
    metadata['@odata.type'] = NS + kind + 'AttributeMetadata';
    return {table,field,path,metadata,tableMeta};
  }
  protected identity(metadata:Row,expected:string):void {
    if (metadata.LogicalName !== expected || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.MetadataId || '')) fail('RESPONSE_INVALID','Native metadata identity did not match the requested component.');
  }
  protected async solution(value:unknown,signal?:AbortSignal) {
    const uniqueName = name(value,'solution_unique_name');
    const query = new URLSearchParams({$select:'solutionid,uniquename,ismanaged',
      $filter:`uniquename eq '${uniqueName}'`,$expand:'publisherid($select=publisherid,customizationprefix)'});
    const rows = await this.rows('/solutions?' + query,signal);
    const row = rows[0];
    if (!row || row.uniquename !== uniqueName || row.ismanaged !== false) fail('SOLUTION','An existing unmanaged solution is required.');
    const prefix = row.publisherid?.customizationprefix;
    if (typeof prefix !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,7}$/.test(prefix)) fail('SOLUTION','The solution publisher prefix is unavailable or unsupported.');
    return {uniqueName,prefix,solutionId:row.solutionid,publisherId:row.publisherid.publisherid};
  }
  protected prefixed(value:unknown,prefix:string,field:string):string {
    const schema = name(value,field);
    if (!schema.toLowerCase().startsWith(prefix.toLowerCase() + '_') || schema.length <= prefix.length + 1) fail('PREFIX',field + ' must use the selected solution publisher prefix.');
    return schema;
  }
  protected async globalChoice(value:unknown,signal?:AbortSignal):Promise<Row> {
    const globalName = name(value,'global_choice_name'),path = `/GlobalOptionSetDefinitions(Name='${globalName}')`;
    const base = definition(await this.read(path,signal));
    if (base.OptionSetType !== 'Picklist') fail('UNSUPPORTED','Only global Picklist choices are supported.');
    const row = definition(await this.read(path + '/' + NS + 'OptionSetMetadata',signal));
    if (row.Name !== globalName || row.IsGlobal !== true || row.OptionSetType !== 'Picklist' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.MetadataId || '') || base.MetadataId !== row.MetadataId) fail('RESPONSE_INVALID','The global choice identity did not match.');
    nativeOptions(row); return row;
  }
  private column(a:Row,prefix:string,primary = false):Row {
    const type = primary ? 'String' : a.type;
    if (!COLUMN_TYPES.includes(type)) fail('UNSUPPORTED','Unsupported model column type.');
    const body:Row = {'@odata.type':NS + type + 'AttributeMetadata',SchemaName:this.prefixed(a.schema_name,prefix,'schema_name'),
      AttributeType:type === 'MultiSelectPicklist' ? 'Virtual' : type,AttributeTypeName:{Value:type + 'Type'},DisplayName:labels(a.display_name,'display_name')};
    if (a.description !== undefined) body.Description = labels(a.description,'description');
    const required = a.required_level ?? 'None';
    if (!['None','Recommended','ApplicationRequired'].includes(required)) fail('INVALID','Invalid required_level.');
    body.RequiredLevel = {Value:required};
    const settings:Record<string,string[]> = {String:['max_length'],Memo:['max_length'],Integer:['min_value','max_value'],Decimal:['min_value','max_value','precision'],
      Money:['min_value','max_value','precision'],DateTime:['format','date_time_behavior'],Boolean:['true_label','false_label','default_value'],
      Picklist:['options','global_choice_name','default_value'],MultiSelectPicklist:['options','global_choice_name']};
    for (const key of ['max_length','min_value','max_value','precision','format','date_time_behavior','true_label','false_label','default_value','options','global_choice_name']) {
      if (a[key] !== undefined && !settings[type].includes(key)) fail('INVALID',key + ' does not apply to ' + type + '.');
    }
    if (type === 'String' || type === 'Memo') {
      if (a.min_value !== undefined || a.max_value !== undefined || a.precision !== undefined) fail('INVALID','Numeric settings do not apply to text columns.');
      body.MaxLength = integer(a.max_length,'max_length',primary ? 100 : 1000,1,type === 'String' ? 4000 : 1048576);
      if (type === 'String') body.FormatName = {Value:'Text'}; else body.Format = 'TextArea';
    } else if (['Integer','Decimal','Money'].includes(type)) {
      if (a.max_length !== undefined) fail('INVALID','max_length only applies to text columns.');
      const bound = type === 'Integer' ? 2147483647 : 100000000000;
      body.MinValue = a.min_value ?? 0; body.MaxValue = a.max_value ?? 1000000;
      for (const value of [body.MinValue,body.MaxValue]) if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > bound || (type === 'Integer' && !Number.isInteger(value))) fail('INVALID','Invalid numeric column bounds.');
      if (body.MinValue > body.MaxValue) fail('INVALID','min_value exceeds max_value.');
      if (type === 'Decimal' || type === 'Money') { body.Precision = integer(a.precision,'precision',2,0,type === 'Money' ? 4 : 10); if (type === 'Money') body.PrecisionSource = 0; }
      else { if (a.precision !== undefined) fail('INVALID','precision only applies to Decimal.'); body.Format = 'None'; }
    } else if (type === 'DateTime') {
      body.Format = a.format ?? 'DateAndTime'; body.DateTimeBehavior = {Value:a.date_time_behavior ?? 'UserLocal'};
      if (!['DateAndTime','DateOnly'].includes(body.Format) || !['UserLocal','DateOnly','TimeZoneIndependent'].includes(body.DateTimeBehavior.Value) || body.DateTimeBehavior.Value === 'DateOnly' && body.Format !== 'DateOnly') fail('INVALID','Invalid date/time format or behavior combination.');
    } else if (type === 'Boolean') {
      body.DefaultValue = flag(a.default_value,'default_value');
      body.OptionSet = {'@odata.type':NS + 'BooleanOptionSetMetadata',OptionSetType:'Boolean',
        TrueOption:{Value:1,Label:labels(a.true_label,'display_name')},FalseOption:{Value:0,Label:labels(a.false_label,'display_name')}};
    } else {
      if ((a.options === undefined) === (a.global_choice_name === undefined)) fail('INVALID','Choose exactly one of options or global_choice_name.');
      if (a.options !== undefined) body.OptionSet = {'@odata.type':NS + 'OptionSetMetadata',OptionSetType:'Picklist',IsGlobal:false,Options:optionList(a.options)};
      if (a.default_value !== undefined) {
        body.DefaultFormValue = integer(a.default_value,'default_value',0,0,2147483647);
        if (body.OptionSet && !body.OptionSet.Options.some((option:Row) => option.Value === body.DefaultFormValue)) fail('INVALID','default_value must refer to an explicit option value.');
      }
    }
    if (primary) body.IsPrimaryName = true;
    return body;
  }
  protected async write(endpoint:string,method:CrmHttpMethod,body:Row,headers:Record<string,string>,state:Row,signal?:AbortSignal):Promise<CrmResponse<Row>> {
    let response:CrmResponse<Row>;
    try {
      response = await this.request(endpoint,method,body,headers,signal);
      if (response.status < 200 || response.status >= 300) throw new CrmRequestError('D365_MODEL_RESPONSE_INVALID','Unexpected write response.',{outcome:'unknown'});
    } catch (error) {
      const outcome = error instanceof CrmRequestError ? error.details.outcome ?? 'unknown' : 'unknown';
      throw new ModelMetadataError('D365_MODEL_WRITE_FAILED','The native metadata operation did not return confirmed success. Do not replay an unknown write.',
        {...state,saved:outcome === 'unknown' ? null : false,issue:issue(error)}, {outcome});
    }
    CacheService.flushExisting();
    return response;
  }
  private async readback(a:Row,state:Row,expected:Row,signal?:AbortSignal):Promise<Row> {
    try {
      const target = await this.target(a,signal);
      const matches = (actual:any,wanted:any):boolean => {
        if (Array.isArray(wanted)) return Array.isArray(actual) && wanted.every((item,index) =>
          matches(item?.LanguageCode === undefined ? actual[index] : actual.find(row => row.LanguageCode === item.LanguageCode),item));
        if (wanted && typeof wanted === 'object') return actual && typeof actual === 'object' &&
          Object.entries(wanted).every(([key,value]) => matches(actual[key],value));
        return actual === wanted;
      };
      const checked = Object.keys(expected).filter(key => key !== '@odata.type' && key !== 'Attributes' && key !== 'OptionSet' && key !== 'GlobalOptionSet@odata.bind');
      const mismatches = checked.filter(key => !matches(target.metadata[key],expected[key]));
      let choices:Row[]|undefined;
      if (expected.OptionSet) {
        if (expected.OptionSet.OptionSetType === 'Boolean') { if (!subset(target.metadata.OptionSet,expected.OptionSet)) mismatches.push('OptionSet'); }
        else {
          const actual = nativeOptions(target.metadata.OptionSet);
          if (actual.length !== expected.OptionSet.Options.length || target.metadata.OptionSet.IsGlobal !== false) mismatches.push('OptionSet');
          choices = verifyOptions(actual,expected.OptionSet.Options);
        }
      }
      if (expected['GlobalOptionSet@odata.bind']) {
        if (target.metadata.OptionSet?.IsGlobal !== true || expected['GlobalOptionSet@odata.bind'] !== `/GlobalOptionSetDefinitions(${target.metadata.OptionSet.MetadataId})`) mismatches.push('GlobalOptionSet');
      }
      if (mismatches.length) throw new ModelMetadataError('D365_MODEL_READBACK_MISMATCH','Metadata was saved, but returned values did not match the requested properties. Inspect the component before any further write.',
        {...state,saved:true,readback:{status:'mismatch',metadataId:target.metadata.MetadataId,properties:mismatches}});
      return {...state,saved:true,readback:{status:'matched',checkedProperties:[...checked,...(expected.OptionSet ? ['OptionSet'] : []),...(expected['GlobalOptionSet@odata.bind'] ? ['GlobalOptionSet'] : [])],choices,metadataId:target.metadata.MetadataId,definitionHash:hash(target.metadata),
        ...(expected.Attributes ? {primaryNameDefinition:'not_checked_in_table_projection'} : {})},
        modelDrivenUi:'not_verified',formPlacement:'not_performed'};
    } catch (error) {
      if (error instanceof ModelMetadataError && error.code === 'D365_MODEL_READBACK_MISMATCH') throw error;
      throw new ModelMetadataError('D365_MODEL_READBACK_FAILED','Metadata was saved, but readback did not complete. Inspect the component before any further write.',
        {...state,saved:true,readback:{status:'failed',issue:issue(error)}},{});
    }
  }
  async get(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['logical_name','attribute_name']);
    const target = await this.target(a,signal);
    return {environment:this.environment,logicalName:target.table,attributeName:target.field,definition:target.metadata,
      definitionHash:hash(target.metadata),publication:'not_determined',concurrency:'fingerprint_is_not_a_platform_lock'};
  }
  async create(raw:unknown,kind:'table'|'column',signal?:AbortSignal):Promise<Row> {
    const common = ['schema_name','display_name','description','solution_unique_name','dry_run'];
    const a = args(raw,[...common,...(kind === 'table' ? ['display_collection_name','primary_name','ownership_type'] :
      ['logical_name','type','max_length','min_value','max_value','precision','required_level','format','date_time_behavior','true_label','false_label','default_value','options','global_choice_name'])]);
    const dry = flag(a.dry_run,'dry_run',true);
    const solution = await this.solution(a.solution_unique_name,signal);
    let body:Row,table:string,field:string|undefined,path:string;
    if (kind === 'table') {
      const schema = this.prefixed(a.schema_name,solution.prefix,'schema_name'); table = schema.toLowerCase();
      const primary = args(a.primary_name,['schema_name','display_name','description','max_length']);
      const ownership = a.ownership_type ?? 'UserOwned';
      if (!['UserOwned','OrganizationOwned'].includes(ownership)) fail('INVALID','Invalid ownership_type.');
      body = {'@odata.type':NS + 'EntityMetadata',SchemaName:schema,DisplayName:labels(a.display_name,'display_name'),
        DisplayCollectionName:labels(a.display_collection_name,'display_collection_name'),OwnershipType:ownership,
        IsActivity:false,HasActivities:false,HasNotes:false,Attributes:[this.column(primary,solution.prefix,true)]};
      if (a.description !== undefined) body.Description = labels(a.description,'description');
      path = '/EntityDefinitions';
    } else {
      table = logical(a.logical_name,'logical_name');
      const parent = definition(await this.read(tablePath(table),signal)); this.identity(parent,table);
      allowed(parent,'IsCustomizable'); allowed(parent,'CanCreateAttributes');
      body = this.column(a,solution.prefix); field = body.SchemaName.toLowerCase(); path = tablePath(table) + '/Attributes';
      if (a.global_choice_name !== undefined) {
        const choice = await this.globalChoice(a.global_choice_name,signal);
        if (body.DefaultFormValue !== undefined && !nativeOptions(choice).some(option => option.Value === body.DefaultFormValue)) fail('INVALID','default_value is not defined by the global choice.');
        body['GlobalOptionSet@odata.bind'] = `/GlobalOptionSetDefinitions(${choice.MetadataId})`;
      }
    }
    const exists = await this.rows(path + '?' + new URLSearchParams({$select:'LogicalName,SchemaName,MetadataId',$filter:`LogicalName eq '${field ?? table}'`}),signal);
    if (exists.length) fail('EXISTS','The requested component already exists. Creation is not an upsert.',{logicalName:table,attributeName:field});
    const headers = {'MSCRM.SolutionUniqueName':solution.uniqueName};
    if (Buffer.byteLength(JSON.stringify(body)) > LIMIT) fail('INVALID','Metadata payload exceeds 2 MiB.');
    const state = {environment:this.environment,operation:'create_' + kind,logicalName:table,attributeName:field,solution,
      publication:'not_requested'};
    if (dry) return {...state,dryRun:true,saved:false,request:{method:'POST',path,headers,body},formPlacement:'not_performed',platformValidation:'not_executed'};
    await this.write(path,'POST',body,headers,state,signal);
    return this.readback({logical_name:table,...(field ? {attribute_name:field} : {})},state,body,signal);
  }
  async updateLabels(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['logical_name','attribute_name','solution_unique_name','display_name','display_collection_name','description','dry_run','expected_hash','allow_unprotected_write']);
    const dry = flag(a.dry_run,'dry_run',true), unprotected = flag(a.allow_unprotected_write,'allow_unprotected_write');
    const target = await this.target(a,signal);
    allowed(target.tableMeta,'IsCustomizable'); allowed(target.metadata,'IsCustomizable');
    if (!target.field && (a.display_name !== undefined || a.display_collection_name !== undefined)) allowed(target.metadata,'IsRenameable');
    if (!target.field && a.description !== undefined) allowed(target.metadata,'CanModifyAdditionalSettings');
    if (target.field && a.display_collection_name !== undefined) fail('INVALID','display_collection_name only applies to tables.');
    const currentHash = hash(target.metadata);
    if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('INVALID','expected_hash must be a SHA-256 fingerprint.');
    if (a.expected_hash !== undefined && a.expected_hash !== currentHash) fail('CONFLICT','The definition changed since the preview. Read it again before updating.',{definitionHash:currentHash});
    const body = structuredClone(target.metadata),changes:Row = {};
    for (const [input,property] of [['display_name','DisplayName'],['display_collection_name','DisplayCollectionName'],['description','Description']]) {
      if (a[input] === undefined) continue;
      const next = labels(a[input],input);
      changes[property] = {before:target.metadata[property] ?? null,merge:next}; body[property] = next;
    }
    if (!Object.keys(changes).length) fail('INVALID','At least one label change is required.');
    const solution = await this.solution(a.solution_unique_name,signal);
    const headers = {'MSCRM.MergeLabels':'true','MSCRM.SolutionUniqueName':solution.uniqueName};
    const state = {environment:this.environment,operation:'update_labels',logicalName:target.table,attributeName:target.field,solution,
      publication:'not_requested',definitionHash:currentHash,concurrency:'unprotected_native_put',changes};
    if (dry) return {...state,dryRun:true,saved:false,request:{method:'PUT',path:target.path,headers,body},platformValidation:'not_executed'};
    if (!a.expected_hash || !unprotected) fail('CONCURRENCY','A current expected_hash and allow_unprotected_write=true are required. The fingerprint detects stale previews but does not lock the native PUT.');
    await this.write(target.path,'PUT',body,headers,state,signal);
    return this.readback(a,state,Object.fromEntries(Object.entries(changes).map(([key,value]) => [key,value.merge])),signal);
  }
  async publish(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['logical_name','dry_run']); const dry = flag(a.dry_run,'dry_run',true);
    const table = logical(a.logical_name,'logical_name');
    this.identity(await this.read(tablePath(table),signal),table);
    const body = {ParameterXml:`<importexportxml><entities><entity>${table}</entity></entities></importexportxml>`};
    const state = {environment:this.environment,operation:'publish_table',logicalName:table,
      scope:'entire_table_including_other_pending_columns_forms_views_and_ribbon',publication:'not_requested'};
    if (dry) return {...state,dryRun:true,request:{method:'POST',path:'/PublishXml',body}};
    try { await this.write('/PublishXml','POST',body,{},state,signal); }
    catch (error) {
      if (error instanceof ModelMetadataError) throw new ModelMetadataError('D365_MODEL_PUBLISH_FAILED','Table publication was not confirmed. No metadata save was replayed.',
        {...state,publication:error.details.outcome === 'unknown' ? 'unknown' : 'failed',issue:error.data.issue},error.details);
      throw error;
    }
    return {...state,publication:'published',modelDrivenUi:'not_verified'};
  }
}
