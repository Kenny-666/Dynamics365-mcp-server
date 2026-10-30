import { CrmRequestError } from '../src/errors.ts';
import { DiagnosticService } from '../src/services/diagnostics.ts';
import { SecurityEvidenceService } from '../src/services/securityEvidence.ts';
import { AuditEvidenceService } from '../src/services/auditEvidence.ts';
import { PluginStepService } from '../src/services/pluginStep.ts';

export const ids = {user:'11111111-1111-1111-1111-111111111111',org:'22222222-2222-2222-2222-222222222222',
  step:'33333333-3333-3333-3333-333333333333',correlation:'44444444-4444-4444-4444-444444444444',
  trace:'55555555-5555-5555-5555-555555555555',job:'66666666-6666-6666-6666-666666666666',
  role:'77777777-7777-7777-7777-777777777777',team:'88888888-8888-8888-8888-888888888888',
  account:'99999999-9999-9999-9999-999999999999',audit:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  type:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
export const env = {orgUrl:'https://crm.invalid/Demo',authType:'online',apiVersion:'v9.1'};
export const now = () => new Date('2026-10-26T06:00:00.000Z');
export const secret = 'configured-secret-must-not-appear';
export const trace = {plugintracelogid:ids.trace,createdon:'2026-10-26T01:00:00Z',correlationid:ids.correlation,
  pluginstepid:ids.step,typename:'Company.Test',messagename:'Update',primaryentity:'account',mode:0,operationtype:1,depth:1,
  configuration:secret,secureconfiguration:secret,profile:secret,exceptiondetails:'failure password=hidden-value',messageblock:'Bearer hidden-token'};
export const job = {asyncoperationid:ids.job,name:'Failed plugin',createdon:'2026-10-20T00:00:00Z',completedon:'2026-10-26T01:00:00Z',
  correlationid:ids.correlation,_owningextensionid_value:ids.step,statuscode:31,statecode:3,operationtype:1,errorcode:-1,
  data:secret,dependencytoken:secret,message:'error password=hidden-value',friendlymessage:'friendly'};
export const step = {sdkmessageprocessingstepid:ids.step,name:'Current step',stage:20,mode:0,rank:1,statecode:0,
  _eventhandler_value:ids.type,_sdkmessageid_value:ids.type,eventhandler_plugintype:{plugintypeid:ids.type,typename:'Company.Test'},
  sdkmessageid:{name:'Update'},configuration:secret,sdkmessageprocessingstepsecureconfigid:{secureconfig:secret}};
export const auditDetail = {'@odata.type':'#Microsoft.Dynamics.CRM.AttributeAuditDetail',
  OldValue:{'@odata.type':'#Microsoft.Dynamics.CRM.account',name:'Before',new_secret:secret},
  NewValue:{'@odata.type':'#Microsoft.Dynamics.CRM.account',name:'After',new_secret:secret},DeletedAttributes:{Keys:[]}};

export function fixture(options = {}) {
  const calls = [];
  const base = env.orgUrl + '/api/data/v9.1/';
  const client = {
    validateEndpoint(endpoint) {
      if (!endpoint || endpoint.startsWith('//') || endpoint.includes('\\')) throw new CrmRequestError('D365_ENDPOINT_INVALID','outside API');
      const url = new URL(endpoint.replace(/^\//,''),base);
      if (url.origin !== new URL(base).origin || !url.pathname.startsWith(new URL(base).pathname) || url.hash || url.username || url.password) throw new CrmRequestError('D365_ENDPOINT_INVALID','outside API');
      return url.href;
    },
    async makeRequest(endpoint,method = 'GET',data,requestOptions = {}) {
      calls.push({endpoint,method,data,options:requestOptions});
      if (method !== 'GET') throw new Error('Unexpected write in read-only evidence test');
      if (requestOptions.signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled');
      if (options.read) { const custom = await options.read(endpoint,calls); if (custom !== undefined) return custom; }
      const url = new URL(client.validateEndpoint(endpoint));
      const path = url.pathname.replace('/Demo/api/data/v9.1','');
      if (path === '/WhoAmI') return {UserId:ids.user,OrganizationId:ids.org};
      if (path.startsWith('/organizations(')) return {organizationid:ids.org,plugintracelogsetting:options.traceSetting ?? 2,isauditenabled:options.auditEnabled ?? true};
      if (path === '/EntityDefinitions') return {value:[{LogicalName:'account',EntitySetName:'accounts',PrimaryIdAttribute:'accountid',IsAuditEnabled:{Value:options.tableAuditEnabled ?? true}}]};
      if (path === '/plugintracelogs') return {value:options.empty ? [] : [structuredClone(trace)]};
      if (path === '/asyncoperations') return {value:options.empty ? [] : [structuredClone(job)]};
      if (path === '/sdkmessageprocessingsteps') return {value:options.empty ? [] : [structuredClone(step)]};
      if (path.includes('/Microsoft.Dynamics.CRM.RetrievePrincipalAccess')) return {AccessRights:options.rights ?? 'ReadAccess, WriteAccess'};
      if (path.startsWith('/RetrieveRecordChangeHistory')) return {AuditDetailCollection:{AuditDetails:options.empty ? [] : [structuredClone(auditDetail)],
        MoreRecords:options.moreRecords ?? false,PagingCookie:options.pagingCookie ?? null}};
      if (path.includes('/Microsoft.Dynamics.CRM.RetrieveAuditDetails')) return {AuditDetail:structuredClone(options.detail ?? auditDetail)};
      if (path.startsWith('/audits(')) return {auditid:ids.audit,createdon:'2026-10-26T01:00:00Z',operation:2,action:2,_userid_value:ids.user};
      if (path.includes('/systemuserroles_association') || path.includes('/teamroles_association')) return {value:[{roleid:ids.role,name:'Role',_businessunitid_value:ids.org}]};
      if (path.includes('/teammembership_association')) return {value:[{teamid:ids.team,name:'Team',teamtype:0,_businessunitid_value:ids.org}]};
      if (path === '/systemusers') return {value:[{systemuserid:ids.user,fullname:'Test User',isdisabled:false}]};
      if (path === '/teams') return {value:[{teamid:ids.team,name:'Team',teamtype:0}]};
      if (path === '/roles') return {value:[{roleid:ids.role,name:'Role'}]};
      if (path.startsWith('/systemusers(')) return {systemuserid:ids.user,fullname:'Test User',isdisabled:false};
      if (path.startsWith('/teams(')) return {teamid:ids.team,name:'Team',teamtype:0};
      throw new Error('Unexpected read ' + endpoint);
    },
    async requestWithResponse(...args) { return {data:await client.makeRequest(...args),status:200,headers:{}}; },
  };
  const plugins = new PluginStepService(client,env);
  const diagnostics = new DiagnosticService(client,env,plugins,now);
  return {calls,client,plugins,diagnostics,security:new SecurityEvidenceService(client),audit:new AuditEvidenceService(client,diagnostics)};
}
