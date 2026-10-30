import { ModelMetadataService,ModelMetadataError,NS,allowed,args,definition,fail,flag,hash,integer,issue,logical,tablePath,fieldPath,type Row } from './modelMetadata.js';
import { formChanges,formSummary,guid,libraryName,uiXml,viewChanges,viewSummary,xmlHash,type UiResolver } from './modelUiXml.js';

type Kind = 'form'|'view';
const CONFIG = {form:{set:'systemforms',table:'systemform',id:'formid',target:'objecttypecode',type:'type',xml:['formxml']},
  view:{set:'savedqueries',table:'savedquery',id:'savedqueryid',target:'returnedtypecode',type:'querytype',xml:['fetchxml','layoutxml']}};
function kind(value:unknown):Kind { if (value !== 'form' && value !== 'view') fail('INVALID','kind must be form or view.'); return value; }
function etag(value:unknown):string|undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^(?:W\/)?"[\x21\x23-\x7e]+"$/.test(value)) fail('INVALID','if_match requires a specific quoted ETag.');
  return value;
}
function select(k:Kind,withXml = true):string {
  const c = CONFIG[k]; return [c.id,'name',c.target,c.type,'iscustomizable','ismanaged','componentstate',...(withXml ? c.xml : [])].join(',');
}
export class ModelUiService extends ModelMetadataService {
  private async tableMetadata(table:string,signal?:AbortSignal):Promise<Row> {
    const row = definition(await this.read(tablePath(table),signal)); this.identity(row,table);
    logical(row.PrimaryIdAttribute,'native primary ID');
    if (!Number.isInteger(row.ObjectTypeCode) || row.ObjectTypeCode <= 0) fail('RESPONSE_INVALID','Native object type metadata was missing.');
    return row;
  }
  private validateRow(row:Row,k:Kind,table:Row,id?:string):void {
    const c = CONFIG[k],nativeId = guid(row[c.id],'native component ID');
    if (id && nativeId !== id) fail('RESPONSE_INVALID','The UI component ID did not match.');
    if (!['string','number'].includes(typeof row[c.target]) || row[c.target] !== table.LogicalName && String(row[c.target]) !== String(table.ObjectTypeCode)) fail('RESPONSE_INVALID','The UI component belongs to a different table.');
    if (typeof row.name !== 'string' || row.name.length > 200 || !Number.isInteger(row[c.type]) || typeof row.ismanaged !== 'boolean') fail('RESPONSE_INVALID','The native UI component metadata was incomplete.');
    if (row.componentstate !== undefined && ![0,1].includes(row.componentstate)) fail('UNSUPPORTED','Deleted UI components cannot be edited.');
  }
  private async component(k:Kind,id:string,table:Row,signal?:AbortSignal) {
    const c = CONFIG[k],path = `/${c.set}(${id})`,response = await this.request(path + '/' + NS + 'RetrieveUnpublished()?$select=' + select(k),'GET',undefined,{},signal);
    if (response.status !== 200 || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) fail('RESPONSE_INVALID','The unpublished component read did not return a complete record.');
    const row = response.data;
    if (Buffer.byteLength(JSON.stringify(row)) > 3 * 1024 * 1024) fail('RESPONSE_INVALID','UI component response exceeds 3 MiB.');
    this.validateRow(row,k,table,id);
    const source:Row = {};
    for (const field of c.xml) { uiXml(row[field],field === 'formxml' ? 'form' : field === 'fetchxml' ? 'fetch' : 'grid'); source[field] = row[field]; }
    const version = etag(row['@odata.etag'] ?? response.headers.etag);
    const snapshot = {id,kind:k,logicalName:table.LogicalName,name:row.name,type:row[c.type],isManaged:row.ismanaged,customizable:row.iscustomizable,
      xml:Object.fromEntries(c.xml.map(field => [field,xmlHash(source[field],field === 'formxml' ? 'form' : field === 'fetchxml' ? 'fetch' : 'grid')]))};
    return {row,source,path,etag:version,definitionHash:hash(snapshot)};
  }
  async list(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['kind','logical_name','top','name_keyword']),k = kind(a.kind),tableName = logical(a.logical_name,'logical_name'),top = integer(a.top,'top',50,1,100);
    const table = await this.tableMetadata(tableName,signal),c = CONFIG[k];
    let filter = `${c.target} eq '${tableName}'`;
    if (a.name_keyword !== undefined) {
      if (typeof a.name_keyword !== 'string' || !a.name_keyword.trim() || a.name_keyword.length > 100) fail('INVALID','name_keyword requires 1–100 characters.');
      filter += ` and contains(name,'${a.name_keyword.replace(/'/g,"''")}')`;
    }
    const result = await this.read(`/${c.set}/${NS}RetrieveUnpublishedMultiple()?` + new URLSearchParams({$select:select(k,false),$filter:filter,$top:String(top)}),signal);
    if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024 || !Array.isArray(result.value) || result.value.length > top || result.value.some((row:unknown) => !row || typeof row !== 'object' || Array.isArray(row)) || result['@odata.nextLink'] !== undefined && (typeof result['@odata.nextLink'] !== 'string' || !result['@odata.nextLink'])) fail('RESPONSE_INVALID','The native UI list was incomplete or exceeded its bound.');
    const ids = new Set<string>();
    const items = result.value.map((row:Row) => {
      this.validateRow(row,k,table); const id = guid(row[c.id]);
      if (ids.has(id)) fail('RESPONSE_INVALID','Duplicate UI components in the native list.'); ids.add(id);
      return {id,name:row.name,kind:k,type:row[c.type],isManaged:row.ismanaged,customizable:typeof row.iscustomizable?.Value === 'boolean' ? row.iscustomizable.Value : null,componentState:row.componentstate ?? null};
    });
    const limited = !!result['@odata.nextLink'] || items.length === top;
    return {environment:this.environment,logicalName:tableName,kind:k,source:'native_saved_including_unpublished',items,
      limited,completeness:limited ? 'bounded_list_use_name_keyword_to_narrow' : 'native_list_exhausted'};
  }
  async getComponent(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['kind','id','logical_name']),k = kind(a.kind),id = guid(a.id),tableName = logical(a.logical_name,'logical_name');
    const table = await this.tableMetadata(tableName,signal),component = await this.component(k,id,table,signal);
    return {environment:this.environment,id,kind:k,logicalName:tableName,name:component.row.name,type:component.row[CONFIG[k].type],
      source:'native_saved_including_unpublished',publication:'not_determined',definitionHash:component.definitionHash,etag:component.etag ?? null,xml:component.source,
      structure:k === 'form' ? formSummary(component.source.formxml) : viewSummary(component.source.fetchxml,component.source.layoutxml,tableName)};
  }
  private resolver(table:string,signal?:AbortSignal):UiResolver {
    const fields = new Map<string,Promise<Row>>(),libraries = new Map<string,Promise<{id:string;name:string}>>();
    return {
      field:(field:string) => {
        if (!fields.has(field)) fields.set(field,(async () => {
          const path = fieldPath(table,logical(field,'attribute_name')),base = definition(await this.read(path,signal)); this.identity(base,field);
          if (['String','Memo','DateTime','Integer','Decimal','Money','Boolean','Picklist'].includes(base.AttributeType)) {
            const typed = definition(await this.read(path + '/' + NS + base.AttributeType + 'AttributeMetadata',signal)); this.identity(typed,field);
            if (typed.AttributeType !== base.AttributeType) fail('RESPONSE_INVALID','The field type changed during lookup.');
            return {...base,...typed};
          }
          return base;
        })());
        return fields.get(field)!;
      },
      library:(value:string) => {
        const library = libraryName(value);
        if (!libraries.has(library)) libraries.set(library,(async () => {
          const rows = await this.rows('/webresourceset/' + NS + 'RetrieveUnpublishedMultiple()?' + new URLSearchParams({$select:'webresourceid,name,webresourcetype',$filter:`name eq '${library.replace(/'/g,"''")}'`}),signal);
          if (rows.length !== 1 || rows[0].name !== library || rows[0].webresourcetype !== 3) fail('INVALID','A visible native JavaScript Web Resource with this exact name is required.');
          return {id:guid(rows[0].webresourceid,'native Web Resource ID'),name:library};
        })());
        return libraries.get(library)!;
      },
    };
  }
  async edit(raw:unknown,k:Kind,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['id','logical_name','operations','dry_run','expected_hash','if_match','allow_unprotected_write','solution_unique_name']);
    const id = guid(a.id),tableName = logical(a.logical_name,'logical_name'),dry = flag(a.dry_run,'dry_run',true),allow = flag(a.allow_unprotected_write,'allow_unprotected_write'),match = etag(a.if_match);
    const table = await this.tableMetadata(tableName,signal),before = await this.component(k,id,table,signal),c = CONFIG[k];
    allowed(table,'IsCustomizable');
    if (before.row.iscustomizable?.Value !== true) fail('MANAGED_PROPERTY','The UI component is not explicitly customizable.');
    if (k === 'form' && before.row.type !== 2 || k === 'view' && before.row.querytype !== 0) fail('UNSUPPORTED','This batch edits Main forms and public system views only.');
    if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[0-9a-f]{64}$/.test(a.expected_hash))) fail('INVALID','expected_hash must be a SHA-256 fingerprint.');
    if (a.expected_hash !== undefined && a.expected_hash !== before.definitionHash) fail('CONFLICT','The saved UI definition changed since the preview.',{definitionHash:before.definitionHash});
    const plan = k === 'form' ? await formChanges(before.source.formxml,a.operations,this.resolver(tableName,signal))
      : await viewChanges(before.source.fetchxml,before.source.layoutxml,table,a.operations,this.resolver(tableName,signal));
    const solution = await this.solution(a.solution_unique_name,signal);
    const metadata = definition(await this.read(tablePath(c.table),signal)); this.identity(metadata,c.table);
    let condition:string|undefined,blockedBy:string|undefined;
    const supported = metadata.IsOptimisticConcurrencyEnabled === true;
    if (supported) {
      condition = match ?? before.etag;
      if (!condition) blockedBy = 'D365_MODEL_UI_ETAG_REQUIRED';
      else if (match && before.etag && match !== before.etag) blockedBy = 'D365_MODEL_CONFLICT';
    } else if (allow && !match) condition = '*';
    else blockedBy = 'D365_MODEL_UI_CONCURRENCY_UNSUPPORTED';
    const headers:Record<string,string> = {'MSCRM.SolutionUniqueName':solution.uniqueName,...(condition ? {'If-Match':condition} : {})};
    const changed = c.xml.some(field => xmlHash(before.source[field],field === 'formxml' ? 'form' : field === 'fetchxml' ? 'fetch' : 'grid') !== xmlHash(plan.body[field],field === 'formxml' ? 'form' : field === 'fetchxml' ? 'fetch' : 'grid'));
    const state = {environment:this.environment,operation:'edit_' + k,id,logicalName:tableName,name:before.row.name,solution,
      source:'native_saved_including_unpublished',definitionHash:before.definitionHash,etag:before.etag ?? null,concurrencyProtected:supported && !!condition && !blockedBy,
      publication:'not_requested',modelDrivenUi:'not_verified',changes:plan.changes};
    if (dry) return {...state,dryRun:true,saved:false,wouldChange:changed,blockedBy:blockedBy ?? null,request:{method:'PATCH',path:before.path,headers,body:plan.body},
      scriptCode:'not_read_or_executed',validation:'bounded_structure_and_native_references_not_full_xsd_or_runtime'};
    if (!a.expected_hash) fail('PREVIEW_REQUIRED','Execution requires the current expected_hash returned by a preview or component read.');
    if (!changed) return {...state,saved:false,noChange:true};
    if (blockedBy) throw new ModelMetadataError(blockedBy,'A supported specific ETag or explicit unprotected fallback is required. Supplied ETag conflicts are never bypassed.',state,{outcome:'not_sent'});
    await this.write(before.path,'PATCH',plan.body,headers,state,signal);
    try {
      const after = await this.component(k,id,table,signal);
      const mismatches = c.xml.filter(field => xmlHash(after.source[field],field === 'formxml' ? 'form' : field === 'fetchxml' ? 'fetch' : 'grid') !== xmlHash(plan.body[field],field === 'formxml' ? 'form' : field === 'fetchxml' ? 'fetch' : 'grid'));
      if (mismatches.length) throw new ModelMetadataError('D365_MODEL_READBACK_MISMATCH','The UI definition was saved, but readback did not match. Inspect it before any further write.',{...state,saved:true,readback:{status:'mismatch',properties:mismatches}});
      return {...state,saved:true,readback:{status:'matched',checkedProperties:c.xml,definitionHash:after.definitionHash,etag:after.etag ?? null},
        next:'Review and separately publish the entire affected table when ready.'};
    } catch (error) {
      if (error instanceof ModelMetadataError && error.code === 'D365_MODEL_READBACK_MISMATCH') throw error;
      throw new ModelMetadataError('D365_MODEL_READBACK_FAILED','The UI definition was saved, but readback did not complete. Do not repeat the save.',{...state,saved:true,readback:{status:'failed',issue:issue(error)}});
    }
  }
}
