import {CrmRequestError} from '../errors.js';
import type {CrmDataClient,CrmRequestClient,CrmHttpMethod} from '../types/crmRequest.js';
import {CacheService} from './cache.js';
import {evidence} from './pluginStepValidation.js';
import {OperationMetadata,OperationError,args,digest,fail,flag,identifier,object,type Operation,type Row} from './apiOperationMetadata.js';
import {OperationValues,guid} from './apiOperationValues.js';

type Client = CrmDataClient & Partial<Pick<CrmRequestClient,'requestWithResponse'>>;
export class ApiOperationService {
  constructor(private readonly client:Client,private readonly environment:Row = {}) {}
  private async send(endpoint:string,method:CrmHttpMethod,body:unknown,headers:Record<string,string>,signal?:AbortSignal) {
    if (signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','The operation was cancelled before sending.',{outcome:'not_sent'});
    if (this.client.requestWithResponse) {
      const response = await this.client.requestWithResponse(endpoint,method,body,{headers,signal});
      if (response.status < 200 || response.status >= 300) throw new CrmRequestError('D365_OPERATION_RESPONSE_INVALID','Unexpected native response.',
        {status:response.status,outcome:method === 'POST' && response.status >= 500 ? 'unknown' : 'rejected'});
      return response;
    }
    // Compatibility for source-level RecordService callers using a data-only client; never invent a status.
    return {data:await this.client.makeRequest(endpoint,method,body,{headers,signal}),status:null,headers:{}};
  }
  private async metadata(signal?:AbortSignal) {
    try {return new OperationMetadata((await this.send('/$metadata','GET',undefined,{Accept:'application/xml'},signal)).data);}
    catch (error) {
      if (error instanceof OperationError) throw error;
      throw new OperationError('METADATA_UNAVAILABLE','The current service CSDL could not be read. No operation was invoked.',{phase:'metadata'},evidence(error));
    }
  }
  async describe(raw:unknown,signal?:AbortSignal) {
    const a = args(raw,['action_name','is_function','binding','signature_id']),kind = a.is_function === undefined ? undefined : flag(a.is_function);
    const metadata = await this.metadata(signal);
    let operations = metadata.lookup(a.action_name,kind);
    if (a.signature_id !== undefined) operations = operations.filter(item => item.signatureId === this.signature(a.signature_id));
    if (a.binding !== undefined) operations = operations.filter(item => this.binding(metadata,item,a.binding) !== null);
    if (!operations.length) fail('NOT_FOUND','No signature matches the requested filters.');
    const types = new Map<string,Row>();
    for (const operation of operations) for (const parameter of operation.parameters.slice(operation.bound ? 1 : 0)) {
      const type = metadata.types.get(parameter.type);if (!type || types.has(type.name)) continue;
      if (types.size >= 100) fail('LIMIT','Too many direct input type definitions.');
      types.set(type.name,{name:type.name,kind:type.kind,base:type.base ?? null,abstract:type.abstract,
        properties:type.kind === 'enum' ? [] : [...metadata.structure(type.name).properties.values()],
        keys:type.kind === 'entity' ? metadata.structure(type.name).keys : [],members:type.members,flags:type.flags});
    }
    const result = {success:true,environment:this.environment,metadataHash:metadata.metadataHash,signatures:operations.map(item => metadata.describe(item)),
      directInputTypes:[...types.values()],nestedTypesExpanded:false,permissionAndRuntime:'not_verified'};
    if (Buffer.byteLength(JSON.stringify(result)) > 2 * 1024 * 1024) fail('LIMIT','The signature description exceeds 2 MiB.');
    return result;
  }
  private signature(value:unknown):string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID','signature_id must be an advertised SHA-256 signature ID.');
    return value;
  }
  private binding(metadata:OperationMetadata,operation:Operation,raw:unknown):Row|null {
    if (!operation.bound) return raw === undefined ? {} : null;
    if (raw === undefined) return null;
    const input = args(raw,['collection_name','id']),set = identifier(input.collection_name),type = metadata.sets.get(set),parameter = operation.parameters[0];
    if (!type || metadata.types.get(type)?.kind !== 'entity' || metadata.types.get(parameter.type)?.kind !== 'entity') fail('BINDING_INVALID','The binding must identify an exposed native entity set/type.');
    if (!metadata.assignable(type,parameter.type)) return null;
    const structure = metadata.structure(type);
    if (parameter.collection) {if (input.id !== undefined) return null;return {collectionName:set,type,collection:true,path:'/' + set};}
    if (input.id === undefined) return null;
    if (structure.keys.length !== 1 || structure.properties.get(structure.keys[0])?.type !== 'Edm.Guid') fail('BINDING_INVALID','Single-record binding requires the native table single Guid key.');
    const id = guid(input.id);return {collectionName:set,type,collection:false,id,path:'/' + set + '(' + id + ')'};
  }
  async invoke(raw:unknown,signal?:AbortSignal):Promise<any> {
    const a = args(raw,['action_name','is_function','parameters','binding','signature_id','dry_run','expected_hash','return_details','include_parameter_values']);
    const isFunction = flag(a.is_function),dryRun = flag(a.dry_run),details = flag(a.return_details),includeValues = flag(a.include_parameter_values);
    if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('INVALID','expected_hash must be a preview planHash.');
    const parameters = a.parameters === undefined ? {} : object(a.parameters),metadata = await this.metadata(signal);
    let operations = metadata.lookup(a.action_name,isFunction);
    if (a.signature_id !== undefined) {const id = this.signature(a.signature_id);operations = operations.filter(item => item.signatureId === id);}
    const matches:{operation:Operation;binding:Row;parameters:Row}[] = [],rejected:OperationError[] = [];
    for (const operation of operations) {
      const binding = this.binding(metadata,operation,a.binding);if (!binding || !operation.bound && !operation.imports.length) continue;
      try {
        const supplied = Object.keys(parameters),expected = operation.parameters.slice(operation.bound ? 1 : 0),values = new OperationValues(metadata,isFunction);
        if (supplied.some(name => !expected.some(item => item.name === name))) fail('PARAMETERS_INVALID','An unknown or binding parameter was supplied in parameters.');
        const normalized:[string,any][] = [];
        for (const parameter of expected) {
          if (!Object.hasOwn(parameters,parameter.name)) {
            if (!parameter.optional && (isFunction || !parameter.nullable)) fail('PARAMETERS_INVALID','A required native operation parameter is missing.',{parameter:parameter.name});
            continue;
          }
          normalized.push([parameter.name,values.value(parameter,parameters[parameter.name])]);
        }
        matches.push({operation,binding,parameters:Object.fromEntries(normalized)});
      } catch (error) {if (error instanceof OperationError) rejected.push(error);else throw error;}
    }
    if (!matches.length) {
      if (rejected.length === 1) throw rejected[0];
      fail('NO_MATCH','No callable overload matches the binding and parameter types.',{candidateCount:operations.length});
    }
    if (matches.length > 1) fail('AMBIGUOUS','Multiple overloads match; use get_api_operation and provide signature_id.',{signatures:matches.map(item => item.operation.signatureId)});
    const selected = matches[0],operation = selected.operation,values = new OperationValues(metadata,isFunction);
    let name:string;
    if (operation.bound) name = operation.qualifiedName;
    else if (operation.imports.includes(a.action_name)) name = a.action_name;
    else if (operation.imports.includes(operation.name)) name = operation.name;
    else if (operation.imports.length === 1) name = operation.imports[0];
    else fail('AMBIGUOUS','The operation exposes multiple import names; use an exact import name.');
    const path = (operation.bound ? selected.binding.path + '/' : '/') + name,query = new URLSearchParams();
    let endpoint = path,body:Row|undefined = selected.parameters;
    if (isFunction) {
      const names:string[] = [];
      for (const parameter of operation.parameters.slice(operation.bound ? 1 : 0)) {
        if (!Object.hasOwn(selected.parameters,parameter.name)) continue;
        const alias = '@p' + (names.length + 1);names.push(parameter.name + '=' + alias);
        query.set(alias,values.literal(parameter,selected.parameters[parameter.name]));
      }
      const encoded = query.toString();
      endpoint += '(' + names.join(',') + ')' + (encoded ? '?' + encoded : '');body = undefined;
      if (Buffer.byteLength(endpoint) > 32768) fail('LIMIT','The encoded Function URL exceeds the 32 KiB limit.');
    }
    const signature = metadata.describe(operation),planHash = digest({environment:this.environment,metadataHash:metadata.metadataHash,
      signatureId:operation.signatureId,binding:selected.binding,parameters:selected.parameters});
    if (a.expected_hash !== undefined && a.expected_hash !== planHash) fail('CONFLICT','The reviewed operation plan changed. Preview it again.',{planHash});
    const state = {environment:this.environment,kind:operation.kind,name:operation.qualifiedName,signatureId:operation.signatureId,
      binding:operation.bound ? selected.binding : null,planHash};
    if (dryRun) return {success:true,...state,dryRun:true,executed:false,signature,request:{method:isFunction ? 'GET' : 'POST',path,
      parameterNames:Object.keys(selected.parameters),values:includeValues ? selected.parameters : 'withheld',
      ...(includeValues ? {endpoint,body:body ?? null} : {})},
      note:'Preview does not lock records or prove permission, operation availability at execution time, business validation or runtime behavior.'};
    try {
      const response = await this.send(endpoint,isFunction ? 'GET' : 'POST',body,{Accept:'application/json','Content-Type':'application/json;IEEE754Compatible=true'},signal);
      if (!isFunction) CacheService.flushExisting();
      if (!details) return response.data;
      return {success:true,...state,executed:true,submitted:isFunction ? undefined : true,status:response.status,data:response.data,
        completion:'native_response_only',businessReadback:'not_performed'};
    } catch (error) {
      const outcome = error instanceof CrmRequestError ? error.details.outcome ?? 'unknown' : 'unknown';
      throw new OperationError('FAILED','The native operation failed. Parameter values and platform message text are withheld; no service-level replay was attempted.',
        {...state,phase:'invoke',executed:outcome === 'unknown' ? null : false,submitted:isFunction ? undefined : outcome === 'unknown' ? null : false},evidence(error));
    }
  }
}
