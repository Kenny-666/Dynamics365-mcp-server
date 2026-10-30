import {randomUUID} from 'node:crypto';
import {open,realpath,lstat} from 'node:fs/promises';
import {dirname,basename,join,extname} from 'node:path';
import type {CrmRequestClient} from '../types/crmRequest.js';
import {CrmRequestError} from '../errors.js';
import {OperationMetadata,digest,type Operation} from './apiOperationMetadata.js';
import {OperationValues} from './apiOperationValues.js';
import {SolutionService} from './solution.js';
import {SolutionReader,SolutionError,fail,flag,name,objectId,project,protect,row,type Row} from './solutionSupport.js';
import {binary,byteHash,cancelled,inspectPackage,localPath,packageBytes,transferArgs} from './solutionPackage.js';
import {evidence} from './pluginStepValidation.js';
import {CacheService} from './cache.js';

export const exportFlags = ['ExportAutoNumberingSettings','ExportCalendarSettings','ExportCustomizationSettings','ExportEmailTrackingSettings',
  'ExportGeneralSettings','ExportMarketingSettings','ExportOutlookSynchronizationSettings','ExportRelationshipRoles','ExportIsvConfig','ExportSales'];
const nativeTypes:Record<string,Record<string,string>> = {
  ExportSolution:{SolutionName:'Edm.String',Managed:'Edm.Boolean',...Object.fromEntries(exportFlags.map(key => [key,'Edm.Boolean'])),
    TargetVersion:'Edm.String',ExportExternalApplications:'Edm.Boolean',ExportComponentsParams:'Microsoft.Dynamics.CRM.ExportComponentsParams'},
  ImportSolutionAsync:{CustomizationFile:'Edm.Binary',ImportJobId:'Edm.Guid',OverwriteUnmanagedCustomizations:'Edm.Boolean',PublishWorkflows:'Edm.Boolean',
    ConvertToManaged:'Edm.Boolean',SkipProductUpdateDependencies:'Edm.Boolean',HoldingSolution:'Edm.Boolean',SkipQueueRibbonJob:'Edm.Boolean',
    LayerDesiredOrder:'Microsoft.Dynamics.CRM.LayerDesiredOrder',AsyncRibbonProcessing:'Edm.Boolean',ComponentParameters:'Collection(Microsoft.Dynamics.CRM.crmbaseentity)',
    SolutionParameters:'Microsoft.Dynamics.CRM.SolutionParameters',IsTemplateMode:'Edm.Boolean',TemplateSuffix:'Edm.String',TemplateDisplayNamePrefix:'Edm.String',StageAndUpgrade:'Edm.Boolean',SchemaUpdatesOnly:'Edm.Boolean'},
};
export function contract(model:OperationMetadata,method:string,required:string[],responseType:string,properties:Record<string,string>):Operation {
  try {
    const allowed = nativeTypes[method],matches = model.lookup(method,false).filter(op => !op.bound && op.qualifiedName === 'Microsoft.Dynamics.CRM.'+method
      && op.imports.includes(method) && required.every(key => op.parameters.some(p => p.name === key))
      && op.parameters.every(p => allowed[p.name] === (p.collection ? 'Collection('+p.type+')' : p.type))
      && op.returnType?.type === 'Microsoft.Dynamics.CRM.'+responseType && !op.returnType.collection);
    if (matches.length !== 1) throw new Error();
    const actual = model.structure(matches[0].returnType!.type).properties;
    if (!Object.entries(properties).every(([key,type]) => actual.get(key)?.type === type && !actual.get(key)?.collection)) throw new Error();
    return matches[0];
  } catch {return fail('NATIVE_CONTRACT_UNSUPPORTED','The current CSDL does not expose the supported transfer contract.',{method});}
}
export function bodyFor(model:OperationMetadata,operation:Operation,values:Row):Row {
  const validator = new OperationValues(model,false),body:Row = {};
  for (const parameter of operation.parameters) {
    if (Object.hasOwn(values,parameter.name)) body[parameter.name] = validator.value(parameter,values[parameter.name]);
    else if (!parameter.nullable && !parameter.optional) fail('NATIVE_CONTRACT_UNSUPPORTED','An unsupported required native transfer parameter is present.');
  }
  return body;
}
function expected(a:Row,hash:string,dry:boolean,unprotected = false) {
  if (a.expected_hash !== undefined && (typeof a.expected_hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_hash))) fail('INVALID','expected_hash must be a preview planHash.');
  if (a.expected_hash !== undefined && a.expected_hash !== hash) fail('CONFLICT','The package, environment or native transfer plan changed. Preview again.',{planHash:hash});
  if (!dry && (!a.expected_hash || unprotected && !flag(a.allow_unprotected_write))) fail('CONCURRENCY',unprotected
    ? 'Execution requires the current planHash and allow_unprotected_write=true. Native import has no confirmed atomic lock and can affect shared unmanaged components.'
    : 'Execution requires the current preview planHash.');
}
export async function outputPath(value:unknown):Promise<string> {
  const input = localPath(value);
  if (extname(input).toLowerCase() !== '.zip' || /[<>:"|?*]/.test(basename(input)) || /[. ]$/.test(basename(input)) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename(input))) fail('INVALID','output_path must name a new local .zip file.');
  try {
    const resolved = join(await realpath(dirname(input)),basename(input));
    try {await lstat(resolved);} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolved;throw error;}
    return fail('OUTPUT_EXISTS','The output path already exists; export never overwrites a file.');
  } catch (error) {if (error instanceof SolutionError) throw error;return fail('OUTPUT_PATH','The output directory is unavailable. Filesystem details are withheld.');}
}
const cleanEvidence = (error:unknown) => {const details = evidence(error);delete details.outcome;return details;};
export async function submitSolutionImport(reader:SolutionReader,body:Row,state:Row) {
  cancelled(reader.signal);const importJobId = randomUUID();body = {...body,ImportJobId:importJobId};let response;
  try {response = await reader.request('/ImportSolutionAsync','POST',body);}
  catch (error) {
    const details = evidence(error),unknown = details.outcome === 'unknown' || details.status === undefined && details.outcome !== 'not_sent';
    if (unknown) CacheService.flushExisting();
    throw new SolutionError('IMPORT_SUBMIT_FAILED','The import submission failed. Inspect the supplied import job ID before considering another submission; this operation is never automatically replayed.',
      {...state,accepted:unknown ? null : false,importJobId,phase:'submit',retrySubmitted:false},details);
  }
  CacheService.flushExisting();const accepted = {...state,dryRun:false,accepted:true,importJobId,httpStatus:response.status,phase:'accepted',retrySubmitted:false};
  try {
    const result = row(response.data),asyncOperationId = objectId(result.AsyncOperationId);
    if (typeof result.ImportJobKey !== 'string' || !result.ImportJobKey || result.ImportJobKey.length > 256 || /[\x00-\x1f\x7f]/.test(result.ImportJobKey)) fail('RESPONSE_INVALID','The native import job key is missing or malformed.');
    return {...accepted,asyncOperationId,importJobKey:result.ImportJobKey,importJobIdStatus:'client_supplied_not_readback_verified',nativeKeyMatchesRequestedId:result.ImportJobKey.toLowerCase() === importJobId,
      tracking:{tool:'get_solution_import_status',asyncOperationId,importJobId,correlation:'ImportJobId_supplied_in_accepted_native_request',automaticPolling:false}};
  } catch (error) {throw new SolutionError('IMPORT_RECEIPT_INVALID','The native request was accepted but its tracking receipt is invalid. Do not resubmit automatically.',accepted,cleanEvidence(error));}
}
export class SolutionTransferService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:{orgUrl:string;apiVersion:string;authType:string}) {}
  private reader(signal?:AbortSignal) {return new SolutionReader(this.client,this.environment,signal);}
  private async metadata(reader:SolutionReader) {return new OperationMetadata((await reader.request('/$metadata','GET',undefined,{Accept:'application/xml'})).data);}
  private async identity(reader:SolutionReader) {
    const data = row((await reader.request('/WhoAmI')).data);
    return {organizationId:objectId(data.OrganizationId),userId:objectId(data.UserId),businessUnitId:objectId(data.BusinessUnitId)};
  }
  private async find(uniqueName:string,signal?:AbortSignal) {
    const result = await new SolutionService(this.client,this.environment).list({solution_unique_name:uniqueName,top:2,max_pages:1},signal);
    if (!result.paging.complete || result.items.length > 1 || result.items.some(item => item.uniquename !== uniqueName)) fail('TARGET','The exact solution lookup was incomplete or ambiguous.');
    return result.items[0] ?? null;
  }
  export(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = transferArgs(raw,['solution_unique_name','managed','output_path','dry_run','expected_hash']),uniqueName = name(a.solution_unique_name),dry = flag(a.dry_run,true),managed = flag(a.managed);
      const path = await outputPath(a.output_path),reader = this.reader(signal),identity = await this.identity(reader),solution = await this.find(uniqueName,signal);
      if (!solution || solution.ismanaged !== false || solution.isvisible !== true || solution._parentsolutionid_value || ['default','active','system'].includes(uniqueName.toLowerCase())) fail('TARGET','Export requires a visible, ordinary unmanaged source solution.');
      const model = await this.metadata(reader),operation = contract(model,'ExportSolution',['SolutionName','Managed'],'ExportSolutionResponse',{ExportSolutionFile:'Edm.Binary'});
      const body = bodyFor(model,operation,{SolutionName:uniqueName,Managed:managed,...Object.fromEntries(exportFlags.map(key => [key,false]))});
      const planHash = digest({environment:this.environment,identity,solution,metadataHash:model.metadataHash,body,path});expected(a,planHash,dry);
      const state = {operation:'export_solution',environment:this.environment,identity,solution,planHash,managed,outputPath:path,
        exported:false,localSaved:false,publication:'not_requested',sourceSnapshot:false};
      if (dry) return {...state,dryRun:true,request:{method:'POST',path:'/ExportSolution',body},note:'Export uses the current published solution state. The preview is not a component snapshot or dependency validation.'};
      cancelled(signal);
      // Reserve an exclusive file before invoking the native export; a concurrent creator cannot be overwritten.
      let file;
      try {file = await open(path,'wx+');} catch {return fail('OUTPUT_RESERVATION','The new output file could not be reserved. No export was sent.');}
      let exported = false,artifact:Row|undefined,written = false;
      try {
        const response = await reader.request('/ExportSolution','POST',body);exported = true;
        const bytes = binary(row(response.data).ExportSolutionFile);artifact = inspectPackage(bytes,signal);
        if (artifact.manifest.uniqueName !== uniqueName || artifact.manifest.version !== solution.version || artifact.manifest.managed !== managed) fail('EXPORT_MISMATCH','The returned package identity differs from the reviewed source/request.');
        cancelled(signal);await file.writeFile(bytes);written = true;await file.sync();
        const stat = await file.stat(),readback = Buffer.alloc(bytes.length+1);let count = 0;
        while (count < readback.length) {const read = await file.read(readback,count,readback.length-count,count);if (!read.bytesRead) break;count += read.bytesRead;}
        const named = await lstat(path);
        if (stat.size !== bytes.length || count !== bytes.length || byteHash(readback.subarray(0,count)) !== artifact.sha256
          || !named.isFile() || named.isSymbolicLink() || named.ino !== stat.ino || named.dev !== stat.dev || named.size !== stat.size) fail('OUTPUT_READBACK','The saved package did not match the exported bytes/file identity.');
        await file.close();
        return {...state,dryRun:false,exported:true,localSaved:true,package:artifact,localReadback:'matched'};
      } catch (error) {
        await file.close().catch(() => {});
        const details = evidence(error);
        throw new SolutionError('EXPORT_FAILED','Export or local artifact verification failed. The reserved file may be empty or partial; no export is replayed.',
          {...state,exported,localSaved:written ? null : false,package:artifact,phase:exported ? 'artifact' : 'native_export',reservedFile:true,
            sourceErrorCode:error instanceof CrmRequestError ? error.code : undefined},exported ? cleanEvidence(error) : details);
      }
    });
  }
  import(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = transferArgs(raw,['file_path','content_base64','dry_run','expected_hash','allow_unprotected_write']),dry = flag(a.dry_run,true);
      flag(a.allow_unprotected_write);const bytes = await packageBytes(a,signal),artifact = inspectPackage(bytes,signal),manifest = artifact.manifest;
      if (manifest.managed || manifest.parentSolutionUniqueName || ['default','active','system'].includes(manifest.uniqueName.toLowerCase())) fail('IMPORT_SCOPE','Only an ordinary unmanaged package for a first import is supported. Managed solutions, patches and upgrades require a separate workflow.');
      const reader = this.reader(signal),identity = await this.identity(reader),solution = await this.find(manifest.uniqueName,signal);
      if (solution) fail('IMPORT_EXISTS','A solution with this unique name is already visible. Updates and upgrades are outside this import workflow.');
      const model = await this.metadata(reader),operation = contract(model,'ImportSolutionAsync',['CustomizationFile','ImportJobId','OverwriteUnmanagedCustomizations','PublishWorkflows'],
        'ImportSolutionAsyncResponse',{AsyncOperationId:'Edm.Guid',ImportJobKey:'Edm.String'});
      const flags:Row = {OverwriteUnmanagedCustomizations:false,PublishWorkflows:false,SkipProductUpdateDependencies:false,HoldingSolution:false,StageAndUpgrade:false,SchemaUpdatesOnly:false,ComponentParameters:[]};
      // A stable placeholder tests the current GUID parameter contract without putting a newly generated ID into the fingerprint.
      const body = bodyFor(model,operation,{...flags,CustomizationFile:bytes.toString('base64'),ImportJobId:'11111111-1111-4111-8111-111111111111'});
      const publicBody = {...body,CustomizationFile:{sha256:artifact.sha256,size:artifact.size},ImportJobId:'generated_at_execution'};
      const planHash = digest({environment:this.environment,identity,metadataHash:model.metadataHash,package:artifact,body:publicBody,visibleTarget:solution});expected(a,planHash,dry,true);
      const state = {operation:'import_solution_async',environment:this.environment,identity,package:artifact,planHash,accepted:false,completed:false,
        deploymentVerified:false,concurrency:'unprotected_native_action',visibleTarget:'absent_for_current_caller',publication:'no_separate_publish_requested',
        note:'First solution-name import can still change shared unmanaged components. OverwriteUnmanagedCustomizations=false is not a general no-overwrite guarantee. Platform import side effects remain native; no full component diff/dependency or runtime validation is claimed.'};
      if (dry) return {...state,dryRun:true,request:{method:'POST',path:'/ImportSolutionAsync',body:publicBody}};
      return submitSolutionImport(reader,body,state);
    });
  }
  status(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = transferArgs(raw,['async_operation_id','import_job_id']);
      if (a.async_operation_id === undefined && a.import_job_id === undefined) fail('INVALID','Supply async_operation_id and/or import_job_id from the submission receipt.');
      const asyncId = a.async_operation_id === undefined ? undefined : objectId(a.async_operation_id),jobId = a.import_job_id === undefined ? undefined : objectId(a.import_job_id);
      const reader = this.reader(signal),identity = await this.identity(reader),observations:Row = {};
      const read = async (key:string,path:string,id:string,field:string,fields:string) => {
        try {const item = project((await reader.request(path+'('+id+')?$select='+fields)).data,fields);if (objectId(item[field]) !== id) fail('RESPONSE_INVALID','The requested job ID did not match.');observations[key] = {status:'available',record:item};}
        catch (error) {
          if (signal?.aborted) throw error;
          const details = cleanEvidence(error);observations[key] = {status:details.status === 403 ? 'forbidden' : details.status === 404 ? 'unavailable_or_hidden' : 'failed',evidence:details};
        }
      };
      if (asyncId !== undefined) {
        const id = asyncId;await read('asyncOperation','/asyncoperations',id,'asyncoperationid','asyncoperationid,statecode,statuscode,operationtype,errorcode,createdon,startedon,completedon');
        const observed = observations.asyncOperation,record = observed.record;
        if (record) {
          const status = record.statecode === 3 ? ({30:'succeeded',31:'failed',32:'cancelled'} as Row)[record.statuscode] : undefined;
          observed.completion = status ?? ([0,1,2].includes(record.statecode) && [0,10,20,21,22].includes(record.statuscode) ? 'pending' : 'unknown');
          observed.isTerminal = ['succeeded','failed','cancelled'].includes(observed.completion);
          observed.solutionImportTypeVerified = record.operationtype === 203;
          if (observed.completion === 'succeeded') CacheService.flushExisting();
        }
      }
      if (jobId !== undefined) {
        const id = jobId;await read('importJob','/importjobs',id,'importjobid','importjobid,solutionid,solutionname,progress,createdon,startedon,completedon');
        const observed = observations.importJob,record = observed.record;
        if (record) {
          observed.progress = typeof record.progress === 'number' && record.progress >= 0 && record.progress <= 100 ? record.progress : null;
          observed.progressIsSuccessProof = false;
          if (record.solutionid && record.solutionname) {
            try {const solution = await this.find(name(record.solutionname),signal);observed.solutionReadback = solution?.solutionid === objectId(record.solutionid)
              ? {status:'identity_matched',solution,componentContentsVerified:false,runtimeVerified:false} : {status:'missing_or_mismatched'};}
            catch (error) {if (signal?.aborted) throw error;observed.solutionReadback = {status:'failed',evidence:cleanEvidence(error)};}
          } else observed.solutionReadback = {status:'not_available'};
        }
      }
      return {success:true,environment:this.environment,identity,observations,correlation:'caller_supplied_job_ids_not_independently_linked',deploymentVerified:false,
        logs:'not_requested_or_returned',automaticPolling:false,note:'These are independent current-caller observations. An import progress of 100 or solution identity match does not prove async success, publication, contents, dependency closure or runtime behavior. Missing/hidden/deleted jobs are not failures or permission to resubmit.'};
    });
  }
}
