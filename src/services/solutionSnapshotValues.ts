import {digest} from './apiOperationMetadata.js';
import {fail,integer,name,objectId,row,type Row} from './solutionSupport.js';

export const SNAPSHOT_FORMAT = 'd365.solution.snapshot.v1';
export const SNAPSHOT_LIMIT = 2 * 1024 * 1024;
export const SNAPSHOT_TYPES = [1,9,10,61,91];
const aliases:Record<string,string> = {solutionUniqueName:'solution_unique_name',maxPages:'max_pages',sourceSnapshot:'source_snapshot',targetSnapshot:'target_snapshot',
  expectedSnapshot:'expected_snapshot',expectedManaged:'expected_managed',asyncOperationId:'async_operation_id',importJobId:'import_job_id',includeText:'include_text',maxTextChars:'max_text_chars'};
/** Reject non-JSON/cyclic/oversized input before canonical hashing or validation. */
export function boundedJson(value:unknown,limit = SNAPSHOT_LIMIT):void {
  let nodes = 0;const active = new Set<object>();
  const visit = (item:unknown,depth:number) => {
    if (++nodes > 100000 || depth > 24) fail('SNAPSHOT_INVALID','JSON exceeds the supported structural bound.');
    if (item === null || ['string','boolean'].includes(typeof item) || typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || active.has(item) || !Array.isArray(item) && ![Object.prototype,null].includes(Object.getPrototypeOf(item))) fail('SNAPSHOT_INVALID','Finite acyclic JSON values are required.');
    active.add(item);for (const key of Object.keys(item)) {if (['__proto__','constructor','prototype'].includes(key)) fail('SNAPSHOT_INVALID','Unsafe JSON property.');visit((item as Row)[key],depth+1);}active.delete(item);
  };
  visit(value,0);if (Buffer.byteLength(JSON.stringify(value)) > limit) fail('SNAPSHOT_LIMIT','JSON exceeds the supported byte limit.');
}
export function snapshotArgs(raw:unknown,allowed:string[]):Row {
  boundedJson(raw,2 * SNAPSHOT_LIMIT+32768);const source = row(raw),result:Row = {};
  if (Object.keys(source).length > 15) fail('INVALID','Too many snapshot arguments.');
  for (const [key,value] of Object.entries(source)) {
    const field = Object.hasOwn(aliases,key) ? aliases[key] : key;
    if (!allowed.includes(field)) fail('INVALID','An unknown snapshot argument was supplied.');
    if (Object.hasOwn(result,field) && digest(result[field]) !== digest(value)) fail('INVALID','Conflicting snapshot aliases.');result[field] = value;
  }
  return result;
}
export function exact(value:unknown,fields:string[]):Row {
  const item = row(value);if (Object.keys(item).length !== fields.length || fields.some(key => !Object.hasOwn(item,key))) fail('SNAPSHOT_INVALID','Snapshot shape is incomplete or has unknown properties.');return item;
}
export function text(value:unknown,max = 4096,nullable = false):string|null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('SNAPSHOT_INVALID','A selected text property is invalid.');return value;
}
function boolean(value:unknown):boolean {if (typeof value !== 'boolean') fail('SNAPSHOT_INVALID','A selected Boolean property is missing.');return value;}
function labels(value:unknown):Row {
  if (value === null) return {LocalizedLabels:[]};
  const source = row(value);if (!Array.isArray(source.LocalizedLabels) || source.LocalizedLabels.length > 128) fail('SNAPSHOT_INVALID','Bounded localized labels are required.');
  const used = new Set<number>(),items = source.LocalizedLabels.map((item:unknown) => {
    const r = row(item),language = integer(r.LanguageCode,0,1,65535);if (!language || used.has(language)) fail('SNAPSHOT_INVALID','Duplicate or missing label language.');used.add(language);
    return {LanguageCode:language,Label:text(r.Label)};
  });
  return {LocalizedLabels:items.sort((a:Row,b:Row) => a.LanguageCode-b.LanguageCode)};
}
const tableFields = ['LogicalName','SchemaName','EntitySetName','PrimaryIdAttribute','PrimaryNameAttribute','OwnershipType','IsActivity','IsAuditEnabled','DisplayName','DisplayCollectionName','Description'];
const choiceFields = ['Name','IsGlobal','OptionSetType','DisplayName','Description','Options'];
const oneFields = ['SchemaName','RelationshipType','ReferencedEntity','ReferencedAttribute','ReferencingEntity','ReferencingAttribute','CascadeConfiguration'];
const manyFields = ['SchemaName','RelationshipType','Entity1LogicalName','Entity1IntersectAttribute','Entity2LogicalName','Entity2IntersectAttribute','IntersectEntityName'];
const webFields = ['name','displayname','webresourcetype','contentSha256','contentBytes'];
const assemblyFields = ['name','version','culture','publickeytoken','sourcetype','isolationmode','contentSha256','contentBytes'];
export function selectedFields(type:number,kind?:string):string[] {
  if (type === 1) return tableFields;
  if (type === 9) return choiceFields;
  if (type === 10) return kind === 'OneToManyRelationship' ? oneFields : manyFields;
  if (type === 61) return webFields;
  if (type === 91) return assemblyFields;
  return fail('SNAPSHOT_UNSUPPORTED','The snapshot component type is unsupported.');
}
/** Canonicalize only this version's selected properties. No recursive blanket GUID stripping. */
export function selectedDefinition(type:number,value:unknown):Row {
  const source = row(value),result:Row = {},fields = selectedFields(type,source.RelationshipType);
  for (const field of fields) {
    const v = source[field];
    if (['DisplayName','DisplayCollectionName','Description'].includes(field)) result[field] = labels(v);
    else if (field === 'Options') {
      if (!Array.isArray(v) || v.length > 1000) fail('SNAPSHOT_INVALID','A complete bounded option list is required.');
      const used = new Set<number>();result.Options = v.map((value:unknown) => {
        const option = row(value),number = integer(option.Value,-1,0);if (number < 0 || used.has(number)) fail('SNAPSHOT_INVALID','Option values are missing or duplicated.');used.add(number);
        return {Value:number,Label:labels(option.Label),Description:labels(option.Description),Color:text(option.Color,32,true)};
      }).sort((a:Row,b:Row) => a.Value-b.Value);
    } else if (field === 'CascadeConfiguration') {
      const cascade = row(v);result[field] = Object.fromEntries(['Assign','Delete','Merge','Reparent','Share','Unshare'].map(key => [key,text(cascade[key],64)]));
    } else if (['IsActivity','IsGlobal'].includes(field)) result[field] = boolean(v);
    else if (field === 'IsAuditEnabled') result[field] = boolean(typeof v === 'boolean' ? v : row(v).Value);
    else if (['webresourcetype','sourcetype','isolationmode','contentBytes'].includes(field)) {
      const number = integer(v,-1,0,field === 'contentBytes' ? 16*1024*1024 : 100);if (number < 0) fail('SNAPSHOT_INVALID','A numeric property is missing.');result[field] = number;
    } else if (field === 'contentSha256') {if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail('SNAPSHOT_INVALID','A byte hash is required.');result[field] = v;}
    else result[field] = text(v,256,['PrimaryNameAttribute','displayname','culture','publickeytoken'].includes(field));
  }
  if (type === 9 && (result.IsGlobal !== true || result.OptionSetType !== 'Picklist')) fail('SNAPSHOT_UNSUPPORTED','Only global Picklist options are supported.');
  if (type === 10 && !['OneToManyRelationship','ManyToManyRelationship'].includes(result.RelationshipType)) fail('SNAPSHOT_UNSUPPORTED','Unknown relationship type.');
  if (type === 91 && result.sourcetype !== 0) fail('SNAPSHOT_UNSUPPORTED','Only database assembly byte comparisons are supported.');
  if (Buffer.byteLength(JSON.stringify(result)) > 65536) fail('SNAPSHOT_LIMIT','A selected component definition exceeds 64 KiB.');
  return result;
}
export function portableKey(type:number,definition:Row):string {
  const value = type === 1 ? name(definition.LogicalName).toLowerCase() : type === 9 ? name(definition.Name).toLowerCase()
    : type === 10 ? name(definition.SchemaName).toLowerCase() : type === 61 ? text(definition.name,256)
    : JSON.stringify([definition.name,definition.culture,definition.publickeytoken]);
  if (!value) fail('SNAPSHOT_INVALID','A portable component key is missing.');return type + ':' + value;
}
export function snapshotDigest(value:Row):string {const {snapshotHash:_,...rest} = value;return digest(rest);}
export function validateSnapshot(value:unknown):Row {
  boundedJson(value);const s = exact(value,['format','capturedAt','environment','identity','solution','coverage','components','snapshotHash']);
  if (s.format !== SNAPSHOT_FORMAT || typeof s.capturedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s.capturedAt) || !Number.isFinite(Date.parse(s.capturedAt))) fail('SNAPSHOT_INVALID','Unknown snapshot format/date.');
  const environment = exact(s.environment,['orgUrl','apiVersion','authType']);
  try {const url = new URL(environment.orgUrl);if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();} catch {fail('SNAPSHOT_INVALID','Snapshot environment URL is invalid.');}
  if (!/^v[1-9]\d*\.\d+$/.test(environment.apiVersion) || !['online','op_ad','op_ifd','ad','ifd'].includes(environment.authType)) fail('SNAPSHOT_INVALID','Snapshot API/authentication kind is invalid.');
  const identity = exact(s.identity,['organizationId','userId','businessUnitId']);for (const key of Object.keys(identity)) objectId(identity[key]);
  const solution = exact(s.solution,['solutionid','uniquename','version','ismanaged']);objectId(solution.solutionid);name(solution.uniquename);text(solution.version,64);boolean(solution.ismanaged);
  const coverage = exact(s.coverage,['inventoryComplete','membershipStable','solutionStable','definitionReadsComplete','atomic','nestedComponentsExpanded','publication','limit','maxPages','observedCount']);
  for (const key of ['inventoryComplete','membershipStable','solutionStable','definitionReadsComplete']) boolean(coverage[key]);
  if (coverage.atomic !== false || coverage.nestedComponentsExpanded !== false || coverage.publication !== 'native_reads_publication_not_verified') fail('SNAPSHOT_INVALID','The snapshot overstates its verification scope.');
  integer(coverage.limit,0,1,200);integer(coverage.maxPages,0,1,20);integer(coverage.observedCount,-1,0,200);
  if (!Array.isArray(s.components) || s.components.length > 200 || s.components.length !== coverage.observedCount) fail('SNAPSHOT_INVALID','Snapshot components exceed the supported scope.');
  const membershipIds = new Set<string>();let complete = true;
  for (const entry of s.components) {
    const c = exact(entry,['membershipId','objectId','componentType','rootBehavior','rootMembershipId','status','key','definition','definitionHash','issue']);
    const id = objectId(c.membershipId);if (membershipIds.has(id)) fail('SNAPSHOT_INVALID','Duplicate membership identity.');membershipIds.add(id);
    if (c.objectId !== null) objectId(c.objectId);if (c.rootMembershipId !== null) objectId(c.rootMembershipId);
    if (!Number.isInteger(c.componentType) || c.componentType < 1 || ![null,0,1,2].includes(c.rootBehavior)) fail('SNAPSHOT_INVALID','Invalid native component scope.');
    if (c.status === 'available') {
      if (!c.objectId || c.issue !== null || !SNAPSHOT_TYPES.includes(c.componentType)) fail('SNAPSHOT_INVALID','Inconsistent available component.');
      const canonical = selectedDefinition(c.componentType,c.definition);
      if (digest(canonical) !== digest(c.definition) || c.key !== portableKey(c.componentType,canonical) || c.definitionHash !== digest(canonical)) fail('SNAPSHOT_INVALID','Component keys/definition hashes or canonical properties differ.');
    } else {
      complete = false;if (!['unsupported','forbidden','unavailable_or_hidden','failed'].includes(c.status) || c.key !== null || c.definition !== null || c.definitionHash !== null) fail('SNAPSHOT_INVALID','Invalid incomplete component.');
      if (!['unsupported_type','null_object_id','unsupported_profile','native_read_failed'].includes(c.issue)) fail('SNAPSHOT_INVALID','Invalid component evidence reason.');
    }
  }
  if (coverage.definitionReadsComplete !== complete || typeof s.snapshotHash !== 'string' || s.snapshotHash !== snapshotDigest(s)) fail('SNAPSHOT_INVALID','Snapshot coverage or integrity hash differs.');
  return s;
}
