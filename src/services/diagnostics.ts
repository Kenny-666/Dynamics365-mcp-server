import type { CrmRequestClient } from '../types/crmRequest.js';
import type { MutationEnvironment } from '../types/recordMutation.js';
import { RecordMetadata } from './recordMetadata.js';
import { PluginStepService } from './pluginStep.js';
import { cleanText,EvidenceReader,filterFields,filters,guid,identifier,input,invalid,literal,malformed,
  pick,protect,query,rowGuid,type Row } from './readEvidence.js';

const traceColumns = ['plugintracelogid','createdon','correlationid','pluginstepid','typename','messagename','primaryentity',
  'mode','operationtype','depth','performanceexecutionduration','requestid'];
const jobColumns = ['asyncoperationid','name','createdon','completedon','statecode','statuscode','operationtype','errorcode',
  'correlationid','_owningextensionid_value','_regardingobjectid_value'];
export class DiagnosticService {
  constructor(private readonly client:CrmRequestClient,private readonly environment:MutationEnvironment,
    private readonly plugins:PluginStepService,private readonly now:()=>Date = () => new Date()) {}

  settings(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = input(raw,['collection_name']);
    if (args.collection_name !== undefined) args.collection_name = identifier(args.collection_name,'collection_name');
    const reader = new EvidenceReader(this.client,signal);
    const organization = await reader.component('organization_settings',() => this.organization(reader));
    const table = args.collection_name === undefined ? null : await reader.component('table_audit_setting',async () => {
      const row = await new RecordMetadata(this.client,signal).table(args.collection_name);
      const managed = row.IsAuditEnabled;
      const enabled = typeof managed === 'boolean' ? managed : managed && typeof managed.Value === 'boolean' ? managed.Value : null;
      return {logicalName:row.LogicalName,collectionName:row.EntitySetName,auditEnabled:enabled,fieldAuditSettings:'not_inspected'};
    });
    return {success:true,environment:this.environment,checkedAt:this.now().toISOString(),organization,table,
      retentionAssessment:'unknown',note:'Current switches do not prove past settings, past execution or log deletion. No configuration was changed.'};
  }); }

  traceLogs(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = filters(input(raw,[...filterFields,'plugin_type_name','exceptions_only']),this.now());
    const reader = new EvidenceReader(this.client,signal);
    const result = await this.traces(reader,args);
    const settings = await reader.component('organization_settings',() => this.organization(reader));
    return {success:true,...result,query:this.effective(args,'createdon'),settings,retentionAssessment:'unknown',
      note:'No matches do not establish that no execution occurred, logging was disabled, or logs were deleted. Text is opt-in; configuration fields are always excluded.'};
  }); }

  failedJobs(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = filters(input(raw,filterFields),this.now());
    return {success:true,...await this.jobs(new EvidenceReader(this.client,signal),args),query:this.effective(args,'completedon'),
      note:'Queries native failed statuscode=31 by completion time; no matching visible jobs is not proof that no failure occurred.'};
  }); }

  diagnose(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = filters(input(raw,[...filterFields,'plugin_type_name']),this.now());
    if (!args.correlation_id && !args.step_id && !args.plugin_type_name) invalid('Provide correlation_id, step_id or plugin_type_name to anchor a diagnostic report.');
    const reader = new EvidenceReader(this.client,signal);
    const sources:Row = {};
    sources.settings = await reader.component('organization_settings',() => this.organization(reader));
    sources.traces = await reader.component('plugin_trace_logs',() => this.traces(reader,{...args,exceptions_only:true}));
    let stepIds:string[] = args.step_id ? [args.step_id] : [];
    if (!stepIds.length && sources.traces.status === 'ok') {
      stepIds = [...new Set<string>(sources.traces.data.items.map((item:Row) => item.pluginstepid).filter((id:unknown) => typeof id === 'string'))];
    }
    if (args.step_id || args.plugin_type_name) sources.steps = await reader.component('current_plugin_steps',() => this.plugins.query({
      step_id:args.step_id,plugin_type_name:args.plugin_type_name,include_secure_configuration:false,include_unsecure_configuration:false,top:100},signal));
    else {
      const rows:Row[] = [];
      let complete = true;
      const lookups:Row[] = [];
      for (const id of stepIds.slice(0,20)) {
        const source = await reader.component('current_plugin_step',() => this.plugins.query({step_id:id,include_secure_configuration:false,
          include_unsecure_configuration:false,top:2},signal));
        lookups.push(source);
        if (source.status === 'ok') rows.push(...source.data.items); else complete = false;
      }
      sources.steps = {source:'current_plugin_steps',status:complete ? 'ok' : 'partial',data:{items:rows,
        paging:{limited:stepIds.length > 20},lookups}};
    }
    if (sources.steps.status === 'ok' && !stepIds.length) stepIds = sources.steps.data.items.map((item:Row) => rowGuid(item.stepId));
    // A supplied step ID alone does not establish its class. Type-scoped jobs require positive trace/current-step evidence.
    const typeScopedIds = args.plugin_type_name ? [...new Set<string>([
      ...(sources.traces.status === 'ok' ? sources.traces.data.items.map((item:Row) => item.pluginstepid).filter(Boolean) : []),
      ...(sources.steps.status === 'ok' ? sources.steps.data.items.map((item:Row) => rowGuid(item.stepId)) : []),
    ])] : stepIds;
    const stepsLimited = !!sources.steps.data?.paging?.limited || !!sources.steps.data?.paging?.atLimit || !!sources.steps.data?.paging?.hasMore;
    if (!args.plugin_type_name && (args.correlation_id || args.step_id)) sources.jobs = await reader.component('failed_system_jobs',() => this.jobs(reader,args));
    else if (typeScopedIds.length && typeScopedIds.length <= 100 && !stepsLimited) sources.jobs = await reader.component('failed_system_jobs',() => this.jobs(reader,args,typeScopedIds));
    else sources.jobs = {source:'failed_system_jobs',status:'not_queried',reason:stepsLimited ? 'step_lookup_limited' : 'no_verified_step_ids'};
    const traces:Row[] = sources.traces.status === 'ok' ? sources.traces.data.items : [];
    const jobs:Row[] = sources.jobs.status === 'ok' ? sources.jobs.data.items : [];
    const steps:Row[] = sources.steps.data?.items ?? [];
    const known = new Set(steps.map(step => step.stepId));
    const links:Row[] = [];
    for (const trace of traces) if (trace.pluginstepid) links.push({traceId:trace.plugintracelogid,stepId:trace.pluginstepid,
      basis:'native_pluginstepid',currentStepFound:known.has(trace.pluginstepid)});
    for (const job of jobs) if (job._owningextensionid_value) links.push({jobId:job.asyncoperationid,stepId:job._owningextensionid_value,
      basis:'native_owningextensionid',currentStepFound:known.has(job._owningextensionid_value)});
    const observations:Row[] = [];
    if (traces.length) observations.push({code:'EXCEPTION_FILTERED_TRACES_FOUND',count:traces.length,source:'traces'});
    if (jobs.length) observations.push({code:'FAILED_JOBS_FOUND',count:jobs.length,source:'jobs'});
    if (sources.settings.status === 'ok' && sources.settings.data.traceSetting === 0) observations.push({code:'TRACE_LOGGING_DISABLED_NOW',source:'settings',historicalState:'unknown'});
    const limited = (source:Row) => source.data?.paging?.limited || source.data?.paging?.atLimit || source.data?.paging?.hasMore;
    const gaps = Object.entries(sources).filter(([_key,source]) => source.status !== 'ok' || limited(source))
      .map(([name,source]) => ({source:name,status:source.status,reason:source.reason ?? (limited(source) ? 'bounded_result' : 'read_incomplete')}));
    return {success:true,environment:this.environment,query:this.effective(args,'trace_createdon_and_job_completedon'),sources,links,observations,gaps,
      evidenceStatus:traces.length || jobs.length ? 'evidence_found' : 'no_matching_visible_failure_evidence',coverage:gaps.length ? 'partial' : 'bounded_window',
      rootCause:{status:'not_determined',reason:'Native references associate evidence; they do not establish the causal business failure.'},
      retentionAssessment:'unknown',
      note:'Current step configuration is not a historical snapshot. Empty/hidden/expired data cannot establish execution or deletion. No logging, permissions or configuration was changed.'};
  }); }

  async organization(reader:EvidenceReader):Promise<Row> {
    const identity = await reader.get('/WhoAmI');
    const id = rowGuid(identity.OrganizationId);
    const organization = await reader.get('/organizations(' + id + ')?$select=organizationid,plugintracelogsetting,isauditenabled');
    if (rowGuid(organization.organizationid) !== id) malformed();
    const traceSetting = [0,1,2].includes(organization.plugintracelogsetting) ? organization.plugintracelogsetting : null;
    return {organizationId:id,traceSetting,traceSettingName:traceSetting === 0 ? 'Off' : traceSetting === 1 ? 'Exception' : traceSetting === 2 ? 'All' : 'Unknown',
      auditEnabled:typeof organization.isauditenabled === 'boolean' ? organization.isauditenabled : null,checkedAt:this.now().toISOString()};
  }
  private effective(args:Row,timeField:string) {
    return {fromTime:args.from_time,toTime:args.to_time,timeField,correlationId:args.correlation_id ?? null,
      stepId:args.step_id ?? null,pluginTypeName:args.plugin_type_name ?? null,top:args.top,textIncluded:args.include_text};
  }
  private async traces(reader:EvidenceReader,args:Row):Promise<Row> {
    const conditions = ['createdon ge ' + args.from_time,'createdon le ' + args.to_time];
    if (args.correlation_id) conditions.push('correlationid eq ' + args.correlation_id);
    if (args.step_id) conditions.push('pluginstepid eq ' + args.step_id);
    if (args.plugin_type_name) conditions.push('typename eq ' + literal(args.plugin_type_name));
    if (args.exceptions_only) conditions.push("(exceptiondetails ne null and exceptiondetails ne '')");
    const textColumns = args.include_text ? ['exceptiondetails','messageblock'] : [];
    const page = await reader.list('/plugintracelogs?' + query({'$select':[...traceColumns,...textColumns].join(','),
      '$filter':conditions.join(' and '),'$orderby':'createdon desc,plugintracelogid asc','$top':String(args.top)}),args.top,args.max_pages);
    const items = page.rows.map((row:Row) => {
      rowGuid(row.plugintracelogid);
      for (const field of ['pluginstepid','correlationid']) if (row[field] != null) rowGuid(row[field]);
      const result = pick(row,traceColumns);
      result.plugintracelogid = rowGuid(row.plugintracelogid);
      for (const field of ['pluginstepid','correlationid']) if (row[field] != null) result[field] = rowGuid(row[field]);
      for (const field of textColumns) result[field] = cleanText(row[field],args.max_text_chars);
      return result;
    });
    return {status:items.length ? 'records_found' : 'no_matching_visible_records',items,count:items.length,paging:page.paging,
      textIncluded:args.include_text,exceptionsOnly:args.exceptions_only ?? false};
  }
  private async jobs(reader:EvidenceReader,args:Row,stepIds?:string[]):Promise<Row> {
    const conditions = ['statuscode eq 31','completedon ge ' + args.from_time,'completedon le ' + args.to_time];
    if (args.correlation_id) conditions.push('correlationid eq ' + args.correlation_id);
    if (args.step_id) conditions.push('_owningextensionid_value eq ' + args.step_id);
    else if (stepIds?.length) conditions.push('(' + stepIds.map(id => '_owningextensionid_value eq ' + guid(id,'step_id')).join(' or ') + ')');
    const textColumns = args.include_text ? ['message','friendlymessage'] : [];
    const page = await reader.list('/asyncoperations?' + query({'$select':[...jobColumns,...textColumns].join(','),
      '$filter':conditions.join(' and '),'$orderby':'completedon desc,asyncoperationid asc','$top':String(args.top)}),args.top,args.max_pages);
    const items = page.rows.map((row:Row) => {
      rowGuid(row.asyncoperationid);
      if (row.statuscode !== 31) malformed();
      if (row._owningextensionid_value != null) rowGuid(row._owningextensionid_value);
      const result = pick(row,jobColumns);
      result.asyncoperationid = rowGuid(row.asyncoperationid);
      if (row._owningextensionid_value != null) result._owningextensionid_value = rowGuid(row._owningextensionid_value);
      for (const field of textColumns) result[field] = cleanText(row[field],args.max_text_chars);
      return result;
    });
    return {status:items.length ? 'records_found' : 'no_matching_visible_records',items,count:items.length,paging:page.paging,textIncluded:args.include_text};
  }
}
