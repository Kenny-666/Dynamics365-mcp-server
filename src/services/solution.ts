import type {CrmRequestClient} from '../types/crmRequest.js';
import {CrmRequestError} from '../errors.js';
import {CacheService} from './cache.js';
import {OperationMetadata,digest,type Operation} from './apiOperationMetadata.js';
import {OperationValues} from './apiOperationValues.js';
import {evidence} from './pluginStepValidation.js';
import {SolutionReader,SolutionError,args,fail,flag,guid,integer,name,objectId,project,protect,row,type Row} from './solutionSupport.js';
import {resolveComponent} from './solutionComponent.js';

const SOLUTION = 'solutionid,uniquename,friendlyname,version,ismanaged,isvisible,modifiedon,_parentsolutionid_value';
const MEMBER = 'solutioncomponentid,objectid,componenttype,_solutionid_value,rootcomponentbehavior,rootsolutioncomponentid,ismetadata';
const DEPENDENCY = 'dependencyid,dependencytype,dependentcomponentobjectid,dependentcomponenttype,dependentcomponentparentid,dependentcomponentbasesolutionid,requiredcomponentobjectid,requiredcomponenttype,requiredcomponentparentid,requiredcomponentbasesolutionid';
const methods:Record<string,string> = {required:'RetrieveRequiredComponents',dependent:'RetrieveDependentComponents',delete:'RetrieveDependenciesForDelete'};
function solution(value:unknown):Row {
  const result = project(value,SOLUTION);result.solutionid = objectId(result.solutionid);name(result.uniquename);
  if (typeof result.ismanaged !== 'boolean' || typeof result.isvisible !== 'boolean') fail('RESPONSE_INVALID','The solution state is incomplete.');
  result._parentsolutionid_value = guid(result._parentsolutionid_value,true);return result;
}
function member(value:unknown,solutionId:string):Row {
  const result = project(value,MEMBER);result.solutioncomponentid = objectId(result.solutioncomponentid);
  result.objectid = guid(result.objectid,true);result._solutionid_value = objectId(result._solutionid_value);
  if (result._solutionid_value !== solutionId) fail('RESPONSE_INVALID','A component row belongs to a different solution.');
  result.componenttype = integer(result.componenttype,0);
  if (result.componenttype === 0) fail('RESPONSE_INVALID','A native component type is missing.');
  result.rootsolutioncomponentid = guid(result.rootsolutioncomponentid,true);
  if (result.rootcomponentbehavior != null && ![0,1,2].includes(result.rootcomponentbehavior)) fail('RESPONSE_INVALID','The native root-component scope is unknown.');
  return result;
}
function dependency(value:unknown):Row {
  const result = project(value,DEPENDENCY);
  for (const key of ['dependentcomponent','requiredcomponent']) {
    result[key + 'objectid'] = objectId(result[key + 'objectid']);
    result[key + 'type'] = integer(result[key + 'type'],0);if (!result[key + 'type']) fail('RESPONSE_INVALID','A dependency component type is missing.');
    for (const part of ['parentid','basesolutionid']) if (result[key + part] !== undefined) result[key + part] = guid(result[key + part],true);
  }
  if (result.dependencyid !== undefined) result.dependencyid = guid(result.dependencyid,true);
  if (result.dependencytype !== undefined) result.dependencytype = integer(result.dependencytype,0,0);
  return result;
}
const query = (path:string,values:Record<string,string>) => path + '?' + new URLSearchParams(values);
export class SolutionService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:{orgUrl:string;apiVersion:string;authType:string}) {}
  private reader(signal?:AbortSignal) {return new SolutionReader(this.client,this.environment,signal);}
  private async target(reader:SolutionReader,uniqueName:unknown):Promise<Row> {
    const selected = name(uniqueName),result = row((await reader.request(query('/solutions',{$select:SOLUTION,$filter:"uniquename eq '" + selected + "'",$top:'2'}))).data);
    if (!Array.isArray(result.value) || result.value.length !== 1 || result['@odata.nextLink']) fail('TARGET','The solution was not uniquely returned.');
    const selectedSolution = solution(result.value[0]);
    if (selectedSolution.uniquename !== selected) fail('RESPONSE_INVALID','The requested solution name did not match.');return selectedSolution;
  }
  private members(reader:SolutionReader,target:Row,top:number,pages:number,extra:string[] = []) {
    return reader.list(query('/solutioncomponents',{$select:MEMBER,$filter:['_solutionid_value eq ' + target.solutionid,...extra].join(' and '),
      $orderby:'solutioncomponentid'}),top,pages,value => member(value,target.solutionid),value => value.solutioncomponentid);
  }
  list(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = args(raw,['solution_unique_name','solution_id','is_managed','top','max_pages']),filters:string[] = [];
      if (a.solution_unique_name !== undefined) filters.push("uniquename eq '" + name(a.solution_unique_name) + "'");
      if (a.solution_id !== undefined) filters.push('solutionid eq ' + objectId(a.solution_id));
      if (a.is_managed !== undefined) filters.push('ismanaged eq ' + flag(a.is_managed));
      const values:Record<string,string> = {$select:SOLUTION,$orderby:'solutionid'};
      if (filters.length) values.$filter = filters.join(' and ');
      const result = await this.reader(signal).list(query('/solutions',values),integer(a.top,500,1,5000),integer(a.max_pages,5,1,20),solution,item => item.solutionid);
      return {success:true,environment:this.environment,...result,count:result.items.length};
    });
  }
  listComponents(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = args(raw,['solution_unique_name','component_id','component_type','top','max_pages']),reader = this.reader(signal),target = await this.target(reader,a.solution_unique_name),extra:string[] = [];
      if (a.component_id !== undefined) extra.push('objectid eq ' + objectId(a.component_id));
      if (a.component_type !== undefined) extra.push('componenttype eq ' + integer(a.component_type,0));
      const result = await this.members(reader,target,integer(a.top,500,1,5000),integer(a.max_pages,5,1,20),extra);
      return {success:true,environment:this.environment,solution:target,...result,count:result.items.length,scope:'visible_membership_rows_not_export_payload'};
    });
  }
  private async metadata(reader:SolutionReader):Promise<OperationMetadata> {
    return new OperationMetadata((await reader.request('/$metadata','GET',undefined,{Accept:'application/xml'})).data);
  }
  private native(model:OperationMetadata,method:string,kind:'Action'|'Function',expected:Record<string,string>,optional:Record<string,string> = {}):Operation {
    let candidates:Operation[];
    try {candidates = model.lookup(method,kind === 'Function');}
    catch {return fail('NATIVE_CONTRACT_UNSUPPORTED','The current CSDL does not expose the required native solution operation.',{method});}
    const matches = candidates.filter(item => item.qualifiedName === 'Microsoft.Dynamics.CRM.' + method && !item.bound && item.imports.includes(method)
      && Object.keys(expected).every(key => item.parameters.some(parameter => parameter.name === key && (parameter.collection ? 'Collection(' + parameter.type + ')' : parameter.type) === expected[key]))
      && item.parameters.every(parameter => (expected[parameter.name] ?? optional[parameter.name]) === (parameter.collection ? 'Collection(' + parameter.type + ')' : parameter.type)));
    if (matches.length !== 1 || kind === 'Function' && !matches[0].returnType?.collection) fail('NATIVE_CONTRACT_UNSUPPORTED','The current CSDL does not expose the expected solution operation contract.',{method});
    return matches[0];
  }
  private async dependencies(reader:SolutionReader,model:OperationMetadata,id:string,type:number,kind:string,top:number,maxPages:number) {
    const method = methods[kind];if (!method) fail('INVALID','direction must be required, dependent or delete.');
    const operation = this.native(model,method,'Function',{ObjectId:'Edm.Guid',ComponentType:'Edm.Int32'}),values = new OperationValues(model,true),aliases = new URLSearchParams(),names:string[] = [];
    for (const parameter of operation.parameters) {
      const value = values.value(parameter,parameter.name === 'ObjectId' ? id : type),alias = '@p' + (names.length+1);
      names.push(parameter.name + '=' + alias);aliases.set(alias,values.literal(parameter,value));
    }
    const result = await reader.list('/' + method + '(' + names.join(',') + ')?' + aliases,top,maxPages,dependency,item => digest(item));
    return {...result,count:result.items.length,method,direction:kind,signatureId:operation.signatureId,requested:{objectId:id,componentType:type},
      interpretation:kind === 'required' ? 'components_this_component_directly_requires' : kind === 'dependent' ? 'components_directly_depending_on_this_component' : 'native_dependency_records_that_could_block_deletion',
      canDelete:'not_assessed',transitiveClosure:'not_computed',visibility:'current_caller'};
  }
  getDependencies(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = args(raw,['component_id','component_type','direction','top','max_pages']),id = objectId(a.component_id),type = integer(a.component_type,0);
      if (!type) fail('INVALID','component_type is required.');
      const kind = a.direction ?? 'required';if (!Object.hasOwn(methods,kind)) fail('INVALID','Unknown dependency direction.');
      const reader = this.reader(signal),model = await this.metadata(reader);
      return {success:true,environment:this.environment,...await this.dependencies(reader,model,id,type,kind,integer(a.top,500,1,5000),integer(a.max_pages,5,1,20)),
        note:'An empty or complete visible result is not deletion permission, full graph closure or deployment readiness.'};
    });
  }
  add(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = args(raw,['solution_unique_name','component_id','component_type','logical_name','dry_run','expected_hash','allow_unprotected_write']),id = objectId(a.component_id),type = integer(a.component_type,0);
      const dry = flag(a.dry_run,true),unprotected = flag(a.allow_unprotected_write);
      if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('INVALID','expected_hash must be the preview planHash.');
      const reader = this.reader(signal),target = await this.target(reader,a.solution_unique_name);
      if (target.ismanaged !== false || target.isvisible !== true || target._parentsolutionid_value || ['default','active','system'].includes(target.uniquename.toLowerCase())) fail('TARGET','Only a visible, ordinary unmanaged solution is supported for controlled add.');
      const component = await resolveComponent(reader,id,type,a.logical_name),model = await this.metadata(reader);
      const operation = this.native(model,'AddSolutionComponent','Action',{ComponentId:'Edm.Guid',ComponentType:'Edm.Int32',SolutionUniqueName:'Edm.String',AddRequiredComponents:'Edm.Boolean',DoNotIncludeSubcomponents:'Edm.Boolean'},
        {IncludedComponentSettingsValues:'Collection(Edm.String)'});
      const parameters:Row = {ComponentId:id,ComponentType:type,SolutionUniqueName:target.uniquename,AddRequiredComponents:false,DoNotIncludeSubcomponents:true};
      if (operation.parameters.some(item => item.name === 'IncludedComponentSettingsValues')) parameters.IncludedComponentSettingsValues = [];
      const validator = new OperationValues(model,false),body = Object.fromEntries(operation.parameters.map(parameter => [parameter.name,validator.value(parameter,parameters[parameter.name])]));
      const before = await this.members(reader,target,5000,20),required = await this.dependencies(reader,model,id,type,'required',5000,20);
      if (!before.paging.complete || !required.paging.complete) fail('INCOMPLETE','A complete visible membership/dependency baseline is required; no write was planned.');
      const ordered = (items:Row[]) => [...items].sort((left,right) => digest(left).localeCompare(digest(right)));
      const existing = before.items.filter(item => item.objectid === id && item.componenttype === type);
      const planHash = digest({environment:this.environment,target,component,metadataHash:model.metadataHash,body,members:ordered(before.items),required:ordered(required.items)});
      const state = {environment:this.environment,operation:'add_solution_component',solution:target,component,planHash,saved:false,
        scope:{addRequiredComponents:false,includeSubcomponents:false,settings:[]},concurrency:'unprotected_native_action',publication:'not_requested',
        membershipBaselineCount:before.items.length,alreadyMember:!!existing.length,existingMembership:existing};
      if (a.expected_hash !== undefined && a.expected_hash !== planHash) fail('CONFLICT','The solution/component/dependency plan changed. Preview again.',{planHash});
      if (dry) return {...state,dryRun:true,request:{method:'POST',path:'/AddSolutionComponent',body},requiredDependencies:required,
        note:'No automatic dependency/subcomponent inclusion is requested. The platform can still create implicit parent shells. Membership rows do not prove export contents or portability.'};
      if (!a.expected_hash || !unprotected) fail('CONCURRENCY','Execution requires the current planHash as expected_hash and allow_unprotected_write=true. The native Action has no confirmed atomic lock.');
      if (existing.length) return {...state,dryRun:false,noChange:true,existingScopeUnchanged:true};
      let response;
      try {response = await reader.request('/AddSolutionComponent','POST',body);}
      catch (error) {
        const outcome = error instanceof CrmRequestError ? error.details.outcome ?? 'unknown' : 'unknown';
        throw new SolutionError('ADD_FAILED','The component-add Action was not confirmed. Do not replay an unknown write.',{...state,saved:outcome === 'unknown' ? null : false,phase:'add'},evidence(error));
      }
      CacheService.flushExisting();
      try {
        const responseId = response.data == null || row(response.data).id === undefined ? null : objectId(row(response.data).id);
        const actualSolution = await this.target(reader,target.uniquename);
        if (actualSolution.solutionid !== target.solutionid || actualSolution.ismanaged !== false || actualSolution.isvisible !== true || actualSolution.version !== target.version
          || actualSolution._parentsolutionid_value !== target._parentsolutionid_value) fail('READBACK_MISMATCH','The destination solution identity/state changed after adding.');
        const after = await this.members(reader,actualSolution,5000,20);
        if (!after.paging.complete) fail('READBACK_INCOMPLETE','The Action succeeded, but membership readback is incomplete.');
        const matches = after.items.filter(item => item.objectid === id && item.componenttype === type);
        if (!matches.length || responseId && !matches.some(item => item.solutioncomponentid === responseId)
          || type === 1 && !matches.some(item => item.rootcomponentbehavior === 1)) fail('READBACK_MISMATCH','The actual membership/root scope does not match the requested component add.');
        const old = new Map(before.items.map(item => [item.solutioncomponentid,item])),current = new Map(after.items.map(item => [item.solutioncomponentid,item]));
        const added = after.items.filter(item => !old.has(item.solutioncomponentid)),removed = before.items.filter(item => !current.has(item.solutioncomponentid));
        const changed = after.items.filter(item => old.has(item.solutioncomponentid) && digest(item) !== digest(old.get(item.solutioncomponentid)));
        return {...state,success:true,dryRun:false,saved:true,responseSolutionComponentId:responseId,membershipAfterCount:after.items.length,readback:{status:'matched',membership:matches},
          observedChanges:{added,removed,changed,attribution:'observed_between_nontransactional_reads'},dependencyClosureVerified:false,exportContentsVerified:false};
      } catch (error) {
        const {outcome:ignoredOutcome,...details} = evidence(error);
        throw new SolutionError('READBACK_FAILED','The component-add Action succeeded, but membership readback was not confirmed. Do not repeat the add.',
          {...state,saved:true,phase:'readback',cause:error instanceof CrmRequestError ? error.code : 'D365_SOLUTION_REQUEST_FAILED'},details);
      }
    });
  }
}
