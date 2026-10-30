import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import { fixture,ids,env,trace,job,step,auditDetail,secret } from './evidence.fixture.mjs';
import { CrmRequestError,toolErrorPayload } from '../src/errors.ts';
import { EvidenceReader } from '../src/services/readEvidence.ts';
import { DiagnosticService } from '../src/services/diagnostics.ts';
import { SecurityEvidenceService } from '../src/services/securityEvidence.ts';
import { AuditEvidenceService } from '../src/services/auditEvidence.ts';
import { PluginStepService } from '../src/services/pluginStep.ts';
import { evidenceTools } from '../src/tools/evidenceTools.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { CacheService } from '../src/services/cache.ts';
import { readConfig } from '../src/config.ts';
import { handleToolCall,tools } from '../src/tool_handler.ts';

const target = {collection_name:'accounts',record_id:ids.account};
const params = endpoint => new URL(endpoint,'https://crm.invalid').searchParams;
async function failure(promise) {
  try { await promise; assert.fail('Expected an error'); } catch (error) {
    assert.ok(error instanceof CrmRequestError,error.stack);
    return toolErrorPayload(error);
  }
}

test('current trace/audit switches preserve actual false values and are never written', async () => {
  const f = fixture({traceSetting:0,auditEnabled:false,tableAuditEnabled:false});
  const result = await f.diagnostics.settings({collectionName:'accounts'});
  assert.equal(result.organization.data.traceSetting,0);
  assert.equal(result.organization.data.auditEnabled,false);
  assert.equal(result.table.data.auditEnabled,false);
  assert.equal(result.retentionAssessment,'unknown');
  assert.equal(f.calls.every(call => call.method === 'GET'),true);
});

test('inaccessible settings remain forbidden/unknown rather than being labeled disabled', async () => {
  const f = fixture({read:endpoint => {
    if (endpoint.startsWith('/organizations(')) throw new CrmRequestError('D365_HTTP_ERROR',secret,{status:403});
    return undefined;
  }});
  const result = await f.diagnostics.settings({});
  assert.equal(result.organization.status,'forbidden');
  assert.equal(result.organization.data,undefined);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('trace queries default to a fixed UTC day and exclude all configuration/profile/text columns', async () => {
  const f = fixture();
  const result = await f.diagnostics.traceLogs({});
  const query = params(f.calls[0].endpoint);
  assert.match(query.get('$filter'),/createdon ge 2026-10-25T06:00:00.000Z/);
  assert.match(query.get('$filter'),/createdon le 2026-10-26T06:00:00.000Z/);
  assert.equal(query.get('$select').includes('configuration'),false);
  assert.equal(query.get('$select').includes('messageblock'),false);
  assert.equal(result.items[0].configuration,undefined);
  assert.equal(result.items[0].exceptiondetails,undefined);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('trace exact filters are escaped and offset times are normalized without changing scope', async () => {
  const f = fixture();
  const result = await f.diagnostics.traceLogs({pluginTypeName:"Company.Test' or 'x",correlationId:ids.correlation,stepId:ids.step,
    fromTime:'2026-10-26T08:00:00+08:00',toTime:'2026-10-26T12:00:00+08:00',exceptionsOnly:true});
  const filter = params(f.calls[0].endpoint).get('$filter');
  assert.match(filter,/typename eq 'Company.Test'' or ''x'/);
  assert.match(filter,/pluginstepid eq/);
  assert.match(filter,/correlationid eq/);
  assert.match(filter,/exceptiondetails ne null/);
  assert.equal(result.query.fromTime,'2026-10-26T00:00:00.000Z');
});

test('optional text is bounded and common credential patterns are redacted; config columns stay excluded', async () => {
  const f = fixture({read:endpoint => endpoint.startsWith('/plugintracelogs?') ? {value:[{...trace,
    exceptiondetails:'password=not-for-output ' + 'x'.repeat(1000),messageblock:'Bearer not-for-output'}]} : undefined});
  const result = await f.diagnostics.traceLogs({includeText:true,maxTextChars:100});
  assert.equal(result.items[0].exceptiondetails.text.length,100);
  assert.equal(result.items[0].exceptiondetails.truncated,true);
  assert.equal(JSON.stringify(result).includes('not-for-output'),false);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('empty logs never become proof of log deletion or past logging configuration', async () => {
  for (const traceSetting of [0,2]) {
    const f = fixture({empty:true,traceSetting});
    const result = await f.diagnostics.traceLogs({});
    assert.equal(result.status,'no_matching_visible_records');
    assert.equal(result.retentionAssessment,'unknown');
    assert.equal(result.settings.data.traceSetting,traceSetting);
  }
});

test('failed jobs use native Failed status and completion time, without returning job data', async () => {
  const f = fixture();
  const result = await f.diagnostics.failedJobs({correlation_id:ids.correlation,step_id:ids.step});
  const filter = params(f.calls[0].endpoint).get('$filter');
  assert.match(filter,/statuscode eq 31/);
  assert.match(filter,/completedon ge/);
  assert.equal(filter.includes('createdon ge'),false);
  assert.match(filter,/_owningextensionid_value eq/);
  assert.equal(result.items[0].data,undefined);
  assert.equal(result.items[0].message,undefined);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('native list paging honors caps and reports a full top as bounded, not an inventory', async () => {
  const next = env.orgUrl + '/api/data/v9.1/plugintracelogs?skiptoken=2';
  const f = fixture({read:endpoint => endpoint.startsWith('/plugintracelogs?') ? {value:[trace],'@odata.nextLink':next}
    : endpoint === next ? {value:[{...trace,plugintracelogid:ids.audit}]} : undefined});
  const result = await f.diagnostics.traceLogs({top:2});
  assert.equal(result.items.length,2);
  assert.equal(result.paging.atLimit,true);
  assert.equal(result.paging.limited,true);
});

test('external/cyclic links and oversized native pages are rejected before another unsafe read', async () => {
  for (const mode of ['external','cycle','oversized']) {
    const f = fixture({read:endpoint => endpoint.startsWith('/plugintracelogs?') ? mode === 'oversized' ? {value:[trace,trace]}
      : {value:[],'@odata.nextLink':mode === 'external' ? 'https://evil.invalid/api/data/v9.1/plugintracelogs' : endpoint} : undefined});
    const result = await failure(f.diagnostics.traceLogs({top:1}));
    assert.ok(['D365_ENDPOINT_INVALID','D365_READ_RESPONSE_INVALID'].includes(result.code));
    assert.equal(f.calls.some(call => call.endpoint.startsWith('https://evil.invalid')),false);
  }
});

test('a page budget stops native traversal with explicit incompleteness', async () => {
  const f = fixture({read:endpoint => endpoint.startsWith('/plugintracelogs?') ? {value:[trace],
    '@odata.nextLink':env.orgUrl + '/api/data/v9.1/plugintracelogs?next=2'} : undefined});
  const result = await f.diagnostics.traceLogs({top:5,maxPages:1});
  assert.equal(result.paging.hasMore,true);
  assert.equal(result.paging.stoppedBecause,'max_pages');
});

test('401 remains an authentication error while standalone 403 is an explicit forbidden tool error', async () => {
  for (const status of [401,403]) {
    const f = fixture({read:() => { throw new CrmRequestError('D365_HTTP_ERROR',secret,{status}); }});
    const error = await failure(f.diagnostics.traceLogs({}));
    assert.equal(error.status,status);
    assert.equal(error.code,status === 403 ? 'D365_READ_FORBIDDEN' : 'D365_HTTP_ERROR');
    assert.equal(JSON.stringify(error).includes(secret),false);
    assert.equal(f.calls.length,1);
  }
});

test('diagnostic reports link native trace/job step IDs and never assert a root cause', async () => {
  const f = fixture();
  const result = await f.diagnostics.diagnose({correlation_id:ids.correlation});
  assert.equal(result.sources.traces.status,'ok');
  assert.equal(result.sources.steps.data.items[0].stepId,ids.step);
  assert.ok(result.links.some(link => link.basis === 'native_pluginstepid' && link.currentStepFound));
  assert.ok(result.links.some(link => link.basis === 'native_owningextensionid' && link.currentStepFound));
  assert.equal(result.rootCause.status,'not_determined');
  assert.equal(result.evidenceStatus,'evidence_found');
  assert.equal(JSON.stringify(result).includes(secret),false);
  const stepRead = f.calls.find(call => call.endpoint.startsWith('/sdkmessageprocessingsteps?'));
  assert.equal(params(stepRead.endpoint).get('$select').split(',').includes('configuration'),false);
  assert.equal(params(stepRead.endpoint).get('$expand').includes('secureconfig'),false);
});

test('plugin-type diagnostic jobs are restricted to verified step IDs even with a correlation filter', async () => {
  const f = fixture();
  await f.diagnostics.diagnose({plugin_type_name:'Company.Test',correlation_id:ids.correlation});
  const jobs = f.calls.find(call => call.endpoint.startsWith('/asyncoperations?'));
  const filter = params(jobs.endpoint).get('$filter');
  assert.match(filter,/_owningextensionid_value eq/);
  assert.match(filter,/correlationid eq/);
});

test('GUID casing does not break a native trace-to-current-step evidence link', async () => {
  const f = fixture({read:endpoint => endpoint.startsWith('/plugintracelogs?') ? {value:[{...trace,pluginstepid:ids.type.toUpperCase()}]}
    : endpoint.startsWith('/sdkmessageprocessingsteps?') ? {value:[{...step,sdkmessageprocessingstepid:ids.type}]} : undefined});
  const result = await f.diagnostics.diagnose({correlation_id:ids.correlation});
  const link = result.links.find(item => item.basis === 'native_pluginstepid');
  assert.equal(link.stepId,ids.type);
  assert.equal(link.currentStepFound,true);
});

test('a capped current-step lookup is a coverage gap and cannot trigger a falsely complete job search', async () => {
  const f = fixture({read:endpoint => endpoint.startsWith('/plugintracelogs?') ? {value:[]}
    : endpoint.startsWith('/sdkmessageprocessingsteps?') ? {value:Array.from({length:100},(_unused,index) => ({...step,
      sdkmessageprocessingstepid:index.toString(16).padStart(8,'0') + '-1111-1111-1111-111111111111'}))} : undefined});
  const result = await f.diagnostics.diagnose({plugin_type_name:'Company.Test'});
  assert.equal(result.sources.jobs.status,'not_queried');
  assert.equal(result.sources.jobs.reason,'step_lookup_limited');
  assert.ok(result.gaps.some(item => item.source === 'steps' && item.reason === 'bounded_result'));
  assert.equal(f.calls.some(call => call.endpoint.startsWith('/asyncoperations?')),false);
});

test('a user-supplied step ID does not establish a mismatching plugin class for a job query', async () => {
  const f = fixture({empty:true});
  const result = await f.diagnostics.diagnose({plugin_type_name:'Company.Other',step_id:ids.step});
  assert.equal(result.sources.jobs.status,'not_queried');
  assert.equal(result.sources.jobs.reason,'no_verified_step_ids');
  assert.equal(f.calls.some(call => call.endpoint.startsWith('/asyncoperations?')),false);
});

test('partial diagnostics preserve forbidden/missing sources instead of treating them as empty success', async () => {
  const f = fixture({read:endpoint => {
    if (endpoint.startsWith('/plugintracelogs?')) throw new CrmRequestError('D365_HTTP_ERROR',secret,{status:403});
    if (endpoint.startsWith('/sdkmessageprocessingsteps?')) throw new CrmRequestError('D365_HTTP_ERROR',secret,{status:404});
    return undefined;
  }});
  const result = await f.diagnostics.diagnose({step_id:ids.step});
  assert.equal(result.sources.traces.status,'forbidden');
  assert.equal(result.sources.steps.status,'unavailable_or_hidden');
  assert.equal(result.sources.jobs.status,'ok');
  assert.equal(result.coverage,'partial');
  assert.ok(result.gaps.length >= 2);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('no matching evidence keeps execution/deletion/history unknown and does not query all jobs by class', async () => {
  const f = fixture({empty:true,traceSetting:0});
  const result = await f.diagnostics.diagnose({pluginTypeName:'Company.Missing'});
  assert.equal(result.evidenceStatus,'no_matching_visible_failure_evidence');
  assert.equal(result.sources.jobs.status,'not_queried');
  assert.equal(result.retentionAssessment,'unknown');
  assert.equal(result.observations[0].code,'TRACE_LOGGING_DISABLED_NOW');
  assert.equal(result.observations[0].historicalState,'unknown');
  assert.equal(f.calls.some(call => call.endpoint.startsWith('/asyncoperations?')),false);
});

test('security catalogs preserve disabled users by default and escape exact query inputs', async () => {
  const f = fixture();
  await f.security.principals({nameKeyword:"O'Brien",businessUnitId:ids.org});
  const filter = params(f.calls[0].endpoint).get('$filter');
  assert.equal(filter.includes('isdisabled'),false);
  assert.match(filter,/O''Brien/);
  await f.security.principals({enabled:false});
  assert.match(params(f.calls[1].endpoint).get('$filter'),/isdisabled eq true/);
  for (const principal_type of ['team','role']) assert.equal((await f.security.principals({principal_type})).items.length,1);
});

test('principal context reads direct roles and visible team roles without inventing effective access', async () => {
  const f = fixture();
  const result = await f.security.context({});
  assert.equal(result.principalId,ids.user);
  assert.equal(result.directRoles.data.items[0].roleid,ids.role);
  assert.equal(result.teams.data.items[0].teamid,ids.team);
  assert.equal(result.teamRoles[0].data.items[0].roleid,ids.role);
  assert.equal(result.effectiveAccess,'not_calculated');
  assert.equal(f.calls.every(call => call.method === 'GET'),true);
});

test('team context and partial security sources stay distinct from an empty role list', async () => {
  const f = fixture({read:endpoint => {
    if (endpoint.includes('teamroles_association')) throw new CrmRequestError('D365_HTTP_ERROR',secret,{status:403});
    return undefined;
  }});
  const result = await f.security.context({principalType:'team',principalId:ids.team});
  assert.equal(result.directRoles.status,'forbidden');
  assert.equal(result.coverage,'partial');
  assert.equal(result.teams,null);
  assert.equal(result.effectiveAccess,'not_calculated');
});

test('bounded role/team catalogs advertise partial coverage rather than all inherited privileges', async () => {
  const result = await fixture().security.context({team_limit:1,role_limit:1});
  assert.equal(result.coverage,'partial');
  assert.equal(result.teams.data.paging.atLimit,true);
  assert.equal(result.directRoles.data.paging.atLimit,true);
});

test('native principal access uses a bound function with a correctly encoded record reference', async () => {
  const f = fixture();
  const result = await f.security.access(target);
  assert.deepEqual(result.rights,['ReadAccess','WriteAccess']);
  assert.equal(result.reasonForRights,'not_explained');
  const endpoint = f.calls.at(-1).endpoint;
  assert.match(endpoint,/systemusers\(.+\)\/Microsoft.Dynamics.CRM.RetrievePrincipalAccess/);
  assert.deepEqual(JSON.parse(params(endpoint).get('@target')),{'@odata.id':`accounts(${ids.account})`});
});

test('native None is different from access-check failure and unknown numeric rights are retained', async () => {
  assert.deepEqual((await fixture({rights:'None'}).security.access(target)).rights,[]);
  const unknown = await fixture({rights:9}).security.access(target);
  assert.deepEqual(unknown.rights,['ReadAccess']);
  assert.equal(unknown.unknownBits,8);
  const f = fixture({read:endpoint => {
    if (endpoint.includes('RetrievePrincipalAccess')) throw new CrmRequestError('D365_HTTP_ERROR',secret,{status:403});
    return undefined;
  }});
  const error = await failure(f.security.access(target));
  assert.equal(error.code,'D365_READ_FORBIDDEN');
  assert.equal(error.data.rights,undefined);
});

test('CRM 9.1 audit history accepts a declared base AuditDetail without a type annotation',async()=>{
  const detail={AuditRecord:{'@odata.type':'#Microsoft.Dynamics.CRM.audit',auditid:ids.audit,operation:2,action:2,_userid_value:ids.user}};
  const f=fixture({read:endpoint=>endpoint.startsWith('/RetrieveRecordChangeHistory')?{AuditDetailCollection:{AuditDetails:[detail],MoreRecords:true,PagingCookie:null}}:undefined});
  const result=await f.audit.history({...target,page_size:1});
  assert.equal(result.items[0].detailType,'#Microsoft.Dynamics.CRM.AuditDetail');assert.equal(result.items[0].auditRecord.auditid,ids.audit);
  assert.equal(result.items[0].metadataStatus,'returned');assert.equal(result.items[0].changedFields,undefined);assert.equal(result.valuesIncluded,false);
  assert.equal(result.paging.hasMore,true);assert.equal(result.paging.canContinue,false);assert.equal(result.paging.continuationIssue,'cookie_missing_or_over_limit');
});

test('CRM 9.1 single audit detail accepts a declared base shape and retains audit identity checks',async()=>{
  const f=fixture({detail:{AuditRecord:{auditid:ids.audit,operation:2}}});const result=await f.audit.details({audit_id:ids.audit});
  assert.equal(result.detail.detailType,'#Microsoft.Dynamics.CRM.AuditDetail');assert.equal(result.detail.auditRecord.auditid,ids.audit);assert.equal(result.valuesIncluded,false);
  await assert.rejects(fixture({detail:{AuditRecord:{auditid:ids.user}}}).audit.details({audit_id:ids.audit}),{code:'D365_READ_RESPONSE_INVALID'});
});

test('typeless derived or ambiguous audit objects are not silently treated as base details',async()=>{
  for(const detail of [{},{AuditRecord:null},{AuditRecord:{}},{AuditRecord:{auditid:ids.audit},OldValue:{}},{AuditRecord:{auditid:ids.audit},NewValue:{}},{AuditRecord:{auditid:ids.audit},unexpected:true}]){
    await assert.rejects(fixture({detail}).audit.details({audit_id:ids.audit}),{code:'D365_READ_RESPONSE_INVALID'});
  }
});

test('an explicit invalid audit type never falls back to the declared base type',async()=>{
  for(const type of [null,'',false,'#Other.AuditDetail'])await assert.rejects(fixture({detail:{'@odata.type':type,AuditRecord:{auditid:ids.audit}}}).audit.details({audit_id:ids.audit}),{code:'D365_READ_RESPONSE_INVALID'});
});

test('audit history uses the native function and withholds values and missing actor/time metadata', async () => {
  const f = fixture();
  const result = await f.audit.history(target);
  const endpoint = f.calls[0].endpoint;
  assert.match(endpoint,/^\/RetrieveRecordChangeHistory\(Target=@target,PagingInfo=@paginginfo\)/);
  assert.deepEqual(JSON.parse(params(endpoint).get('@target')),{'@odata.id':`accounts(${ids.account})`});
  assert.equal(JSON.parse(params(endpoint).get('@paginginfo')).Count,20);
  assert.equal(result.items[0].auditRecord,null);
  assert.equal(result.items[0].metadataStatus,'not_returned_by_native_function');
  assert.deepEqual(result.items[0].changedFields,['name','new_secret']);
  assert.equal(result.items[0].oldValue,undefined);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('explicit audit values project attribute changes and mask sensitive field names', async () => {
  const result = await fixture().audit.history({...target,includeValues:true});
  assert.equal(result.items[0].oldValue.name,'Before');
  assert.equal(result.items[0].newValue.name,'After');
  assert.equal(result.items[0].newValue.new_secret,'[REDACTED]');
  assert.equal(result.items[0].newValue['@odata.type'],undefined);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('native audit paging cookies round-trip once as opaque JSON values', async () => {
  const cookie = '<cookie page="1"><x value="&quot;a&amp;b&quot;"/></cookie>';
  const f = fixture({moreRecords:true,pagingCookie:cookie});
  const first = await f.audit.history(target);
  assert.equal(first.paging.hasMore,true);
  assert.equal(first.paging.next.paging_cookie,cookie);
  await f.audit.history({...target,page_number:2,paging_cookie:cookie});
  const requests = f.calls.filter(call => call.endpoint.startsWith('/RetrieveRecordChangeHistory'));
  const paging = JSON.parse(params(requests[1].endpoint).get('@paginginfo'));
  assert.equal(paging.PagingCookie,cookie);
  assert.equal(paging.PageNumber,2);
});

test('missing/repeated/oversized cookies and page limits never advertise unusable audit continuations', async () => {
  const missing = await fixture({moreRecords:true}).audit.history(target);
  assert.equal(missing.paging.canContinue,false);
  assert.equal(missing.paging.next,null);
  const oversized = await fixture({moreRecords:true,pagingCookie:'x'.repeat(16385)}).audit.history(target);
  assert.equal(oversized.paging.canContinue,false);
  const repeated = await fixture({moreRecords:true,pagingCookie:'same'}).audit.history({...target,page_number:2,paging_cookie:'same'});
  assert.equal(repeated.paging.continuationIssue,'cookie_repeated');
  const last = await fixture({moreRecords:true,pagingCookie:'next'}).audit.history({...target,page_number:1000,paging_cookie:'prior'});
  assert.equal(last.paging.continuationIssue,'page_limit');
  assert.equal(last.paging.next,null);
});

test('current auditing disabled, no history, and forbidden history are separate evidence states', async () => {
  const f = fixture({auditEnabled:false,tableAuditEnabled:false});
  const historical = await f.audit.history(target);
  assert.equal(historical.items.length,1);
  assert.equal(historical.settings.organization.data.auditEnabled,false);
  const empty = await fixture({empty:true}).audit.history(target);
  assert.equal(empty.status,'no_matching_visible_history');
  assert.equal(empty.retentionAssessment,'unknown');
  const forbidden = fixture({read:() => { throw new CrmRequestError('D365_HTTP_ERROR',secret,{status:403}); }});
  assert.equal((await failure(forbidden.audit.history(target))).code,'D365_READ_FORBIDDEN');
});

test('audit details separate successful native detail retrieval from forbidden audit summary privileges', async () => {
  const f = fixture({read:endpoint => {
    if (endpoint.startsWith('/audits(') && !endpoint.includes('RetrieveAuditDetails')) throw new CrmRequestError('D365_HTTP_ERROR',secret,{status:403});
    return undefined;
  }});
  const result = await f.audit.details({auditId:ids.audit});
  assert.equal(result.detail.detailType,'#Microsoft.Dynamics.CRM.AttributeAuditDetail');
  assert.equal(result.metadata.status,'forbidden');
  assert.equal(result.detail.auditRecord,null);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('unsupported audit detail types are identified without inventing or dumping their fields', async () => {
  const result = await fixture({detail:{'@odata.type':'#Microsoft.Dynamics.CRM.RolePrivilegeAuditDetail',secretData:secret}}).audit.details({audit_id:ids.audit,include_values:true});
  assert.equal(result.detail.detailFields,'not_projected_for_this_detail_type');
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('foreign audit metadata is rejected rather than silently attached to the requested ID', async () => {
  const f = fixture({detail:{...auditDetail,AuditRecord:{auditid:ids.type}}});
  assert.equal((await failure(f.audit.details({audit_id:ids.audit}))).code,'D365_READ_RESPONSE_INVALID');
  assert.equal(f.calls.length,1);
});

test('large explicit audit projections hit a bounded result error without dumping their values', async () => {
  const values = Object.fromEntries(Array.from({length:50},(_unused,index) => ['field' + index,'x'.repeat(6000)]));
  const detail = {...auditDetail,OldValue:values,NewValue:values};
  const f = fixture({read:endpoint => endpoint.startsWith('/RetrieveRecordChangeHistory')
    ? {AuditDetailCollection:{AuditDetails:Array(10).fill(detail),MoreRecords:false,PagingCookie:null}} : undefined});
  const error = await failure(f.audit.history({...target,include_values:true,max_text_chars:8000}));
  assert.equal(error.code,'D365_READ_RESULT_LIMIT');
  assert.ok(JSON.stringify(error).length < 1000);
});

test('malformed native schemas do not become empty logs, no access, or complete audit history', async () => {
  for (const value of [null,{}, {value:42}, {value:[null]}]) {
    const f = fixture({read:() => value});
    assert.equal((await failure(f.diagnostics.traceLogs({}))).code,'D365_READ_RESPONSE_INVALID');
  }
  const badRights = fixture({rights:'UnexpectedGrant'});
  assert.equal((await failure(badRights.security.access(target))).code,'D365_READ_RESPONSE_INVALID');
  const badAudit = fixture({read:endpoint => endpoint.startsWith('/RetrieveRecordChangeHistory') ? {AuditDetailCollection:{AuditDetails:[],MoreRecords:'false'}} : undefined});
  assert.equal((await failure(badAudit.audit.history(target))).code,'D365_READ_RESPONSE_INVALID');
});

test('invalid read parameters and alias conflicts are rejected before native reads', async () => {
  const f = fixture();
  for (const args of [{correlation_id:'bad'},{step_id:'bad'},{top:0},{include_text:'true'},
    {from_time:'2026-02-31T00:00:00Z'},{to_time:'2026-10-26T00:00:00'},
    {from_time:'2026-10-27T00:00:00Z',to_time:'2026-10-26T00:00:00Z'},
    {plugin_type_name:'a',pluginTypeName:'b'},{unknown:true}]) await assert.rejects(f.diagnostics.traceLogs(args),{code:'D365_READ_INVALID'});
  await assert.rejects(f.diagnostics.diagnose({}),{code:'D365_READ_INVALID'});
  await assert.rejects(f.security.context({principal_type:'team'}),{code:'D365_READ_INVALID'});
  await assert.rejects(f.security.principals({principal_type:'team',enabled:true}),{code:'D365_READ_INVALID'});
  await assert.rejects(f.security.access({...target,principal_type:'team'}),{code:'D365_READ_INVALID'});
  await assert.rejects(f.audit.history({...target,page_number:2}),{code:'D365_READ_INVALID'});
  await assert.rejects(f.audit.history({...target,paging_cookie:'x'}),{code:'D365_READ_INVALID'});
  assert.equal(f.calls.length,0);
});

test('read cancellation propagates to native requests and never changes logging or permissions', async () => {
  const controller = new AbortController(); controller.abort();
  const f = fixture();
  assert.equal((await failure(f.diagnostics.traceLogs({},controller.signal))).code,'D365_REQUEST_ABORTED');
  assert.equal(f.calls.length,0);
  const live = new AbortController();
  await f.diagnostics.traceLogs({},live.signal);
  assert.equal(f.calls.every(call => call.options.signal === live.signal),true);
  assert.equal(f.calls.every(call => call.method === 'GET'),true);
});

test('all nine read-only schemas compile, accept aliases and are registered exactly once', () => {
  const ajv = new Ajv({strict:false,useDefaults:true});
  const examples = {get_diagnostic_settings:{},query_plugin_trace_logs:{pluginTypeName:'Company.Test'},query_failed_system_jobs:{},
    diagnose_plugin_failure:{correlationId:ids.correlation},query_security_principals:{principalType:'role'},get_principal_security_context:{},
    get_record_access:{collectionName:'accounts',recordId:ids.account},get_record_audit_history:target,get_audit_details:{auditId:ids.audit}};
  for (const tool of evidenceTools) {
    assert.equal(tool.annotations.readOnlyHint,true);
    const validate = ajv.compile(tool.inputSchema);
    assert.equal(validate(examples[tool.name]),true,JSON.stringify(validate.errors));
    assert.equal(validate({unknown:true}),false);
    assert.equal(tools.filter(item => item.name === tool.name).length,1);
  }
});

test('MCP routes all nine tools through the configured read-only client', async t => {
  const f = fixture();
  const settings = {AUTH_TYPE:'online',ORG_URL:env.orgUrl,ENVIRONMENT_URL:env.orgUrl,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]]));
  t.mock.method(D365AuthService.prototype,'makeRequest',(...args) => f.client.makeRequest(...args));
  Object.assign(process.env,settings);
  try {
    for (const [name,args] of Object.entries({get_diagnostic_settings:{},query_plugin_trace_logs:{},query_failed_system_jobs:{},
      diagnose_plugin_failure:{step_id:ids.step},query_security_principals:{},get_principal_security_context:{},
      get_record_access:target,get_record_audit_history:target,get_audit_details:{audit_id:ids.audit}})) {
      assert.equal((await handleToolCall(name,args)).success,true);
    }
    assert.equal(f.calls.every(call => call.method === 'GET'),true);
  } finally {
    for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('Online, NTLM and IFD use native GET functions/log queries through the actual auth/request layer', async t => {
  t.mock.method(axios,'post',async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const authType of ['online','op_ad','op_ifd']) {
    CacheService.flushExisting();
    const config = readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
      AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
    const client = new D365AuthService(config),f = fixture();
    client.getAxiosInstance().defaults.adapter = async config => {
      const url = new URL(config.url),endpoint = url.pathname.replace('/Demo/api/data/v9.1','') + url.search;
      assert.equal(config.method.toUpperCase(),'GET');
      const data = await f.client.makeRequest(endpoint,'GET');
      return {config,status:200,statusText:'OK',data,headers:new AxiosHeaders()};
    };
    const diagnostics = new DiagnosticService(client,{...env,authType},new PluginStepService(client,env));
    assert.equal((await diagnostics.traceLogs({})).items.length,1);
    assert.deepEqual((await new SecurityEvidenceService(client).access(target)).rights,['ReadAccess','WriteAccess']);
    assert.equal((await new AuditEvidenceService(client,diagnostics).history(target)).items.length,1);
    assert.equal(f.calls.every(call => call.method === 'GET'),true);
  }
});
