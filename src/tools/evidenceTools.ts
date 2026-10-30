import { aliases } from '../services/readEvidence.js';

type Schema = Record<string,any>;
const id = {type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'};
const identifier = {type:'string',pattern:'^[a-zA-Z_][a-zA-Z0-9_]*$'};
const text = {type:'string',minLength:1,maxLength:500};
function fields(properties:Schema):Schema {
  const result = {...properties};
  for (const [camel,snake] of Object.entries(aliases)) if (properties[snake]) result[camel] = {...properties[snake],
    'x-alias-for':snake,description:'Compatibility alias for ' + snake + '; conflicting values are rejected.'};
  return result;
}
const requireAny = (...names:string[]) => ({anyOf:names.flatMap(name => [{required:[name]},
  ...Object.entries(aliases).filter(([_camel,snake]) => snake === name).map(([camel]) => ({required:[camel]}))])});
function schema(properties:Schema,allOf:Schema[] = []) { return {type:'object',additionalProperties:false,properties:fields(properties),...(allOf.length ? {allOf} : {})}; }
const paging = {top:{type:'integer',minimum:1,maximum:100,description:'Maximum visible rows, default 50. Reaching this bound is not a complete inventory.'},
  max_pages:{type:'integer',minimum:1,maximum:20,description:'Maximum native pages, default 5. Bounded reads report incompleteness.'}};
const textInclusion = {include_text:{type:'boolean',description:'Default false. Opt in to trace/exception/job message text, which can contain business data. Secure/unsecure configuration columns are never selected.'},
  max_text_chars:{type:'integer',minimum:100,maximum:8000,description:'Per-text preview limit, default 2000; truncation is explicit.'}};
const time = {from_time:{type:'string',description:'ISO timestamp with explicit timezone, inclusive. Default 24 hours before to_time.'},
  to_time:{type:'string',description:'ISO timestamp with explicit timezone, inclusive. Default current UTC time.'}};
const anchors = {correlation_id:id,step_id:id};
const logs = {...time,...anchors,...paging,...textInclusion};
const principal = {principal_type:{enum:['systemuser','team'],description:'Default systemuser. Without a systemuser ID, inspects the current authenticated user.'},principal_id:id};
const target = {collection_name:identifier,record_id:id};
const values = {include_values:{type:'boolean',description:'Default false. Native audit values are received but withheld from output. Explicit true projects bounded attribute old/new values with heuristic sensitive-field masking.'},
  max_text_chars:textInclusion.max_text_chars};
const annotations = {readOnlyHint:true,destructiveHint:false};
export const evidenceTools = [
  {name:'get_diagnostic_settings',description:'Read current organization trace/audit switches and optional table audit metadata. Reports forbidden/unavailable/unknown evidence separately; current switches do not prove historical settings or deleted logs. Does not enable logging or auditing.',
    inputSchema:schema({collection_name:identifier}),annotations},
  {name:'query_plugin_trace_logs',description:'Read bounded native plugin trace rows by time, correlation ID, step and exact plugin type. Default excludes message/exception text; configuration and secureconfiguration are always excluded. Empty results do not prove no execution, disabled logging or log deletion.',
    inputSchema:schema({...logs,plugin_type_name:text,exceptions_only:{type:'boolean',description:'Only rows with nonempty native exceptiondetails; default false.'}}),annotations},
  {name:'query_failed_system_jobs',description:'Read native failed system jobs (statuscode 31) using completion-time bounds and optional correlation/owning step IDs. Excludes job data/configuration and message text by default. Does not retry, cancel or change jobs.',
    inputSchema:schema(logs),annotations},
  {name:'diagnose_plugin_failure',description:'Build a read-only evidence report from exception-filtered traces, failed jobs and current plugin steps, anchored by correlation, step or plugin type. Uses native IDs for links, reports missing/forbidden/limited sources and keeps root cause undetermined. Current step state is not historical configuration.',
    inputSchema:schema({...logs,plugin_type_name:text},[requireAny('correlation_id','step_id','plugin_type_name')]),annotations},
  {name:'query_security_principals',description:'Read bounded visible users, teams or roles with optional ID/name/business-unit filters. Disabled users are included unless enabled is explicit. Catalog entries do not imply effective record permissions.',
    inputSchema:schema({principal_type:{enum:['systemuser','team','role'],description:'Default systemuser.'},principal_id:id,
      name_keyword:text,business_unit_id:id,enabled:{type:'boolean',description:'Only systemuser: explicit enabled/disabled filter.'},...paging}),annotations},
  {name:'get_principal_security_context',description:'Read a user/team profile, direct roles and bounded visible team memberships/roles. Preserves partial/forbidden sources and business-unit role identities. Does not reconstruct all inherited/group/shared/field privileges; use get_record_access for native record rights.',
    inputSchema:schema({...principal,include_team_roles:{type:'boolean',description:'Read roles for visible user teams, default true.'},
      team_limit:{type:'integer',minimum:1,maximum:25,description:'Maximum visible teams, default 10.'},
      role_limit:{type:'integer',minimum:1,maximum:100,description:'Maximum role rows per direct/team source, default 50.'}}),annotations},
  {name:'get_record_access',description:'Use native bound RetrievePrincipalAccess for the specified principal and record. Returns effective record rights without inventing why they were granted or claiming field/business-rule access. Does not change permissions.',
    inputSchema:schema({...target,principal_type:{enum:['systemuser','team','organization'],description:'Default current systemuser; team/organization require principal_id.'},principal_id:id},
      [requireAny('collection_name'),requireAny('record_id')]),annotations},
  {name:'get_record_audit_history',description:'Read one native RetrieveRecordChangeHistory page. Default withholds attribute values. Preserves MoreRecords/cookie and current audit-setting evidence; no actor/time/ID is invented if native AuditRecord is absent. Empty history does not prove logs were deleted or auditing was disabled.',
    inputSchema:schema({...target,...values,page_size:{type:'integer',minimum:1,maximum:100,description:'Native audit detail count, default 20.'},
      page_number:{type:'integer',minimum:1,maximum:1000,description:'Default 1; later pages require the previous native paging_cookie.'},
      paging_cookie:{type:'string',minLength:1,description:'Native cookie from this same target/page size; maximum 16 KiB UTF-8. No cookie is invented.'}},
      [requireAny('collection_name'),requireAny('record_id')]),annotations},
  {name:'get_audit_details',description:'Read native bound RetrieveAuditDetails and independent audit summary metadata. Attribute audit old/new values are opt-in and bounded; other detail types are named without fabricating unsupported fields. Detail and summary permissions are reported separately.',
    inputSchema:schema({audit_id:id,...values},[requireAny('audit_id')]),annotations},
];
