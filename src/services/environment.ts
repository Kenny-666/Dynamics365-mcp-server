import { CrmRequestError, toolErrorPayload } from '../errors.js';
import type { D365Config } from '../types/index.js';
import type { CrmDataClient } from '../types/crmRequest.js';

const featureTables: Record<string, string[]> = {
  pluginSteps:['plugintype', 'sdkmessageprocessingstep'],
  pluginImages:['sdkmessageprocessingstepimage'],
  webResources:['webresource'],
  forms:['systemform'],
  systemViews:['savedquery'],
  personalViews:['userquery'],
  solutions:['solution', 'solutioncomponent'],
  pluginTraceLogs:['plugintracelog'],
  systemJobs:['asyncoperation'],
  audit:['audit'],
  customApi:['customapi', 'customapirequestparameter', 'customapiresponseproperty'],
};

interface MetadataPage {
  value: {LogicalName:string; EntitySetName:string}[];
  '@odata.nextLink'?: string;
}

/** Inspect server-provided evidence; never infer support from Online/AD/IFD alone. */
export class EnvironmentService {
  constructor(private readonly client: CrmDataClient, private readonly config: D365Config) {}

  async getCapabilities() {
    const identity = await this.client.makeRequest('/WhoAmI');
    if (typeof identity?.UserId !== 'string' || typeof identity?.OrganizationId !== 'string') {
      throw new CrmRequestError('D365_RESPONSE_INVALID', 'WhoAmI did not return the expected user and organization identifiers.');
    }
    const issues: Record<string, unknown>[] = [];
    let serverVersion: string | null = null;
    try {
      const version = await this.client.makeRequest('/RetrieveVersion()');
      if (typeof version?.Version !== 'string') throw new CrmRequestError('D365_RESPONSE_INVALID', 'RetrieveVersion did not return a version string.');
      serverVersion = version.Version;
    } catch (error) {
      this.checkAuthentication(error);
      issues.push({operation:'RetrieveVersion', ...toolErrorPayload(error)});
    }

    const names = [...new Set(Object.values(featureTables).flat())];
    const query = new URLSearchParams({
      '$select':'LogicalName,EntitySetName',
      '$filter':names.map(name => "LogicalName eq '" + name + "'").join(' or '),
    });
    const tables = new Map<string, string>();
    let metadataComplete = false;
    let next: string | undefined = '/EntityDefinitions?' + query.toString();
    const visited = new Set<string>();
    try {
      while (next && visited.size < 5) {
        if (visited.has(next)) throw new CrmRequestError('D365_RESPONSE_INVALID', 'Metadata pagination repeated a continuation URL.');
        visited.add(next);
        const page: MetadataPage | null = await this.client.makeRequest<MetadataPage>(next);
        if (!page || !Array.isArray(page.value) || page.value.some((table: {LogicalName?: unknown; EntitySetName?: unknown}) =>
          typeof table?.LogicalName !== 'string' || typeof table?.EntitySetName !== 'string')) {
          throw new CrmRequestError('D365_RESPONSE_INVALID', 'EntityDefinitions did not return the expected table metadata.');
        }
        for (const table of page.value) tables.set(table.LogicalName, table.EntitySetName);
        const continuation: unknown = page['@odata.nextLink'];
        if (continuation !== undefined && typeof continuation !== 'string') {
          throw new CrmRequestError('D365_RESPONSE_INVALID', 'Metadata continuation URL must be a string.');
        }
        next = continuation || undefined;
      }
      metadataComplete = !next;
      if (!metadataComplete) issues.push({operation:'EntityDefinitions', code:'D365_METADATA_TRUNCATED'});
    } catch (error) {
      this.checkAuthentication(error);
      issues.push({operation:'EntityDefinitions', ...toolErrorPayload(error)});
    }

    const features = Object.fromEntries(Object.entries(featureTables).map(([feature, requiredTables]) => {
      const missing = requiredTables.filter(name => !tables.has(name));
      return [feature, {
        status:missing.length === 0 ? 'present_in_metadata' : metadataComplete ? 'not_present_in_metadata' : 'unknown',
        permissions:'not_tested',
        tables:requiredTables.map(logicalName => ({logicalName, entitySetName:tables.get(logicalName) || null})),
      }];
    }));

    return {
      checkedAt:new Date().toISOString(),
      orgUrl:this.config.orgUrl || this.config.environmentUrl,
      authType:this.config.authType || 'online',
      apiVersion:this.config.apiVersion || 'v9.2',
      serverVersion,
      identity:{userId:identity.UserId, organizationId:identity.OrganizationId, businessUnitId:identity.BusinessUnitId || null},
      authentication:'verified', metadataComplete, features, issues,
      sdkAdapter:{configured:false, verified:false},
      note:'Metadata presence is evidence of a table definition, not proof of write permission or operation support. No configuration was changed; no alternative API version was selected.',
    };
  }

  private checkAuthentication(error: unknown): void {
    if (!(error instanceof CrmRequestError) || error.code === 'D365_AUTH_FAILED' ||
        error.details.status === 401 || error.details.status === 403) throw error;
  }
}
