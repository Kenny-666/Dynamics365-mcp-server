import { CrmRequestError } from '../errors.js';
import { ModelMetadataService,ModelMetadataError,NS,allowed,args,columnKind,definition,fail,flag,hash,integer,issue,labels,name,nativeOptions,optionList,subset,verifyOptions,type Row } from './modelMetadata.js';

const TARGET = ['global_choice_name','logical_name','attribute_name'];
function selector(a:Row):Row {
  const global = a.global_choice_name !== undefined;
  if (global && (a.logical_name !== undefined || a.attribute_name !== undefined) || !global && (a.logical_name === undefined || a.attribute_name === undefined)) fail('INVALID','Use global_choice_name OR logical_name plus attribute_name.');
  return Object.fromEntries(TARGET.filter(key => a[key] !== undefined).map(key => [key,a[key]]));
}
export class ModelChoiceService extends ModelMetadataService {
  private async choiceTarget(a:Row,signal?:AbortSignal) {
    selector(a);
    if (a.global_choice_name !== undefined) {
      const choice = await this.globalChoice(a.global_choice_name,signal);
      return {choice,scope:'global',nativeTarget:{OptionSetName:choice.Name},table:undefined,attribute:undefined};
    }
    const target = await this.target(a,signal),kind = columnKind(target.metadata);
    if (!['Boolean','Picklist','MultiSelectPicklist'].includes(kind)) fail('UNSUPPORTED','A Boolean, Picklist or MultiSelectPicklist column is required. State/status options use separate native semantics.');
    const choice = definition(target.metadata.OptionSet);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(choice.MetadataId || '')) fail('RESPONSE_INVALID','The native local/shared choice identifier was missing.');
    if (typeof choice.IsGlobal !== 'boolean' || !['Boolean','Picklist'].includes(choice.OptionSetType)) fail('RESPONSE_INVALID','Native choice scope/type was not returned.');
    nativeOptions(choice);
    return {choice,scope:choice.IsGlobal ? 'global_reference' : 'local',
      nativeTarget:{EntityLogicalName:target.table,AttributeLogicalName:target.field},table:target.tableMeta,attribute:target.metadata};
  }
  async getChoices(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,TARGET),target = await this.choiceTarget(a,signal);
    return {environment:this.environment,scope:target.scope,definition:target.choice,definitionHash:hash(target.choice),
      publication:'not_determined',sharedAcrossColumns:target.scope !== 'local'};
  }
  private savedError(error:unknown,state:Row):never {
    if (error instanceof ModelMetadataError && error.code === 'D365_MODEL_READBACK_MISMATCH') throw error;
    throw new ModelMetadataError('D365_MODEL_READBACK_FAILED','Choices were saved, but readback did not complete or match. Inspect them before any further write.',
      {...state,saved:true,readback:{status:'failed',issue:issue(error)}});
  }
  private mismatch(state:Row):never {
    throw new ModelMetadataError('D365_MODEL_READBACK_MISMATCH','Choices were saved, but native readback did not match the requested change.',{...state,saved:true,readback:{status:'mismatch'}});
  }
  async createChoices(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['schema_name','display_name','description','options','solution_unique_name','dry_run']);
    const dry = flag(a.dry_run,'dry_run',true),solution = await this.solution(a.solution_unique_name,signal);
    const globalName = this.prefixed(a.schema_name,solution.prefix,'schema_name').toLowerCase();
    const body:Row = {'@odata.type':NS + 'OptionSetMetadata',Name:globalName,IsGlobal:true,OptionSetType:'Picklist',
      DisplayName:labels(a.display_name,'display_name'),Options:optionList(a.options)};
    if (a.description !== undefined) body.Description = labels(a.description,'description');
    if (Buffer.byteLength(JSON.stringify(body)) > 2 * 1024 * 1024) fail('INVALID','Global choice payload exceeds 2 MiB.');
    try { await this.globalChoice(globalName,signal); fail('EXISTS','The global choice already exists; creation is not an upsert.'); }
    catch (error) { if (!(error instanceof CrmRequestError) || error.details.status !== 404) throw error; }
    const headers = {'MSCRM.SolutionUniqueName':solution.uniqueName};
    const state = {environment:this.environment,operation:'create_global_choices',globalChoiceName:globalName,solution,publication:'not_requested'};
    if (dry) return {...state,dryRun:true,saved:false,request:{method:'POST',path:'/GlobalOptionSetDefinitions',headers,body},platformValidation:'not_executed'};
    await this.write('/GlobalOptionSetDefinitions','POST',body,headers,state,signal);
    try {
      const row = await this.globalChoice(globalName,signal),options = nativeOptions(row);
      if (!subset(row.DisplayName,body.DisplayName) || body.Description && !subset(row.Description,body.Description) || options.length !== body.Options.length) this.mismatch(state);
      const resolved = verifyOptions(options,body.Options);
      return {...state,saved:true,readback:{status:'matched',metadataId:row.MetadataId,definitionHash:hash(row),options:resolved}};
    } catch (error) { return this.savedError(error,state); }
  }
  async changeValue(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,[...TARGET,'operation','value','label','description','solution_unique_name','dry_run','expected_hash','allow_unprotected_write']);
    const dry = flag(a.dry_run,'dry_run',true),unprotected = flag(a.allow_unprotected_write,'allow_unprotected_write');
    if (!['insert','update'].includes(a.operation)) fail('INVALID','operation must be insert or update.');
    const target = await this.choiceTarget(a,signal),choice = target.choice;
    if (target.scope === 'global_reference') fail('SHARED_CHOICE','This column uses a shared global choice. Address it explicitly with global_choice_name to edit shared values.');
    if (choice.IsManaged !== false) fail('MANAGED_CHOICE','This tool changes unmanaged choices only; publisher ownership/solution upgrades for managed choices require a separate workflow.');
    allowed(choice,'IsCustomizable');
    if (target.table) allowed(target.table,'IsCustomizable');
    if (target.attribute) allowed(target.attribute,'IsCustomizable');
    if (a.operation === 'insert' && choice.OptionSetType === 'Boolean') fail('UNSUPPORTED','Boolean choices have exactly values 0 and 1; insertion is not supported.');
    const current = nativeOptions(choice),value = a.value === undefined ? null : integer(a.value,'value',0,0,2147483647);
    if (a.operation === 'update' && value === null) fail('INVALID','update requires the existing numeric value.');
    const previous = current.find(option => option.Value === value);
    if (a.operation === 'insert' && previous) fail('EXISTS','This option value already exists.');
    if (a.operation === 'update' && !previous) fail('NOT_FOUND','The requested existing option value was not returned.');
    if (previous?.IsManaged === true) fail('MANAGED_CHOICE','A managed option requires its publisher/solution upgrade workflow.');
    if (a.operation === 'insert' && current.length >= 1000) fail('INVALID','The bounded choice size of 1000 options was reached.');
    const patch:Row = {};
    if (a.label !== undefined) patch.Label = labels(a.label,'display_name');
    if (a.description !== undefined) patch.Description = labels(a.description,'description');
    if (!Object.keys(patch).length || a.operation === 'insert' && !patch.Label) fail('INVALID','Insert requires label; update requires a label or description change.');
    const currentHash = hash(choice);
    if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('INVALID','expected_hash must be a SHA-256 fingerprint.');
    if (a.expected_hash !== undefined && a.expected_hash !== currentHash) fail('CONFLICT','Choices changed since the preview.',{definitionHash:currentHash});
    const solution = await this.solution(a.solution_unique_name,signal),path = a.operation === 'insert' ? '/InsertOptionValue' : '/UpdateOptionValue';
    const body = {...target.nativeTarget,Value:value,...patch,SolutionUniqueName:solution.uniqueName,...(a.operation === 'update' ? {MergeLabels:true} : {})};
    const state = {environment:this.environment,operation:a.operation + '_choice_value',scope:target.scope,target:selector(a),solution,
      publication:'not_requested',definitionHash:currentHash,concurrency:'unprotected_native_action',before:previous ?? null,change:patch};
    if (dry) return {...state,dryRun:true,saved:false,request:{method:'POST',path,body},platformValidation:'not_executed'};
    if (!a.expected_hash || !unprotected) fail('CONCURRENCY','Execution requires a current expected_hash and allow_unprotected_write=true. Native option actions are not locked by the fingerprint.');
    const response = await this.write(path,'POST',body,{},state,signal);
    try {
      let savedValue = value;
      if (a.operation === 'insert') {
        const allocated = response.data?.NewOptionValue;
        if (allocated !== undefined) {
          if (!Number.isInteger(allocated) || allocated < 0 || allocated > 2147483647 || value !== null && allocated !== value) this.mismatch(state);
          savedValue = allocated;
        }
        if (savedValue === null) fail('RESPONSE_INVALID','The platform did not return the allocated option value.');
      }
      const after = (await this.choiceTarget(a,signal)).choice,options = nativeOptions(after),item = options.find(option => option.Value === savedValue);
      if (after.MetadataId.toLowerCase() !== choice.MetadataId.toLowerCase()) this.mismatch(state);
      if (!item || !subset(item,patch)) this.mismatch(state);
      if (a.operation === 'update') {
        for (const key of ['Label','Description']) {
          const changedLanguages = new Set((patch[key]?.LocalizedLabels ?? []).map((label:Row) => label.LanguageCode));
          for (const oldLabel of previous?.[key]?.LocalizedLabels ?? []) if (!changedLanguages.has(oldLabel.LanguageCode) && !subset(item[key],{LocalizedLabels:[{LanguageCode:oldLabel.LanguageCode,Label:oldLabel.Label}]})) this.mismatch(state);
        }
      }
      if (a.operation === 'insert' && current.some(option => option.Value === savedValue)) this.mismatch(state);
      return {...state,saved:true,value:savedValue,readback:{status:'matched',metadataId:after.MetadataId,definitionHash:hash(after),option:item}};
    } catch (error) { return this.savedError(error,state); }
  }
  async publishChoices(raw:unknown,signal?:AbortSignal):Promise<Row> {
    const a = args(raw,['global_choice_name','dry_run']),dry = flag(a.dry_run,'dry_run',true);
    const row = await this.globalChoice(a.global_choice_name,signal);
    const body = {ParameterXml:`<importexportxml><optionsets><optionset>${name(row.Name,'global_choice_name')}</optionset></optionsets></importexportxml>`};
    const state = {environment:this.environment,operation:'publish_global_choices',globalChoiceName:row.Name,
      scope:'entire_shared_global_choice_including_other_pending_changes',publication:'not_requested'};
    if (dry) return {...state,dryRun:true,request:{method:'POST',path:'/PublishXml',body}};
    try { await this.write('/PublishXml','POST',body,{},state,signal); }
    catch (error) {
      if (error instanceof ModelMetadataError) throw new ModelMetadataError('D365_MODEL_PUBLISH_FAILED','Global choice publication was not confirmed. No save was replayed.',
        {...state,publication:error.details.outcome === 'unknown' ? 'unknown' : 'failed',issue:error.data.issue},error.details);
      throw error;
    }
    return {...state,publication:'published',modelDrivenUi:'not_verified'};
  }
}
