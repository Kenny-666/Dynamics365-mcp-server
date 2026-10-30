import {open,lstat} from 'node:fs/promises';
import type {CrmRequestClient} from '../types/crmRequest.js';
import type {MutationEnvironment} from '../types/recordMutation.js';
import {OperationMetadata,digest,type Operation} from './apiOperationMetadata.js';
import {OperationValues} from './apiOperationValues.js';
import {SolutionReader,SolutionError,fail,flag,integer,name,objectId,protect,row,type Row} from './solutionSupport.js';
import {binary,byteHash,cancelled,inspectArchive,inspectPackageArchive,packageBytes,replaceArchiveEntry,type InspectedArchive} from './solutionPackage.js';
import {boundedJson} from './solutionSnapshotValues.js';
import {outputPath} from './solutionTransfer.js';
import {CUSTOMIZATIONS_LIMIT,decodeRibbonXml,editRibbon,outsideRibbonHash,ribbonDocument,ribbonSummary,selectRibbon,serializeRibbon} from './ribbonXml.js';

function args(raw:unknown,allowed:string[]):Row {
  boundedJson(raw,48*1024*1024);const input = row(raw),result:Row = {},aliases:Row = {filePath:'file_path',contentBase64:'content_base64',logicalName:'logical_name',
    outputPath:'output_path',dryRun:'dry_run',expectedHash:'expected_hash',includeXml:'include_xml',locationFilter:'location_filter'};
  if (Object.keys(input).length > 15) fail('RIBBON_INVALID','Too many Ribbon arguments.');
  for (const [key,value] of Object.entries(input)) {const field = Object.hasOwn(aliases,key) ? aliases[key] : key;
    if (!allowed.includes(field)) fail('RIBBON_INVALID','Unknown Ribbon argument.');if (Object.hasOwn(result,field) && digest(result[field]) !== digest(value)) fail('RIBBON_INVALID','Conflicting Ribbon aliases.');result[field] = value;}
  return result;
}
export function packageRibbon(bytes:Buffer,logical:string,signal?:AbortSignal) {
  const selected = inspectPackageArchive(bytes,{'customizations.xml':CUSTOMIZATIONS_LIMIT},signal),source = decodeRibbonXml(selected.archive.payloads.get('customizations.xml')!);
  const document = ribbonDocument(source,['ImportExportXml']),ribbon = selectRibbon(document,logical);
  return {...selected,document,ribbon};
}
export function inspectRibbonSolution(raw:unknown,signal?:AbortSignal) {
  return protect(async () => {const a = args(raw,['file_path','content_base64','logical_name','top','include_xml']),logical = name(a.logical_name).toLowerCase(),top = integer(a.top,100,1,500),includeXml = flag(a.include_xml);
    const selected = packageRibbon(await packageBytes(a,signal),logical,signal);
    return {success:true,logicalName:logical,package:selected.summary,ribbon:ribbonSummary(selected.ribbon,top),
      ...(includeXml ? {ribbonDiffXml:serializeRibbon(selected.ribbon)} : {}),
      scope:'entity_classic_RibbonDiffXml_from_package_not_effective_live_ribbon',crmChanged:false,published:false};
  });
}
async function writeDraft(path:string,bytes:Buffer,signal?:AbortSignal) {
  cancelled(signal);let file;
  try {file = await open(path,'wx+');} catch {return fail('RIBBON_OUTPUT','The output file could not be reserved; no existing file was overwritten.');}
  let written = false;
  try {
    await file.writeFile(bytes);written = true;await file.sync();const stat = await file.stat(),readback = Buffer.alloc(bytes.length+1);let count = 0;
    while (count < readback.length) {cancelled(signal);const read = await file.read(readback,count,readback.length-count,count);if (!read.bytesRead) break;count += read.bytesRead;}
    const named = await lstat(path);if (count !== bytes.length || byteHash(readback.subarray(0,count)) !== byteHash(bytes) || !named.isFile() || named.isSymbolicLink()
      || named.ino !== stat.ino || named.dev !== stat.dev || named.size !== stat.size) fail('RIBBON_OUTPUT','The candidate file identity/hash readback failed.');
    await file.close();return {localSaved:true,localReadback:'matched'};
  } catch {await file.close().catch(() => {});throw new SolutionError('RIBBON_OUTPUT','The local candidate could not be verified. The reserved file may be empty or partial.',
    {outputPath:path,localSaved:written ? null : false,reservedFile:true,crmChanged:false,published:false},{});}
}
function sameUnchangedEntries(before:InspectedArchive,after:InspectedArchive):boolean {
  const entries = new Map(after.entries.map(entry => [entry.name,entry]));
  return before.entries.length === after.entries.length && before.entries.every(entry => {const current = entries.get(entry.name);return !!current
    && (entry.name === 'customizations.xml' || entry.payloadSha256 === current.payloadSha256 && entry.localBlock.equals(current.localBlock));});
}
export function buildRibbonCandidate(bytes:Buffer,logical:string,rawChanges:unknown,signal?:AbortSignal) {
  const before = packageRibbon(bytes,logical,signal),manifest = before.summary.manifest;
  if (manifest.managed || manifest.parentSolutionUniqueName || ['default','active','system'].includes(manifest.uniqueName.toLowerCase())) fail('RIBBON_SCOPE','Only an ordinary unmanaged solution package is editable.');
  const outside = outsideRibbonHash(before.document,logical),originalRibbon = ribbonSummary(before.ribbon,500),changes = editRibbon(before.document,before.ribbon,before.archive,logical,manifest.publisher.customizationPrefix,rawChanges),
    modified = Buffer.from(serializeRibbon(before.document),'utf8'),candidate = replaceArchiveEntry(before.archive,'customizations.xml',modified,signal),
    after = packageRibbon(candidate,logical,signal),planned = ribbonSummary(before.ribbon,500),actual = ribbonSummary(after.ribbon,500);
  if (!sameUnchangedEntries(before.archive,after.archive) || digest(before.summary.manifest) !== digest(after.summary.manifest)
    || outside !== outsideRibbonHash(after.document,logical) || planned.definitionHash !== actual.definitionHash) fail('RIBBON_READBACK','Candidate preservation or Ribbon readback did not match. No output was saved.');
  return {before,after,candidate,changes,originalRibbon,actual};
}
export function editRibbonSolution(raw:unknown,signal?:AbortSignal) {
  return protect(async () => {
    const a = args(raw,['file_path','content_base64','logical_name','changes','output_path','dry_run','expected_hash']),logical = name(a.logical_name).toLowerCase(),dry = flag(a.dry_run,true),path = await outputPath(a.output_path),
      bytes = await packageBytes(a,signal),{before,after,candidate,changes,originalRibbon,actual} = buildRibbonCandidate(bytes,logical,a.changes,signal);
    const planHash = digest({sourceSha256:before.summary.sha256,logicalName:logical,changes:a.changes,outputPath:path,candidateSha256:after.summary.sha256});
    if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('RIBBON_INVALID','expected_hash must be the preview planHash.');
    if (a.expected_hash !== undefined && a.expected_hash !== planHash) fail('RIBBON_CONFLICT','The source package, changes or output destination differs from the preview.',{planHash});
    const state = {success:true,operation:'edit_ribbon_solution',dryRun:dry,logicalName:logical,planHash,sourcePackage:before.summary,candidatePackage:after.summary,outputPath:path,
      localSaved:false,crmChanged:false,imported:false,published:false,changes,beforeRibbon:originalRibbon,afterRibbon:actual,
      preservation:{unchangedEntriesVerified:true,outsideSelectedRibbonSemanticallyMatched:true,manifestBytesUnchanged:true},
      note:'Local candidate only. The source ZIP is never overwritten. Importing a solution applies the whole package, including other unchanged components; no Ribbon-only deployment, target concurrency, live handler/location/schema/runtime or modern command verification is claimed. Existing-solution import is not supported by import_solution_async; use a separately reviewed native workflow and explicit publication.'};
    if (dry) return state;if (!a.expected_hash) fail('RIBBON_REVIEW','Execution requires the current preview planHash as expected_hash.');
    return {...state,...await writeDraft(path,candidate,signal)};
  });
}
export class RibbonService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:MutationEnvironment) {}
  read(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = args(raw,['logical_name','location_filter','include_xml','top']),logical = name(a.logical_name).toLowerCase(),filter = a.location_filter ?? 'All',includeXml = flag(a.include_xml),top = integer(a.top,100,1,500);
      if (!['All','Form','HomepageGrid','SubGrid'].includes(filter)) fail('RIBBON_INVALID','Unknown RibbonLocationFilter member.');
      const reader = new SolutionReader(this.client,this.environment,signal),table = row((await reader.request("/EntityDefinitions(LogicalName='"+logical+"')?$select=MetadataId,LogicalName")).data);
      if (table.LogicalName !== logical) fail('RIBBON_TARGET','The requested table identity did not match.');const metadataId = objectId(table.MetadataId),model = new OperationMetadata((await reader.request('/$metadata','GET',undefined,{Accept:'application/xml'})).data);
      let operation:Operation;
      try {
        const matches = model.lookup('RetrieveEntityRibbon',true).filter(op => op.qualifiedName === 'Microsoft.Dynamics.CRM.RetrieveEntityRibbon' && !op.bound && op.imports.includes('RetrieveEntityRibbon') && op.parameters.length === 2
          && op.parameters.some(p => p.name === 'EntityName' && p.type === 'Edm.String' && !p.collection)
          && op.parameters.some(p => p.name === 'RibbonLocationFilter' && p.type === 'Microsoft.Dynamics.CRM.RibbonLocationFilters' && !p.collection)
          && op.returnType?.type === 'Microsoft.Dynamics.CRM.RetrieveEntityRibbonResponse' && !op.returnType.collection);
        const property = model.structure('Microsoft.Dynamics.CRM.RetrieveEntityRibbonResponse').properties.get('CompressedEntityXml');
        if (matches.length !== 1 || property?.type !== 'Edm.Binary' || property.collection) throw new Error();operation = matches[0];
      } catch {return fail('RIBBON_UNSUPPORTED','The current CSDL does not expose the supported native Ribbon read contract.');}
      const values = new OperationValues(model,true),parameters = new URLSearchParams(),names:string[] = [];
      for (const parameter of operation.parameters) {const value = values.value(parameter,parameter.name === 'EntityName' ? logical : filter),alias = '@p'+(names.length+1);names.push(parameter.name+'='+alias);parameters.set(alias,values.literal(parameter,value));}
      const response = row((await reader.request('/RetrieveEntityRibbon('+names.join(',')+')?'+parameters)).data),archive = inspectArchive(binary(response.CompressedEntityXml),{'RibbonXml.xml':2*1024*1024},signal),payload = archive.payloads.get('RibbonXml.xml');
      if (!payload) fail('RIBBON_RESPONSE','The native compressed response has no RibbonXml.xml part.');
      const xml = decodeRibbonXml(payload),document = ribbonDocument(xml,['RibbonDefinitions','RibbonDefinition','Ribbon'],2*1024*1024);
      return {success:true,environment:this.environment,logicalName:logical,metadataId,locationFilter:filter,metadataHash:model.metadataHash,signatureId:operation.signatureId,
        ribbon:ribbonSummary(document.documentElement!,top),...(includeXml ? {effectiveRibbonXml:xml} : {}),compressedSha256:archive.sha256,
        scope:'native_effective_classic_definition_not_editable_RibbonDiffXml',crmChanged:false,publicationVerified:false,
        note:'Native definitions are evidence for IDs/locations and references, not per-user visibility/security evaluation, JavaScript execution or an editable solution diff. Modern commands are outside this tool.'};
    });
  }
}
