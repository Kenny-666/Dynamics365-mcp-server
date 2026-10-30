import { CrmRequestError } from '../errors.js';
import type { MutationKind, MutationPlan, NativeBatchPart, Row } from '../types/recordMutation.js';
import { RecordMetadata } from './recordMetadata.js';
import { RecordMutationService } from './recordMutation.js';
import { argumentsObject, bool, normalize, RecordMutationError, safeDetails, invalid, json } from './recordMutationInput.js';
import { buildBatch, parseBatch, wireError } from './recordBatchWire.js';

export interface MutationContext {signal?:AbortSignal; onProgress?:(progress:number,total:number)=>Promise<void>;}
export class RecordBatchService {
  constructor(private readonly writer:RecordMutationService) {}

  async execute(raw:unknown,transaction:boolean,context:MutationContext = {}):Promise<Row> {
    const args = argumentsObject(raw,transaction ? ['operations','dry_run'] : ['operations','dry_run','chunk_size','continue_on_error']);
    const dryRun = bool(args.dry_run,'dry_run');
    const continueOnError = bool(args.continue_on_error,'continue_on_error');
    const chunkSize = transaction ? 100 : args.chunk_size ?? 25;
    if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 100) invalid('chunk_size must be an integer from 1 to 100.');
    if (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 100) invalid('operations must contain 1–100 mutations.');
    // Bound the entire call, including all prepared chunks and previews, before allocating per-operation plans.
    json(args.operations);
    const operations:{operation:MutationKind;args:Row}[] = args.operations.map((item:unknown) => {
      const op = argumentsObject(item,['operation','arguments']);
      if (!['create','update','delete','upsert','associate','disassociate'].includes(op.operation)) invalid('Unsupported batch operation.');
      const args = normalize(op.operation,op.arguments);
      if (args.dry_run) invalid('Set dry_run on the batch, not on an individual operation.');
      return {operation:op.operation,args};
    });
    const plans:MutationPlan[] = [];
    const metadata = new RecordMetadata(this.writer.client,context.signal);
    try {
      for (const item of operations) plans.push(await this.writer.prepare(item.operation,{...item.args,dry_run:dryRun},metadata,context.signal));
    } catch (error) {
      throw new RecordMutationError('D365_BATCH_PREFLIGHT_FAILED','Batch preflight failed; no batch write was sent.',
        {transaction,total:operations.length,chunksSent:0,committed:false,cancelled:context.signal?.aborted ?? false,
          items:operations.map((item,index) => ({index,operation:item.operation,status:'not_sent'}))},safeDetails(error));
    }
    const blocked = plans.some(plan => plan.blockedBy !== null);
    if (dryRun) return {success:true,dryRun:true,transaction,total:plans.length,canWrite:!blocked,
      operations:plans.map((plan,index) => ({index,...plan.preview})),
      note:'Preflight reads occur outside the transaction. Repeated targets may conflict; consolidate changes to the same row. No Content-ID dependencies or arbitrary HTTP operations are accepted.'};
    if (blocked) throw new RecordMutationError('D365_BATCH_PREFLIGHT_BLOCKED','At least one operation was blocked. No batch was sent.',
      {transaction,total:plans.length,chunksSent:0,committed:false,items:plans.map((plan,index) => ({index,operation:plan.operation,status:'not_sent',blockedBy:plan.blockedBy}))});
    // Build every chunk before the first write so wire-size/serialization failures cannot cause partial dispatch.
    const chunks:{start:number;plans:MutationPlan[];body:string;contentType:string}[] = [];
    for (let start = 0; start < plans.length; start += chunkSize) {
      const selected = plans.slice(start,start + chunkSize);
      chunks.push({start,plans:selected,...buildBatch(selected.map((plan,offset) => ({plan,contentId:String(start + offset + 1)})),
        transaction,endpoint => this.writer.absolute(endpoint))});
    }
    const items:Row[] = plans.map((plan,index) => ({index,operation:plan.operation,status:'not_sent'}));
    let chunksSent = 0, committed:boolean | null = transaction ? false : null;
    const issues:Row[] = [];
    for (const chunk of chunks) {
      if (context.signal?.aborted) break;
      let parts:NativeBatchPart[];
      try {
        chunksSent++;
        const response = await this.writer.client.requestWithResponse<string>('/$batch','POST',chunk.body,
          {headers:{'Content-Type':chunk.contentType,...(continueOnError ? {Prefer:'odata.continue-on-error'} : {})},signal:context.signal});
        if (response.status !== 200) wireError();
        parts = parseBatch(response.data,response.headers['content-type'] || '');
        const mapped = this.correlate(parts,chunk.start,chunk.plans.length,transaction);
        const failures = parts.filter(part => part.response.status >= 400);
        if (transaction && failures.length) {
          committed = failures.some(part => part.response.status >= 500 || part.response.status === 408) ? null : false;
          for (let offset = 0; offset < chunk.plans.length; offset++) items[chunk.start + offset] = {
            index:chunk.start + offset,operation:chunk.plans[offset].operation,status:committed === false ? 'not_committed' : 'unknown'};
          for (const [index,part] of mapped) if (part.response.status >= 400) items[index] = this.failure(index,plans[index],part);
          issues.push({phase:'transaction',committed,errors:failures.map(part => this.failure(-1,chunk.plans[0],part).error)});
        } else {
          if (transaction && parts.length !== chunk.plans.length) wireError();
          if (transaction) committed = true;
          for (const [index,part] of mapped) {
            if (part.response.status >= 400) items[index] = this.failure(index,plans[index],part);
            else {
              try {
                const {status:httpStatus,...result} = this.writer.success(plans[index],part.response);
                items[index] = {index,...result,status:'succeeded',httpStatus};
              }
              catch (error) {
                items[index] = {index,operation:plans[index].operation,
                  issue:error instanceof CrmRequestError ? error.code : 'D365_RECORD_RESPONSE_INVALID',
                  ...(error instanceof RecordMutationError ? error.data : {}),status:'succeeded_with_issue',httpStatus:part.response.status};
                issues.push({index,phase:'response_identity'});
              }
            }
          }
          const missing = chunk.plans.map((_plan,offset) => chunk.start + offset).filter(index => !mapped.has(index));
          const last = [...mapped.keys()].sort((a,b) => a - b).at(-1);
          for (const index of missing) items[index] = {index,operation:plans[index].operation,
            status:!continueOnError && last !== undefined && index > last && mapped.get(last)!.response.status >= 400 ? 'not_executed' : 'unknown'};
        }
      } catch (error) {
        const details = safeDetails(error);
        const unknown = details.outcome === 'unknown' || details.outcome === undefined;
        for (let offset = 0; offset < chunk.plans.length; offset++) items[chunk.start + offset] = {
          index:chunk.start + offset,operation:chunk.plans[offset].operation,status:unknown ? 'unknown' : 'not_executed'};
        if (transaction) committed = unknown ? null : false;
        issues.push({phase:'batch_request_or_response',...details});
        break;
      }
      await this.progress(context,Math.min(chunk.start + chunk.plans.length,plans.length),plans.length);
      if (items.slice(chunk.start,chunk.start + chunk.plans.length).some(item => item.status === 'unknown')) break;
      if (!continueOnError && items.some(item => item.status !== 'succeeded' && item.status !== 'not_sent')) break;
    }
    const success = items.every(item => item.status === 'succeeded');
    const result = {success,transaction,committed,total:plans.length,chunksSent,items,issues,cancelled:context.signal?.aborted ?? false,
      summary:Object.fromEntries(['succeeded','succeeded_with_issue','failed','unknown','not_sent','not_executed','not_committed']
        .map(status => [status,items.filter(item => item.status === status).length]))};
    await this.progress(context,plans.length,plans.length);
    if (!success) throw new RecordMutationError('D365_BATCH_NOT_COMPLETE','Batch did not fully succeed. Inspect per-item outcomes before retrying; no automatic replay was performed.',
      result,{outcome:items.some(item => item.status === 'unknown') ? 'unknown' : 'rejected',retryable:false});
    return result;
  }
  private correlate(parts:NativeBatchPart[],start:number,count:number,transaction:boolean):Map<number,NativeBatchPart> {
    const result = new Map<number,NativeBatchPart>();
    const groups = parts.map(part => part.changeSet).filter((group):group is string => group !== undefined);
    if (parts.some(part => part.response.status < 400 && part.changeSet === undefined)) wireError();
    if (transaction ? new Set(groups).size > 1 : new Set(groups).size !== groups.length) wireError();
    const withIds = parts.filter(part => part.contentId !== undefined).length;
    if (withIds && withIds !== parts.length) wireError();
    if (parts.length > count) wireError();
    for (let offset = 0; offset < parts.length; offset++) {
      // A transaction can report one unlabelled failure without identifying its failing operation.
      if (transaction && !withIds && parts.length !== count && parts[offset].response.status >= 400) continue;
      const index = withIds ? Number(parts[offset].contentId) - 1 : start + offset;
      if (index < start || index >= start + count || result.has(index)) wireError();
      result.set(index,parts[offset]);
    }
    return result;
  }
  private failure(index:number,plan:MutationPlan,part:NativeBatchPart):Row {
    const response = part.response;
    const platformCode = response.data?.error?.code;
    const requestId = response.headers['x-ms-service-request-id'] || response.headers.req_id;
    return {index,operation:plan.operation,status:response.status >= 500 || response.status === 408 ? 'unknown' : 'failed',
      httpStatus:response.status,error:safeDetails(new CrmRequestError('D365_HTTP_ERROR','Native batch item failed.',
        {status:response.status,platformCode,requestId}))};
  }
  private async progress(context:MutationContext,progress:number,total:number) {
    try { await context.onProgress?.(progress,total); } catch { /* Progress delivery cannot change confirmed write outcomes. */ }
  }
}
