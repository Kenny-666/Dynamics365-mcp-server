import type {CrmRequestClient} from '../types/crmRequest.js';
import type {MutationEnvironment} from '../types/recordMutation.js';
import {CrmRequestError} from '../errors.js';
import {SolutionSnapshotService,compareSnapshots} from './solutionSnapshot.js';
import {SolutionImportLogService} from './solutionImportLog.js';
import {SolutionTransferService} from './solutionTransfer.js';
import {flag,integer,objectId,protect,type Row} from './solutionSupport.js';
import {snapshotArgs,validateSnapshot} from './solutionSnapshotValues.js';
import {evidence} from './pluginStepValidation.js';

export class SolutionVerificationService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:MutationEnvironment) {}
  verify(raw:unknown,signal?:AbortSignal) {
    return protect(async () => {
      const a = snapshotArgs(raw,['expected_snapshot','expected_managed','async_operation_id','import_job_id','top','max_pages']);
      const baseline = validateSnapshot(a.expected_snapshot),expectedManaged = a.expected_managed === undefined ? undefined : flag(a.expected_managed),
        asyncId = a.async_operation_id === undefined ? undefined : objectId(a.async_operation_id),jobId = a.import_job_id === undefined ? undefined : objectId(a.import_job_id);
      const limit = integer(a.top,100,1,200),maxPages = integer(a.max_pages,5,1,20);
      const current = await new SolutionSnapshotService(this.client,this.environment).capture({solution_unique_name:baseline.solution.uniquename,top:limit,max_pages:maxPages},signal);
      const comparison = compareSnapshots(baseline,current.snapshot,expectedManaged),observations:Row = {};
      const observe = async (key:string,run:()=>Promise<any>) => {
        try {observations[key] = {status:'available',data:await run()};}
        catch (error) {if (signal?.aborted || error instanceof CrmRequestError && error.code === 'D365_REQUEST_ABORTED') throw error;const details = evidence(error);delete details.outcome;
          observations[key] = {status:details.status === 403 ? 'forbidden' : details.status === 404 ? 'unavailable_or_hidden' : 'failed',evidence:details};}
      };
      if (asyncId || jobId) await observe('nativeJobs',() => new SolutionTransferService(this.client,this.environment).status({...(asyncId ? {async_operation_id:asyncId} : {}),...(jobId ? {import_job_id:jobId} : {})},signal));
      if (jobId) await observe('importLog',async () => {
        const result = await new SolutionImportLogService(this.client,this.environment).read({import_job_id:jobId,include_text:false,top:20},signal);
        return {...result,requestedSolutionNameMatches:result.job.solutionname === baseline.solution.uniquename,
          currentSolutionIdMatches:result.job.solutionid === current.snapshot.solution.solutionid};
      });
      return {success:true,environment:this.environment,comparison,observations,currentSnapshotHash:current.snapshot.snapshotHash,selectedScopeCheck:comparison.selectedScopeCheck,
        deploymentVerified:false,publicationVerified:false,runtimeVerified:false,jobCorrelation:'caller_supplied_ids_not_independently_linked',automaticPolling:false,
        note:'Selected properties and job/log observations are separate checks. This does not attest a package-to-job-to-environment causal link, full component payload, dependency closure, managed layers, publication or runtime behavior. No publish, retry, import or repair was performed.'};
    });
  }
}
