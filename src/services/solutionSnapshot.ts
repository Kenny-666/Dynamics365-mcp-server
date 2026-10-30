import type {CrmRequestClient} from '../types/crmRequest.js';
import type {MutationEnvironment} from '../types/recordMutation.js';
import {CrmRequestError} from '../errors.js';
import {digest} from './apiOperationMetadata.js';
import {byteHash,cancelled} from './solutionPackage.js';
import {SolutionService} from './solution.js';
import {SolutionReader,fail,flag,integer,name,objectId,protect,row,type Row} from './solutionSupport.js';
import {resolveComponent} from './solutionComponent.js';
import {evidence} from './pluginStepValidation.js';
import {SNAPSHOT_FORMAT,SNAPSHOT_TYPES,SNAPSHOT_LIMIT,boundedJson,portableKey,selectedDefinition,selectedFields,snapshotArgs,snapshotDigest,validateSnapshot} from './solutionSnapshotValues.js';

function native(value:unknown,limit = SNAPSHOT_LIMIT):Row {
  boundedJson(value,limit);
  const visit = (item:unknown) => {if (item && typeof item === 'object') for (const [key,value] of Object.entries(item)) {
    if (/@odata.nextLink$/.test(key)) fail('SNAPSHOT_INCOMPLETE','A selected native definition is partial.');visit(value);
  }};visit(value);return row(value);
}
function bytes(value:unknown):Row {
  const limit = 16 * 1024 * 1024;
  if (typeof value !== 'string' || value.length > 4*Math.ceil(limit/3) || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('SNAPSHOT_UNSUPPORTED','A complete bounded binary content value is required.');
  const data = Buffer.from(value,'base64');if (data.length > limit || data.toString('base64') !== value) fail('SNAPSHOT_UNSUPPORTED','Binary content is malformed or exceeds 16 MiB.');
  return {contentSha256:byteHash(data),contentBytes:data.length};
}
function relationKind(value:unknown) {if ([0,'OneToManyRelationship'].includes(value as string)) return 'OneToManyRelationship';if ([1,'ManyToManyRelationship'].includes(value as string)) return 'ManyToManyRelationship';return fail('SNAPSHOT_UNSUPPORTED','Unknown native relationship type.');}
function solutionIdentity(source:Row) {return {solutionid:source.solutionid,uniquename:source.uniquename,version:source.version,ismanaged:source.ismanaged};}
export class SolutionSnapshotService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:MutationEnvironment) {}
  private async definition(reader:SolutionReader,component:Row):Promise<{key:string;definition:Row;definitionHash:string}> {
    const type = component.componenttype,id = component.objectid,base = await resolveComponent(reader,id,type),source = base.source;
    let endpoint:string,selected:string[],key:string,raw:Row;
    if (type === 1) {selected = selectedFields(type);key = 'MetadataId';endpoint = '/EntityDefinitions('+id+')?$select=MetadataId,'+selected.join(',');}
    else if (type === 9) {
      if (source.OptionSetType !== 'Picklist') fail('SNAPSHOT_UNSUPPORTED','Only global Picklist choices have a snapshot profile.');
      selected = selectedFields(type);key = 'MetadataId';endpoint = '/GlobalOptionSetDefinitions('+id+')/Microsoft.Dynamics.CRM.OptionSetMetadata?$select=MetadataId,'+selected.join(',');
    } else if (type === 10) {
      const kind = relationKind(source.RelationshipType);selected = selectedFields(type,kind);key = 'MetadataId';
      endpoint = '/RelationshipDefinitions('+id+')/Microsoft.Dynamics.CRM.'+(kind === 'OneToManyRelationship' ? 'OneToMany' : 'ManyToMany')+'RelationshipMetadata?$select=MetadataId,'+selected.join(',');
    } else {
      key = type === 61 ? 'webresourceid' : 'pluginassemblyid';
      selected = type === 61 ? ['name','displayname','webresourcetype','content'] : ['name','version','culture','publickeytoken','sourcetype','isolationmode','content','_packageid_value'];
      endpoint = '/'+(type === 61 ? 'webresourceset' : 'pluginassemblies')+'('+id+')?$select='+key+','+selected.join(',');
    }
    raw = native((await reader.request(endpoint,'GET',undefined,type < 60 ? {Consistency:'Strong'} : {})).data,type >= 60 ? 24*1024*1024 : SNAPSHOT_LIMIT);
    if (objectId(raw[key]) !== id) fail('SNAPSHOT_INVALID','Component native identity changed during the read.');
    if (type === 1 && raw.LogicalName !== source.LogicalName || type === 9 && raw.Name !== source.Name || type === 10 && raw.SchemaName !== source.SchemaName
      || type >= 60 && raw.name !== source.name) fail('SNAPSHOT_INVALID','The component portable identity changed during the read.');
    if (type === 10) raw = {...raw,RelationshipType:relationKind(raw.RelationshipType)};
    if (type === 91 && (raw.sourcetype !== 0 || !Object.hasOwn(raw,'_packageid_value') || raw._packageid_value !== null)) fail('SNAPSHOT_UNSUPPORTED','Only non-package database assembly bytes are compared.');
    if (type >= 60) raw = {...raw,...bytes(raw.content)};
    const definition = selectedDefinition(type,raw);return {key:portableKey(type,definition),definition,definitionHash:digest(definition)};
  }
  capture(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = snapshotArgs(raw,['solution_unique_name','top','max_pages']),uniqueName = name(a.solution_unique_name),limit = integer(a.top,100,1,200),maxPages = integer(a.max_pages,5,1,20);
      const reader = new SolutionReader(this.client,this.environment,signal),service = new SolutionService(this.client,this.environment),who = row((await reader.request('/WhoAmI')).data);
      const identity = {organizationId:objectId(who.OrganizationId),userId:objectId(who.UserId),businessUnitId:objectId(who.BusinessUnitId)};
      const before = await service.listComponents({solution_unique_name:uniqueName,top:limit,max_pages:maxPages},signal),components:Row[] = [];
      for (const member of before.items) {
        cancelled(signal);const item:Row = {membershipId:member.solutioncomponentid,objectId:member.objectid,componentType:member.componenttype,rootBehavior:member.rootcomponentbehavior ?? null,
          rootMembershipId:member.rootsolutioncomponentid,status:'unsupported',key:null,definition:null,definitionHash:null,issue:!member.objectid ? 'null_object_id' : 'unsupported_type'};
        if (member.objectid && SNAPSHOT_TYPES.includes(member.componenttype)) {
          try {Object.assign(item,await this.definition(reader,member),{status:'available',issue:null});}
          catch (error) {
            if (signal?.aborted || error instanceof CrmRequestError && error.code === 'D365_REQUEST_ABORTED') throw error;const details = evidence(error),code = error && typeof error === 'object' && 'code' in error ? error.code : '';
            item.status = details.status === 403 ? 'forbidden' : details.status === 404 ? 'unavailable_or_hidden' : code === 'D365_SOLUTION_SNAPSHOT_UNSUPPORTED' ? 'unsupported' : 'failed';
            item.issue = item.status === 'unsupported' ? 'unsupported_profile' : 'native_read_failed';
          }
        }
        components.push(item);
        if (Buffer.byteLength(JSON.stringify(components)) > SNAPSHOT_LIMIT-16384) fail('SNAPSHOT_LIMIT','The selected snapshot exceeds 2 MiB; use a smaller supported solution.');
      }
      const after = await service.listComponents({solution_unique_name:uniqueName,top:limit,max_pages:maxPages},signal);
      const ordered = (items:Row[]) => [...items].sort((a,b) => a.solutioncomponentid.localeCompare(b.solutioncomponentid));
      const snapshot:Row = {format:SNAPSHOT_FORMAT,capturedAt:new Date().toISOString(),environment:this.environment,identity,solution:solutionIdentity(before.solution),
        coverage:{inventoryComplete:before.paging.complete && after.paging.complete,membershipStable:digest(ordered(before.items)) === digest(ordered(after.items)),
          solutionStable:digest(before.solution) === digest(after.solution),definitionReadsComplete:components.every(c => c.status === 'available'),atomic:false,nestedComponentsExpanded:false,
          publication:'native_reads_publication_not_verified',limit,maxPages,observedCount:components.length},components:components.sort((a,b) => a.membershipId.localeCompare(b.membershipId))};
      snapshot.snapshotHash = snapshotDigest(snapshot);validateSnapshot(snapshot);
      return {success:true,snapshot,scope:'explicit_visible_membership_and_selected_properties',deploymentVerified:false,
        note:'Selected profile only; nested components, full schemas, managed layers, dependencies and runtime/publication are not verified. Snapshots are not atomic or authenticated and must be saved/passed as JSON to compare across separately configured environments.'};
    });
  }
}
function keyMap(snapshot:Row) {
  const groups = new Map<string,Row[]>(),ids = new Map<string,Row>();
  for (const item of snapshot.components) {ids.set(item.membershipId,item);if (item.key) groups.set(item.key,[...(groups.get(item.key) ?? []),item]);}
  const unique = new Map<string,Row>(),ambiguous:string[] = [];
  for (const [key,items] of groups) if (items.length === 1) unique.set(key,items[0]);else ambiguous.push(key);
  const root = (item:Row) => {
    if (item.rootBehavior === null) return {key:null,resolved:false};
    if (item.rootMembershipId === null) return {key:null,resolved:true};
    const parent = ids.get(item.rootMembershipId);return parent?.key && parent.rootBehavior !== null && groups.get(parent.key)?.length === 1
      && (parent.rootMembershipId === null || parent.rootMembershipId === parent.membershipId) ? {key:parent.key,resolved:true} : {key:null,resolved:false};
  };
  return {unique,ambiguous:ambiguous.sort(),root};
}
function differencePaths(left:any,right:any,path = '',result:string[] = []):string[] {
  if (digest(left) === digest(right)) return result;
  if (result.length >= 100) return result;
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    for (const key of new Set([...Object.keys(left),...Object.keys(right)])) {
      if (!Object.hasOwn(left,key) || !Object.hasOwn(right,key)) result.push(path+'/'+key);else differencePaths(left[key],right[key],path+'/'+key,result);
      if (result.length >= 100) break;
    }
  } else result.push(path || '/');return result;
}
export function compareSnapshots(source:Row,target:Row,expectedManaged?:boolean):Row {
  const a = keyMap(source),b = keyMap(target),all = [...new Set([...a.unique.keys(),...b.unique.keys()])].sort(),ambiguous = new Set([...a.ambiguous,...b.ambiguous]);
  const added:Row[] = [],missing:Row[] = [],changed:Row[] = [],matched:Row[] = [],unresolvedRoots:Row[] = [],unmatchedSource:Row[] = [],unmatchedTarget:Row[] = [];
  const identityInventoryComplete = (snapshot:Row) => snapshot.coverage.inventoryComplete && snapshot.coverage.membershipStable && snapshot.components.every((item:Row) => item.status === 'available');
  const ref = (entry:Row) => ({key:entry.key,componentType:entry.componentType,objectId:entry.objectId,membershipId:entry.membershipId});
  for (const key of all) {
    if (ambiguous.has(key)) continue;
    const left = a.unique.get(key),right = b.unique.get(key);
    if (!left) {(identityInventoryComplete(source) ? added : unmatchedSource).push(ref(right!));continue;}
    if (!right) {(identityInventoryComplete(target) ? missing : unmatchedTarget).push(ref(left));continue;}
    const rootA = a.root(left),rootB = b.root(right),paths = differencePaths(left.definition,right.definition);
    if (left.rootBehavior !== right.rootBehavior) paths.push('/membership/rootBehavior');
    if (!rootA.resolved || !rootB.resolved) unresolvedRoots.push({key,source:rootA.resolved,target:rootB.resolved});
    else if (rootA.key !== rootB.key) paths.push('/membership/rootKey');
    if (paths.length) changed.push({key,componentType:left.componentType,source:ref(left),target:ref(right),paths:paths.slice(0,100),pathsMayBeTruncated:paths.length >= 100});
    else matched.push({key,componentType:left.componentType,sourceObjectId:left.objectId,targetObjectId:right.objectId});
  }
  const solutionDifferences:Row[] = [];
  for (const key of ['uniquename','version','ismanaged']) {const expected = key === 'ismanaged' && expectedManaged !== undefined ? expectedManaged : source.solution[key];
    if (expected !== target.solution[key]) solutionDifferences.push({property:key,expected,actual:target.solution[key]});}
  const gaps = (s:Row) => s.components.filter((item:Row) => item.status !== 'available').map((c:Row) => ({membershipId:c.membershipId,objectId:c.objectId,componentType:c.componentType,status:c.status,issue:c.issue}));
  const sourceGaps = gaps(source),targetGaps = gaps(target),stable = (s:Row) => ['inventoryComplete','membershipStable','solutionStable','definitionReadsComplete'].every(key => s.coverage[key] === true);
  const scopeKnown = (snapshot:Row,map:ReturnType<typeof keyMap>) => snapshot.components.every((item:Row) => map.root(item).resolved);
  const comparable = stable(source) && stable(target) && !ambiguous.size && !unresolvedRoots.length && scopeKnown(source,a) && scopeKnown(target,b);
  const differences = added.length+missing.length+changed.length+solutionDifferences.length;
  return {scope:'explicit_visible_membership_and_selected_properties',sourceHash:source.snapshotHash,targetHash:target.snapshotHash,
    sourceEnvironment:source.environment,targetEnvironment:target.environment,sourceSolution:source.solution,targetSolution:target.solution,
    sourceCoverage:source.coverage,targetCoverage:target.coverage,
    selectedScopeCheck:!comparable ? 'inconclusive' : differences ? 'different' : 'matched',knownDifferences:differences,comparable,
    solutionDifferences,missingInTarget:missing,extraInTarget:added,changed,matched,ambiguousKeys:[...ambiguous].sort(),unresolvedRoots,sourceGaps,targetGaps,
    unmatchedInSource:unmatchedSource,unmatchedInTarget:unmatchedTarget,unmatchedInterpretation:'not_resolved_among_visible_rows_not_proven_absent',
    unknownMembershipScopes:{source:source.components.filter((item:Row) => !a.root(item).resolved).map((item:Row) => item.membershipId),
      target:target.components.filter((item:Row) => !b.root(item).resolved).map((item:Row) => item.membershipId)},
    snapshotIntegrity:'hash_checked_not_authenticity',deploymentVerified:false,publicationVerified:false,nestedComponentsVerified:false,
    note:'GUIDs are retained as evidence but excluded from portable matching. Label languages/option values are sorted; per-user labels and metadata GUIDs are ignored. Option display order, unselected settings, schemas, managed layers, dependencies, runtime/UI and publication are outside this profile. Known differences remain visible even when other evidence is incomplete.'};
}
export function compareSolutionSnapshots(raw:unknown,signal?:AbortSignal) {
  return protect(async () => {cancelled(signal);const a = snapshotArgs(raw,['source_snapshot','target_snapshot','expected_managed']);
    const expected = a.expected_managed === undefined ? undefined : flag(a.expected_managed);
    return {success:true,...compareSnapshots(validateSnapshot(a.source_snapshot),validateSnapshot(a.target_snapshot),expected)};
  });
}
