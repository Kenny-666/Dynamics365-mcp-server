import {OperationMetadata,fail,object,type TypeRef} from './apiOperationMetadata.js';

const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function guid(value:unknown):string {if (typeof value !== 'string' || !GUID.test(value)) fail('TYPE_INVALID','An entity/Guid value must be a GUID.');return value.toLowerCase();}
function validDate(value:string):boolean {return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0,4)) >= 1 && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;}
function dateTime(value:string):boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  return !!match && validDate(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60
    && (!match[6] || Number(match[7]) <= 14 && Number(match[8]) < 60 && (Number(match[7]) !== 14 || Number(match[8]) === 0));
}
/** Validate only declared structural data; navigation/deep-insert annotations are outside this scope. */
export class OperationValues {
  private count = 0;
  constructor(private readonly metadata:OperationMetadata,private readonly isFunction:boolean) {}
  value(ref:TypeRef,value:unknown,depth = 0):any {
    if (++this.count > 10000 || depth > 20) fail('LIMIT','Operation values exceed their structural limits.');
    if (value === null) {if (!ref.nullable) fail('TYPE_INVALID','A non-nullable parameter/property cannot be null.');return null;}
    if (value === undefined) fail('TYPE_INVALID','An explicit JSON value is required.');
    if (ref.collection) {
      if (!Array.isArray(value) || value.length > 1000) fail('TYPE_INVALID','A collection parameter requires at most 1000 items.');
      return value.map(item => this.value({...ref,collection:false,nullable:false},item,depth+1));
    }
    const type = ref.type;
    if (type.startsWith('Edm.')) {
      const name = type.slice(4);
      if (name === 'String') {
        if (typeof value !== 'string' || ref.maxLength !== undefined && value.length > ref.maxLength) fail('TYPE_INVALID','A string parameter/property violates its declared type or length.');
        for (let index = 0;index < value.length;index++) {
          const code = value.charCodeAt(index);
          if (code >= 0xd800 && code <= 0xdbff) {
            const low = value.charCodeAt(++index);
            if (!(low >= 0xdc00 && low <= 0xdfff)) fail('TYPE_INVALID','String values must contain valid Unicode scalar sequences.');
          } else if (code >= 0xdc00 && code <= 0xdfff) fail('TYPE_INVALID','String values must contain valid Unicode scalar sequences.');
        }
        return value;
      }
      if (name === 'Boolean') {if (typeof value !== 'boolean') fail('TYPE_INVALID','A Boolean value is required.');return value;}
      const ranges:Record<string,[number,number]> = {Byte:[0,255],SByte:[-128,127],Int16:[-32768,32767],Int32:[-2147483648,2147483647]};
      if (Object.hasOwn(ranges,name)) {
        const [min,max] = ranges[name];
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail('TYPE_INVALID','An integer parameter/property is outside its native range.');
        return value;
      }
      if (name === 'Int64') {
        if (!(typeof value === 'number' && Number.isSafeInteger(value)) && !(typeof value === 'string' && /^-?\d{1,19}$/.test(value))) fail('TYPE_INVALID','Int64 requires a safe integer or an exact decimal integer string.');
        const number = BigInt(value as string|number);
        if (number < -9223372036854775808n || number > 9223372036854775807n) fail('TYPE_INVALID','Int64 is outside its native range.');
        return String(number);
      }
      if (name === 'Decimal') {
        const result = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
        if (typeof result !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(result)) fail('TYPE_INVALID','Decimal requires an exact non-exponent decimal string or finite decimal number.');
        const [whole,fraction = ''] = result.replace(/^-/,'').split('.'),digits = whole.replace(/^0+/,'').length + fraction.length;
        if (digits > (ref.precision ?? 38) || ref.scale !== undefined && fraction.length > ref.scale) fail('TYPE_INVALID','Decimal exceeds the supported/native precision or scale.');
        return result;
      }
      if (name === 'Double' || name === 'Single') {
        if (typeof value !== 'number' || !Number.isFinite(value) || name === 'Single' && Math.abs(value) > 3.4028234663852886e38) fail('TYPE_INVALID','A finite floating point value is required.');
        return value;
      }
      if (name === 'Guid') return guid(value);
      if (name === 'Binary') {
        if (typeof value !== 'string' || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]*={0,2})$/.test(value)
          || Buffer.from(value,'base64').toString('base64') !== value || ref.maxLength !== undefined && Buffer.from(value,'base64').length > ref.maxLength) fail('TYPE_INVALID','Binary values must use canonical base64 within the native length.');
        return value;
      }
      if (name === 'Date' && typeof value === 'string' && validDate(value)) return value;
      if (name === 'DateTimeOffset' && typeof value === 'string' && dateTime(value)) return value;
      if (name === 'TimeOfDay' && typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/.test(value)) return value;
      if (name === 'Duration' && typeof value === 'string' && /^-?P(?=\d|T)(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/.test(value)) return value;
      if (['Date','DateTimeOffset','TimeOfDay','Duration'].includes(name)) fail('TYPE_INVALID','A temporal parameter/property has an invalid native literal.');
      fail('TYPE_UNSUPPORTED','This EDM primitive is not supported by the bounded operation serializer.',{type});
    }
    const declared = this.metadata.types.get(type);
    if (!declared) fail('TYPE_UNSUPPORTED','The CSDL parameter type is unavailable.',{type});
    if (declared.kind === 'enum') {
      if (typeof value !== 'string') fail('TYPE_INVALID','Enum values require native member names.');
      const members = value.split(',').map(value => value.trim());
      if (!members.length || new Set(members).size !== members.length || !declared.flags && members.length !== 1 || members.some(name => !declared.members.includes(name))) fail('TYPE_INVALID','The enumeration member/flag list is invalid.');
      return members.join(',');
    }
    const input = object(value);
    let actualType = type;
    if (input['@odata.type'] !== undefined) {
      if (typeof input['@odata.type'] !== 'string') fail('TYPE_INVALID','@odata.type must identify a native declared type.');
      actualType = this.metadata.qualify(input['@odata.type'].replace(/^#/,''));
    }
    if (input['@odata.id'] !== undefined) {
      if (declared.kind !== 'entity' || Object.keys(input).some(key => !['@odata.type','@odata.id'].includes(key))) fail('TYPE_INVALID','Entity references cannot include inline properties.');
      if (typeof input['@odata.id'] !== 'string') fail('TYPE_INVALID','Entity references require a relative entity-set/GUID URI.');
      const match = /^\/?([A-Za-z_][A-Za-z0-9_]*)\(([a-f0-9-]{36})\)$/i.exec(input['@odata.id']);
      if (!match) fail('TYPE_INVALID','Only same-service relative entity-set/GUID references are supported.');
      const entityType = this.metadata.sets.get(match[1]);
      if (!entityType || !this.metadata.assignable(entityType,type) || input['@odata.type'] !== undefined && actualType !== entityType) fail('TYPE_INVALID','The referenced entity type is incompatible with the parameter.');
      const id = guid(match[2]);
      if (this.isFunction) return {'@odata.id':match[1] + '(' + id + ')'};
      const keys = this.metadata.structure(entityType).keys;
      if (keys.length !== 1 || this.metadata.structure(entityType).properties.get(keys[0])?.type !== 'Edm.Guid') fail('TYPE_UNSUPPORTED','The referenced table does not expose a single Guid key.');
      return {'@odata.type':entityType,[keys[0]]:id};
    }
    const actual = this.metadata.types.get(actualType);
    if (!actual || actual.kind !== declared.kind || actual.abstract || !this.metadata.assignable(actualType,type)) fail('TYPE_INVALID','An explicit concrete compatible @odata.type is required.');
    const properties = this.metadata.structure(actualType).properties,entries:[string,any][] = [['@odata.type',actualType]];
    for (const [name,value] of Object.entries(input)) {
      if (name === '@odata.type') continue;
      const property = properties.get(name);
      if (!property) fail('TYPE_INVALID','An undeclared property/navigation annotation was supplied.',{type:actualType});
      entries.push([name,this.value(property,value,depth+1)]);
    }
    // Entity parameters are partial records. Complex parameters preserve required structural fields.
    if (declared.kind === 'complex') for (const property of properties.values()) if (!property.nullable && !Object.hasOwn(input,property.name)) fail('TYPE_INVALID','A non-nullable complex property is missing.',{type:actualType,property:property.name});
    return Object.fromEntries(entries);
  }
  literal(ref:TypeRef,value:any):string {
    if (value === null) return 'null';
    if (ref.collection) return JSON.stringify(value);
    if (ref.type === 'Edm.String') return "'" + value.replace(/'/g,"''") + "'";
    if (ref.type === 'Edm.Binary') return "binary'" + Buffer.from(value,'base64').toString('base64url') + "'";
    if (ref.type === 'Edm.Duration') return "duration'" + value + "'";
    if (ref.type.startsWith('Edm.')) return String(value);
    if (this.metadata.types.get(ref.type)?.kind === 'enum') return ref.type + "'" + value + "'";
    return JSON.stringify(value);
  }
}
