import {validXmlCharacters} from './xmlCharacters.js';
import {DOMParser,type Element} from '@xmldom/xmldom';
import {createHash} from 'node:crypto';
import {CrmRequestError,type CrmErrorDetails} from '../errors.js';

export type Row = Record<string,any>;
export const EDM = 'http://docs.oasis-open.org/odata/ns/edm';
const EDMX = 'http://docs.oasis-open.org/odata/ns/edmx';
export class OperationError extends CrmRequestError {
  constructor(code:string,message:string,readonly data:Row = {},details:CrmErrorDetails = {outcome:'not_sent'}) {super('D365_OPERATION_' + code,message,details);}
  override toJSON() {return {...super.toJSON(),data:this.data};}
}
export function fail(code:string,message:string,data:Row = {}):never {throw new OperationError(code,message,data);}
export function identifier(value:unknown):string {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) || value.length > 256) fail('INVALID','A valid case-sensitive identifier is required.');
  return value;
}
function qualified(value:string):string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(value) || value.length > 512) fail('METADATA_INVALID','The CSDL qualified name is invalid.');
  return value;
}
export function digest(value:unknown):string {
  const canonical = (value:any):any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function object(value:unknown):Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID','Expected a JSON argument object.');
  return value as Row;
}
const aliases:Record<string,string> = {actionName:'action_name',isFunction:'is_function',collectionName:'collection_name',
  signatureId:'signature_id',dryRun:'dry_run',expectedHash:'expected_hash',returnDetails:'return_details',includeParameterValues:'include_parameter_values'};
export function args(raw:unknown,allowed:string[]):Row {
  const input = object(raw),result:Row = {};
  const active = new Set<object>();let count = 0;
  const json = (value:unknown,depth:number):void => {
    if (++count > 10000 || depth > 24) fail('LIMIT','Operation arguments exceed their JSON structural limit.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || value === undefined) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || active.has(value) || !Array.isArray(value) && ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('INVALID','Operation arguments must be finite, acyclic JSON values.');
    active.add(value);for (const item of Object.values(value)) json(item,depth+1);active.delete(value);
  };
  json(input,0);
  if (Buffer.byteLength(JSON.stringify(input)) > 1024 * 1024) fail('LIMIT','Operation arguments exceed 1 MiB.');
  for (const [key,value] of Object.entries(input)) {
    if (value === undefined) continue;
    const name = Object.hasOwn(aliases,key) ? aliases[key] : key;
    if (!allowed.includes(name)) fail('INVALID','An unknown operation argument was supplied.');
    if (Object.hasOwn(result,name) && digest(result[name]) !== digest(value)) fail('INVALID','Conflicting operation aliases.');
    Object.defineProperty(result,name,{value,enumerable:true,writable:true,configurable:true});
  }
  return result;
}
export function flag(value:unknown,fallback = false):boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail('INVALID','A Boolean option is required.');
  return value;
}
export interface TypeRef {type:string;collection:boolean;nullable:boolean;optional:boolean;maxLength?:number;precision?:number;scale?:number;}
export interface Parameter extends TypeRef {name:string;}
export interface NativeType {name:string;kind:'entity'|'complex'|'enum';base?:string;abstract:boolean;properties:Map<string,Parameter>;keys:string[];members:string[];flags:boolean;}
export interface Operation {name:string;qualifiedName:string;kind:'Action'|'Function';bound:boolean;parameters:Parameter[];returnType?:TypeRef;imports:string[];signatureId:string;}
function children(parent:Element,name?:string):Element[] {
  const result:Element[] = [];
  for (let child = parent.firstChild;child;child = child.nextSibling) if (child.nodeType === 1 && (child as Element).namespaceURI === EDM
    && (!name || (child as Element).localName === name)) result.push(child as Element);
  return result;
}
function boolAttribute(element:Element,name:string,fallback = false):boolean {
  const value = element.getAttribute(name); if (value === null || value === '') return fallback;
  if (!['true','false'].includes(value)) fail('METADATA_INVALID','A CSDL Boolean attribute is invalid.');
  return value === 'true';
}

/** Parse only the current service document. No external references are fetched. */
export class OperationMetadata {
  readonly types = new Map<string,NativeType>();
  readonly sets = new Map<string,string>();
  readonly operations:Operation[] = [];
  readonly aliases = new Map<string,string>();
  readonly metadataHash:string;
  constructor(source:unknown) {
    if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source) > 32 * 1024 * 1024 || !validXmlCharacters(source) || /<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) fail('METADATA_INVALID','CSDL must be XML within 32 MiB without DTD/entity declarations.');
    let tags = 0;
    for (let index = source.indexOf('<');index !== -1;index = source.indexOf('<',index+1)) if (++tags > 500000) fail('METADATA_INVALID','The CSDL document exceeds its token limit.');
    this.metadataHash = createHash('sha256').update(source).digest('hex');
    let root:Element;
    try {
      const document = new DOMParser({onError:() => {throw new Error();}}).parseFromString(source,'application/xml');
      root = document.documentElement!;
      if (!root || root.localName !== 'Edmx' || root.namespaceURI !== EDMX || document.doctype) throw new Error();
      const stack:{element:Element;depth:number}[] = [{element:root,depth:0}];let count = 0;
      while (stack.length) {
        const {element,depth} = stack.pop()!;
        if (++count > 500000 || depth > 64) throw new Error();
        for (let child = element.firstChild;child;child = child.nextSibling) if (child.nodeType === 1) stack.push({element:child as Element,depth:depth+1});
      }
    } catch {fail('METADATA_INVALID','The native CSDL document is invalid or exceeds its structural limits.');}
    const services = Array.from(root.childNodes).filter(item => item.nodeType === 1 && (item as Element).namespaceURI === EDMX && (item as Element).localName === 'DataServices');
    if (services.length !== 1) fail('METADATA_INVALID','One native DataServices document is required.');
    const schemas = children(services[0] as Element,'Schema');
    if (!schemas.length || schemas.length > 100) fail('METADATA_INVALID','The CSDL schema collection is invalid.');
    for (const schema of schemas) {
      const namespace = schema.getAttribute('Namespace') || '';
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(namespace) || namespace === 'Edm') fail('METADATA_INVALID','Invalid CSDL namespace.');
      if (this.aliases.has(namespace) && this.aliases.get(namespace) !== namespace) fail('METADATA_INVALID','Conflicting CSDL namespace aliases.');
      this.aliases.set(namespace,namespace);
      const alias = schema.getAttribute('Alias');
      if (alias) { identifier(alias); if (alias === 'Edm' || this.aliases.has(alias) && this.aliases.get(alias) !== namespace) fail('METADATA_INVALID','Conflicting CSDL namespace aliases.'); this.aliases.set(alias,namespace); }
    }
    const imports:{name:string;operation:string;kind:string}[] = [];
    for (const schema of schemas) {
      const namespace = schema.getAttribute('Namespace')!;
      for (const element of children(schema)) {
        const tag = element.localName;
        if (['EntityType','ComplexType','EnumType'].includes(tag!)) {
          const name = namespace + '.' + identifier(element.getAttribute('Name'));
          if (this.types.has(name) || this.types.size >= 30000) fail('METADATA_INVALID','The CSDL type collection is invalid or exceeds its limit.');
          const properties = new Map<string,Parameter>();
          for (const property of children(element,'Property')) {
            const item = this.parameter(property);
            if (properties.has(item.name) || properties.size >= 2048) fail('METADATA_INVALID','Invalid CSDL structural property collection.');
            properties.set(item.name,item);
          }
          const members = children(element,'Member').map(member => identifier(member.getAttribute('Name')));
          if (members.length > 5000 || new Set(members).size !== members.length) fail('METADATA_INVALID','The CSDL enumeration members are invalid.');
          const keys = children(element,'Key').flatMap(key => children(key,'PropertyRef').map(item => identifier(item.getAttribute('Name'))));
          this.types.set(name,{name,kind:tag === 'EntityType' ? 'entity' : tag === 'EnumType' ? 'enum' : 'complex',base:element.getAttribute('BaseType') ? this.qualify(element.getAttribute('BaseType')!) : undefined,
            abstract:boolAttribute(element,'Abstract'),properties,keys,members,flags:boolAttribute(element,'IsFlags')});
        } else if (tag === 'Action' || tag === 'Function') {
          const name = identifier(element.getAttribute('Name')),parameters = children(element,'Parameter').map(item => this.parameter(item));
          if (parameters.length > 100 || new Set(parameters.map(item => item.name)).size !== parameters.length || this.operations.length >= 30000) fail('METADATA_INVALID','The CSDL operation parameters are invalid.');
          const bound = boolAttribute(element,'IsBound');
          if (bound && !parameters.length) fail('METADATA_INVALID','A bound operation has no binding parameter.');
          const returns = children(element,'ReturnType'); if (returns.length > 1 || tag === 'Function' && returns.length !== 1) fail('METADATA_INVALID','Invalid CSDL operation return type.');
          this.operations.push({name,qualifiedName:namespace + '.' + name,kind:tag,bound,parameters,
            returnType:returns.length ? this.typeRef(returns[0]) : undefined,imports:[],signatureId:''});
        } else if (tag === 'EntityContainer') {
          for (const set of children(element,'EntitySet')) {
            const name = identifier(set.getAttribute('Name'));
            if (this.sets.has(name)) fail('METADATA_INVALID','Duplicate native entity set.');
            this.sets.set(name,this.qualify(set.getAttribute('EntityType') || ''));
          }
          for (const kind of ['Action','Function']) for (const item of children(element,kind + 'Import')) imports.push({
            name:identifier(item.getAttribute('Name')),operation:this.qualify(item.getAttribute(kind) || ''),kind});
        }
      }
    }
    const imported = new Map<string,Set<string>>();
    for (const item of imports) {
      const key = item.kind + ':' + item.operation;
      if (!imported.has(key)) imported.set(key,new Set());
      imported.get(key)!.add(item.name);
    }
    const signatures = new Set<string>();
    for (const operation of this.operations) {
      operation.imports = [...(imported.get(operation.kind + ':' + operation.qualifiedName) ?? [])].sort();
      operation.signatureId = digest({...operation,signatureId:undefined});
      if (signatures.has(operation.signatureId)) fail('METADATA_INVALID','Duplicate operation signatures.');
      signatures.add(operation.signatureId);
    }
  }
  qualify(value:string):string {
    qualified(value);
    const index = value.lastIndexOf('.'),prefix = value.slice(0,index),name = value.slice(index+1);
    return (this.aliases.get(prefix) ?? prefix) + '.' + name;
  }
  private typeRef(element:Element):TypeRef {
    let type = element.getAttribute('Type') || '',collection = false;
    if (type.startsWith('Collection(') && type.endsWith(')')) {collection = true; type = type.slice(11,-1);}
    const result:TypeRef = {type:this.qualify(type),collection,nullable:boolAttribute(element,'Nullable',true),optional:false};
    for (const [source,target] of [['MaxLength','maxLength'],['Precision','precision'],['Scale','scale']] as const) {
      const value = element.getAttribute(source);
      if (value && !['max','variable'].includes(value)) {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail('METADATA_INVALID','Invalid CSDL parameter facet.');
        result[target] = Number(value);
      }
    }
    result.optional = children(element,'Annotation').some(item => ['Org.OData.Core.V1.OptionalParameter','Core.OptionalParameter'].includes(item.getAttribute('Term') || ''));
    return result;
  }
  private parameter(element:Element):Parameter {return {name:identifier(element.getAttribute('Name')),...this.typeRef(element)};}
  assignable(actual:string,wanted:string):boolean {
    const seen = new Set<string>();
    for (let next:string|undefined = actual;next;next = this.types.get(next)?.base) {
      if (next === wanted) return true;
      if (seen.has(next) || seen.size > 32) fail('METADATA_INVALID','Cyclic or deeply nested native type inheritance.');
      seen.add(next);
    }
    return false;
  }
  structure(type:string):{properties:Map<string,Parameter>;keys:string[]} {
    const properties = new Map<string,Parameter>(),keys:string[] = [],seen = new Set<string>();
    const walk = (name:string) => {
      if (seen.has(name) || seen.size > 32) fail('METADATA_INVALID','Cyclic or deep native type inheritance.');
      seen.add(name);
      const value = this.types.get(name); if (!value || value.kind === 'enum') fail('TYPE_UNSUPPORTED','The native structured type is unavailable.');
      if (value.base) walk(value.base);
      for (const [name,property] of value.properties) {if (properties.has(name)) fail('METADATA_INVALID','Duplicate inherited structural property.');properties.set(name,property);}
      keys.push(...value.keys);
    };
    walk(type);return {properties,keys};
  }
  lookup(name:unknown,isFunction?:boolean):Operation[] {
    if (typeof name !== 'string' || name.length > 512) fail('INVALID','action_name must be a native operation name.');
    const full = name.includes('.') ? this.qualify(name) : identifier(name);
    const values = this.operations.filter(item => (item.name === full || item.qualifiedName === full || item.imports.includes(full))
      && (isFunction === undefined || item.kind === (isFunction ? 'Function' : 'Action')));
    if (!values.length) fail('NOT_FOUND','No matching operation was exposed by the current CSDL.');
    if (values.length > 100) fail('LIMIT','The operation has too many overloads to inspect safely.');
    return values;
  }
  describe(operation:Operation):Row {
    return {name:operation.name,qualifiedName:operation.qualifiedName,kind:operation.kind,signatureId:operation.signatureId,
      bound:operation.bound,binding:operation.bound ? operation.parameters[0] : null,
      parameters:operation.parameters.slice(operation.bound ? 1 : 0),returnType:operation.returnType ?? null,
      imports:operation.imports,invocable:operation.bound || operation.imports.length > 0};
  }
}
