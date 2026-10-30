import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Element} from '@xmldom/xmldom';
import type {CrmRequestClient} from '../types/crmRequest.js';
import type {MutationEnvironment} from '../types/recordMutation.js';
import {CrmRequestError} from '../errors.js';
import {OperationMetadata,digest} from './apiOperationMetadata.js';
import {SolutionReader,SolutionError,fail,flag,name,objectId,protect,row,type Row} from './solutionSupport.js';
import {SolutionService} from './solution.js';
import {bodyFor,contract,exportFlags,submitSolutionImport,SolutionTransferService} from './solutionTransfer.js';
import {SolutionImportLogService} from './solutionImportLog.js';
import {RibbonService,buildRibbonCandidate,packageRibbon} from './ribbon.js';
import {binary,cancelled,packageBytes} from './solutionPackage.js';
import {decodeRibbonXml,ribbonDocument,signature,outsideRibbonHash} from './ribbonXml.js';
import {boundedJson} from './solutionSnapshotValues.js';
import {evidence} from './pluginStepValidation.js';
import {CacheService} from './cache.js';

// Provenance within this server process only. Never persisted, emitted, or used as authentication to CRM.
const receiptKey = randomBytes(32);
const mac = (payload:Row) => createHmac('sha256',receiptKey).update(digest(payload)).digest('hex');
const files = ['source_file_path','candidate_file_path','logical_name','changes'];
function args(raw:unknown,allowed:string[]):Row {
  boundedJson(raw,1024*1024);const source = row(raw),result:Row = {},aliases:Row = {sourceFilePath:'source_file_path',candidateFilePath:'candidate_file_path',logicalName:'logical_name',
    dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write',allowFullSolutionImport:'allow_full_solution_import',allowFullTablePublish:'allow_full_table_publish',importReceipt:'import_receipt'};
  if (Object.keys(source).length > 15) fail('RIBBON_DEPLOY_INVALID','Too many deployment arguments.');
  for (const [key,value] of Object.entries(source)) {const selected = Object.hasOwn(aliases,key) ? aliases[key] : key;
    if (!allowed.includes(selected)) fail('RIBBON_DEPLOY_INVALID','Unknown deployment argument.');if (Object.hasOwn(result,selected) && digest(result[selected]) !== digest(value)) fail('RIBBON_DEPLOY_INVALID','Conflicting deployment aliases.');result[selected] = value;}
  return result;
}
async function local(a:Row,signal?:AbortSignal) {
  const logical = name(a.logical_name).toLowerCase(),source = await packageBytes({file_path:a.source_file_path},signal),candidate = await packageBytes({file_path:a.candidate_file_path},signal),
    built = buildRibbonCandidate(source,logical,a.changes,signal),actual = packageRibbon(candidate,logical,signal);
  if (actual.summary.sha256 !== built.after.summary.sha256) fail('RIBBON_CANDIDATE_MISMATCH','The candidate bytes do not match replaying the structured edits against this source. Rebuild/review the local candidate on this server version.');
  return {logical,source,candidate,built,actual,changesHash:digest(a.changes),manifest:actual.summary.manifest};
}
type Local = Awaited<ReturnType<typeof local>>;
function payloadFingerprint(view:ReturnType<typeof packageRibbon>,logical:string,excludeRibbon = false):string {
  return digest(view.archive.entries.map(entry => {
    let hash = entry.payloadSha256;
    if (entry.name === 'solution.xml' || entry.name === 'customizations.xml') {
      const document = ribbonDocument(decodeRibbonXml(view.archive.payloads.get(entry.name)!),['ImportExportXml']);
      hash = entry.name === 'customizations.xml' && excludeRibbon ? outsideRibbonHash(document,logical) : digest(signature(document));
    }
    return [entry.name,hash];
  }).sort(([a],[b]) => a.localeCompare(b)));
}
function review(a:Row,planHash:string,dry:boolean,scopeFlag:string) {
  if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('RIBBON_DEPLOY_INVALID','expected_hash must be the current preview planHash.');
  if (a.expected_hash !== undefined && a.expected_hash !== planHash) fail('RIBBON_DEPLOY_CONFLICT','The reviewed package, caller, target or native plan changed. Preview again.',{planHash});
  if (!dry && (!a.expected_hash || !flag(a.allow_unprotected_write) || !flag(a[scopeFlag]))) fail('RIBBON_DEPLOY_REVIEW','Execution requires the current planHash, allow_unprotected_write=true and the explicit whole-solution import or whole-table publish scope flag. No atomic platform lock is available.');
}
function clean(error:unknown) {const details = evidence(error);delete details.outcome;return details;}
function receiptPayload(receipt:unknown):Row {
  const value = row(receipt);if (Object.keys(value).length !== 2 || !Object.hasOwn(value,'payload') || typeof value.mac !== 'string' || !/^[a-f0-9]{64}$/.test(value.mac)) fail('RIBBON_RECEIPT','A valid same-process Ribbon import receipt is required.');
  const payload = row(value.payload);
  if (payload.format !== 'd365.ribbon.import.v1' || !timingSafeEqual(Buffer.from(value.mac,'hex'),Buffer.from(mac(payload),'hex'))) fail('RIBBON_RECEIPT','The receipt changed or belongs to another server process. Do not reimport to regenerate it; use read-only status/log/Ribbon checks and an independently reviewed recovery workflow.');
  return payload;
}
function all(root:Element,tag:string) {return Array.from(root.getElementsByTagName(tag));}
function node(root:Element,tag:string,id:string) {const found = all(root,tag).filter(e => e.getAttribute('Id') === id);return found.length === 1 ? found[0] : undefined;}
function labelHash(label:Element):string|null {
  const languages = new Set<number>(),values:Row[] = [];
  for (const title of all(label,'Title')) {
    const language = Number(title.getAttribute('languagecode'));if (!Number.isInteger(language) || language < 1 || language > 65535 || languages.has(language)) return null;
    languages.add(language);values.push({language,description:title.getAttribute('description')});
  }
  return values.length ? digest(values.sort((a,b) => a.language-b.language)) : null;
}
/** Compare configured definitions only. No execution, effective privilege or UI claim. */
function compareEffective(expected:Element,actual:Element,changes:Row[]) {
  const items:Row[] = [];
  for (const id of new Set(changes.map(change => change.button_id))) {
    const before = node(expected,'Button',id),after = node(actual,'Button',id),checks:Row[] = [];
    if (!before || !after) {items.push({buttonId:id,status:'inconclusive',reason:'button_missing_or_ambiguous'});continue;}
    for (const attribute of Array.from(before.attributes)) if (attribute.name !== 'Id') {
      const observed = after.getAttribute(attribute.name),equal = attribute.name === 'Sequence' && observed !== null ? Number(observed) === Number(attribute.value) : observed === attribute.value;
      checks.push({property:attribute.name,status:equal ? 'matched' : observed === null ? 'inconclusive' : 'different'});
    }
    const commandId = before.getAttribute('Command')!,command = node(expected,'CommandDefinition',commandId),observedCommand = node(actual,'CommandDefinition',commandId);
    checks.push({property:'command_definition',status:command && observedCommand ? digest(signature(command)) === digest(signature(observedCommand)) ? 'matched' : 'different' : 'inconclusive'});
    const refs = command ? all(command,'DisplayRule').map(e => e.getAttribute('Id')!) : [];
    for (const ruleId of refs) {
      const definitions = all(expected,'RuleDefinitions').flatMap(root => all(root,'DisplayRule')).filter(e => e.getAttribute('Id') === ruleId),observed = all(actual,'RuleDefinitions').flatMap(root => all(root,'DisplayRule')).filter(e => e.getAttribute('Id') === ruleId);
      if (definitions.length === 1) checks.push({property:'display_rule:'+ruleId,status:observed.length === 1 ? digest(signature(definitions[0])) === digest(signature(observed[0])) ? 'matched' : 'different' : 'inconclusive'});
    }
    const reference = before.getAttribute('LabelText');if (reference?.startsWith('$LocLabels:')) {
      const label = node(expected,'LocLabel',reference.slice(11)),observed = node(actual,'LocLabel',reference.slice(11));
      const wantedHash = label ? labelHash(label) : null,observedHash = observed ? labelHash(observed) : null;
      checks.push({property:'localized_label',status:wantedHash && observedHash ? wantedHash === observedHash ? 'matched' : 'different' : 'inconclusive'});
    }
    items.push({buttonId:id,status:checks.some(c => c.status === 'different') ? 'different' : checks.some(c => c.status !== 'matched') ? 'inconclusive' : 'matched',checks});
  }
  return {status:items.some(i => i.status === 'different') ? 'different' : items.some(i => i.status !== 'matched') ? 'inconclusive' : 'matched',items,
    scope:'changed_button_attributes_commands_labels_and_local_display_rules',uiVerified:false,javaScriptExecuted:false,resourceContentVerified:false,deploymentVerified:false};
}
export class RibbonDeploymentService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:MutationEnvironment) {}
  private async context(selected:Local,signal?:AbortSignal) {
    const reader = new SolutionReader(this.client,this.environment,signal),who = row((await reader.request('/WhoAmI')).data),identity = {organizationId:objectId(who.OrganizationId),userId:objectId(who.UserId),businessUnitId:objectId(who.BusinessUnitId)},
      service = new SolutionService(this.client,this.environment),catalog = await service.list({solution_unique_name:selected.manifest.uniqueName,top:2,max_pages:1},signal);
    if (!catalog.paging.complete || catalog.items.length !== 1) fail('RIBBON_DEPLOY_TARGET','An exact existing ordinary unmanaged solution is required.');
    const target = catalog.items[0];if (target.uniquename !== selected.manifest.uniqueName || target.version !== selected.manifest.version || target.ismanaged !== false || target.isvisible !== true || target._parentsolutionid_value) fail('RIBBON_DEPLOY_TARGET','The existing solution name/version/unmanaged/parent state differs from the source.');
    const solution = row((await reader.request('/solutions('+target.solutionid+')?$select=solutionid,_publisherid_value')).data);
    if (objectId(solution.solutionid) !== target.solutionid) fail('RIBBON_DEPLOY_TARGET','The selected solution ID did not match.');const publisherId = objectId(solution._publisherid_value),publisher = row((await reader.request('/publishers('+publisherId+')?$select=publisherid,uniquename,customizationprefix')).data);
    if (objectId(publisher.publisherid) !== publisherId || publisher.uniquename !== selected.manifest.publisher.uniqueName || publisher.customizationprefix !== selected.manifest.publisher.customizationPrefix) fail('RIBBON_DEPLOY_TARGET','The package publisher differs from the native target publisher.');
    const table = row((await reader.request("/EntityDefinitions(LogicalName='"+selected.logical+"')?$select=MetadataId,LogicalName,IsCustomizable")).data);
    if (table.LogicalName !== selected.logical || table.IsCustomizable?.Value !== true) fail('RIBBON_DEPLOY_TARGET','The target table is missing or not customizable.');const tableId = objectId(table.MetadataId);
    const members = await service.listComponents({solution_unique_name:selected.manifest.uniqueName,top:5000,max_pages:20},signal);
    if (!members.paging.complete || !members.items.some(item => item.componenttype === 1 && item.objectid === tableId)) fail('RIBBON_DEPLOY_TARGET','A complete visible membership baseline including the actual table is required.');
    const model = new OperationMetadata((await reader.request('/$metadata','GET',undefined,{Accept:'application/xml'})).data);
    return {reader,identity,target:{solutionId:target.solutionid,uniqueName:target.uniquename,version:target.version,publisherId},table:{metadataId:tableId,logicalName:selected.logical},model,
      membershipHash:digest([...members.items].sort((a,b) => a.solutioncomponentid.localeCompare(b.solutioncomponentid)))};
  }
  private async exported(selected:Local,context:Awaited<ReturnType<RibbonDeploymentService['context']>>,signal?:AbortSignal) {
    const operation = contract(context.model,'ExportSolution',['SolutionName','Managed'],'ExportSolutionResponse',{ExportSolutionFile:'Edm.Binary'}),
      body = bodyFor(context.model,operation,{SolutionName:selected.manifest.uniqueName,Managed:false,...Object.fromEntries(exportFlags.map(key => [key,false]))});
    try {
      const response = row((await context.reader.request('/ExportSolution','POST',body)).data),view = packageRibbon(binary(response.ExportSolutionFile),selected.logical,signal);
      if (digest(view.summary.manifest) !== digest(selected.manifest)) fail('RIBBON_DEPLOY_BASELINE','The fresh target export manifest differs from the reviewed package.');return view;
    } catch (error) {
      if (signal?.aborted || error instanceof CrmRequestError && error.code === 'D365_REQUEST_ABORTED') throw error;
      throw new SolutionError('RIBBON_EXPORT_BASELINE','The fresh native export baseline failed; no import or publish was submitted.',{accepted:false,importSubmitted:false,phase:'export_baseline',evidence:clean(error)},{outcome:'not_sent'});
    }
  }
  import(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = args(raw,[...files,'dry_run','expected_hash','allow_unprotected_write','allow_full_solution_import']),dry = flag(a.dry_run,true);flag(a.allow_unprotected_write);flag(a.allow_full_solution_import);
      const selected = await local(a,signal),context = await this.context(selected,signal),fresh = await this.exported(selected,context,signal),source = packageRibbon(selected.source,selected.logical,signal),
        sourceFingerprint = payloadFingerprint(source,selected.logical),targetFingerprint = payloadFingerprint(fresh,selected.logical);
      if (sourceFingerprint !== targetFingerprint) fail('RIBBON_SOURCE_STALE','The source payloads differ from the fresh export of the configured target. Export/rebase/review again; no import was submitted.');
      const operation = contract(context.model,'ImportSolutionAsync',['CustomizationFile','ImportJobId','OverwriteUnmanagedCustomizations','PublishWorkflows'],'ImportSolutionAsyncResponse',{AsyncOperationId:'Edm.Guid',ImportJobKey:'Edm.String'}),
        body = bodyFor(context.model,operation,{CustomizationFile:selected.candidate.toString('base64'),ImportJobId:'11111111-1111-4111-8111-111111111111',OverwriteUnmanagedCustomizations:false,PublishWorkflows:false,SkipProductUpdateDependencies:false,HoldingSolution:false,StageAndUpgrade:false,SchemaUpdatesOnly:false,ComponentParameters:[]});
      const binding = {environment:this.environment,identity:context.identity,target:context.target,table:context.table,sourceSha256:source.summary.sha256,candidateSha256:selected.actual.summary.sha256,changesHash:selected.changesHash},
        publicBody = {...body,CustomizationFile:{sha256:selected.actual.summary.sha256,size:selected.actual.summary.size},ImportJobId:'generated_at_execution'},
        planHash = digest({...binding,sourceFingerprint,targetFingerprint,membershipHash:context.membershipHash,metadataHash:context.model.metadataHash,body:publicBody});review(a,planHash,dry,'allow_full_solution_import');
      const state = {...binding,planHash,operation:'import_ribbon_solution',accepted:false,completed:false,published:false,deploymentVerified:false,sourceBaseline:'fresh_export_payloads_matched',
        scope:'entire_existing_unmanaged_solution_not_only_Ribbon',concurrency:'unprotected_native_action',request:{method:'POST',path:'/ImportSolutionAsync',body:publicBody}};
      if (digest(signature(source.ribbon)) === digest(signature(selected.actual.ribbon))) return {...state,dryRun:dry,noChange:true,reason:'selected_Ribbon_definition_is_unchanged',importSubmitted:false};
      if (dry) return {...state,dryRun:true};
      const accepted = await submitSolutionImport(context.reader,body,state),payload = {format:'d365.ribbon.import.v1',...binding,asyncOperationId:accepted.asyncOperationId,importJobId:accepted.importJobId,importJobKey:accepted.importJobKey,createdAt:new Date().toISOString()};
      return {...accepted,importReceipt:{payload,mac:mac(payload)},receiptValidity:'same_server_process_only_do_not_reimport_after_restart',automaticPolling:false};
    });
  }
  private async imported(selected:Local,context:Awaited<ReturnType<RibbonDeploymentService['context']>>,receipt:unknown,signal?:AbortSignal) {
    const payload = receiptPayload(receipt),expected = {environment:this.environment,identity:context.identity,target:context.target,table:context.table,
      sourceSha256:packageRibbon(selected.source,selected.logical,signal).summary.sha256,candidateSha256:selected.actual.summary.sha256,changesHash:selected.changesHash};
    for (const key of Object.keys(expected)) if (digest(payload[key]) !== digest((expected as Row)[key])) fail('RIBBON_RECEIPT_TARGET','The receipt does not bind these files/changes, organization, caller, solution and table.');
    const status = await new SolutionTransferService(this.client,this.environment).status({async_operation_id:objectId(payload.asyncOperationId),import_job_id:objectId(payload.importJobId)},signal),
      async = status.observations.asyncOperation,job = status.observations.importJob;
    if (digest(status.identity) !== digest(context.identity) || async?.status !== 'available' || async.completion !== 'succeeded' || async.solutionImportTypeVerified !== true
      || job?.status !== 'available' || objectId(job.record.solutionid) !== context.target.solutionId || job.record.solutionname !== context.target.uniqueName) fail('RIBBON_IMPORT_NOT_READY','The receipt-bound native import job has not been verified as successfully completed for this solution. Publication was not submitted.');
    const log = await new SolutionImportLogService(this.client,this.environment).read({import_job_id:payload.importJobId,include_text:false,top:20},signal),result:Row = log.log;
    if (result.status !== 'available' || !result.recognizedResultElements || result.counts.failure || result.counts.unknown || result.manifestResultsTruncated
      || result.manifestResults.length !== 1 || result.manifestResults[0].solutionUniqueName !== context.target.uniqueName || result.manifestResults[0].status !== 'success'
      || objectId(log.job.solutionid) !== context.target.solutionId || log.job.solutionname !== context.target.uniqueName || typeof log.job.completedon !== 'string' || !Number.isFinite(Date.parse(log.job.completedon))) fail('RIBBON_IMPORT_LOG','A complete successful native manifest log and matching completed job are required before publication.');
    return {payload,evidence:{asyncOperationId:payload.asyncOperationId,importJobId:payload.importJobId,receiptBinding:'same_process_native_acceptance',asyncCompletion:'succeeded',manifestResult:'success',warningCount:result.counts.warning,logSha256:result.xmlSha256}};
  }
  private async readback(selected:Local,signal?:AbortSignal) {
    const current = await new RibbonService(this.client,this.environment).read({logical_name:selected.logical,include_xml:true,top:500},signal),
      document = ribbonDocument(current.effectiveRibbonXml!,['RibbonDefinitions','RibbonDefinition','Ribbon'],2*1024*1024);
    return {...compareEffective(selected.actual.ribbon,document.documentElement!,selected.built.changes.map(change => ({button_id:change.buttonId}))),effectiveDefinitionHash:current.ribbon.definitionHash};
  }
  publish(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = args(raw,[...files,'import_receipt','dry_run','expected_hash','allow_unprotected_write','allow_full_table_publish']),dry = flag(a.dry_run,true);flag(a.allow_unprotected_write);flag(a.allow_full_table_publish);receiptPayload(a.import_receipt);
      const selected = await local(a,signal),context = await this.context(selected,signal),imported = await this.imported(selected,context,a.import_receipt,signal),fresh = await this.exported(selected,context,signal),source = packageRibbon(selected.source,selected.logical,signal);
      if (payloadFingerprint(fresh,selected.logical,true) !== payloadFingerprint(source,selected.logical,true)) fail('RIBBON_PUBLISH_BASELINE','The published/exportable non-Ribbon solution payload changed; re-evaluate before publishing.');
      const operation = (() => {try {
        const matches = context.model.lookup('PublishXml',false).filter(op => !op.bound && op.qualifiedName === 'Microsoft.Dynamics.CRM.PublishXml' && op.imports.includes('PublishXml') && !op.returnType && op.parameters.length === 1 && op.parameters[0].name === 'ParameterXml' && op.parameters[0].type === 'Edm.String' && !op.parameters[0].collection);
        if (matches.length !== 1) throw new Error();return matches[0];
      } catch {return fail('RIBBON_PUBLISH_UNSUPPORTED','The current CSDL does not expose the expected PublishXml contract.');}})();
      const body = bodyFor(context.model,operation,{ParameterXml:'<importexportxml><entities><entity>'+selected.logical+'</entity></entities></importexportxml>'}),live = await new RibbonService(this.client,this.environment).read({logical_name:selected.logical},signal),
        planHash = digest({receipt:a.import_receipt,identity:context.identity,target:context.target,table:context.table,membershipHash:context.membershipHash,exportFingerprint:payloadFingerprint(fresh,selected.logical),effectiveRibbonHash:live.ribbon.definitionHash,metadataHash:context.model.metadataHash,body,importEvidence:imported.evidence});review(a,planHash,dry,'allow_full_table_publish');
      const state = {operation:'publish_ribbon_solution',environment:this.environment,identity:context.identity,target:context.target,table:context.table,planHash,importEvidence:imported.evidence,
        importAccepted:true,importCompleted:true,published:false,scope:'entire_table_including_other_pending_fields_forms_views_and_ribbon',pendingCustomizationContents:'not_read_or_locked',
        resourcePublication:'not_requested_use_separate_web_resource_publication',runtimeVerified:false,deploymentVerified:false,request:{method:'POST',path:'/PublishXml',body}};
      if (dry) return {...state,dryRun:true};cancelled(signal);
      try {await context.reader.request('/PublishXml','POST',body);}
      catch (error) {const details = evidence(error),unknown = details.outcome === 'unknown' || details.status === undefined && details.outcome !== 'not_sent';
        throw new SolutionError('RIBBON_PUBLISH_FAILED','Publication was not confirmed. Do not reimport or automatically republish; inspect native Ribbon/job evidence.',{...state,published:unknown ? null : false,phase:'publish',retrySubmitted:false},details);}
      CacheService.flushExisting();const accepted = {...state,dryRun:false,published:true,phase:'readback',retrySubmitted:false};
      try {const readback = await this.readback(selected,signal);if (readback.status !== 'matched') throw new SolutionError('RIBBON_READBACK_DIFFERENT','The published definition did not fully match the selected changes.',{readback},{});
        return {...accepted,readback,phase:'complete'};
      } catch (error) {throw new SolutionError('RIBBON_PUBLISH_READBACK_FAILED','The PublishXml request succeeded, but selected Ribbon verification failed. Publication evidence is retained and no import/publish is replayed.',
        {...accepted,readback:error instanceof SolutionError && error.data.readback ? error.data.readback : {status:'failed'},sourceErrorCode:error instanceof CrmRequestError ? error.code : undefined},clean(error));}
    });
  }
  verify(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {const a = args(raw,files),selected = await local(a,signal),context = await this.context(selected,signal),readback = await this.readback(selected,signal);
      return {success:true,environment:this.environment,identity:context.identity,target:context.target,table:context.table,candidateSha256:selected.actual.summary.sha256,readback,
        imported:'not_proven_by_this_read',published:'not_proven_by_this_read',runtimeVerified:false,deploymentVerified:false,automaticRepair:false};});
  }
}
