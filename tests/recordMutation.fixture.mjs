import { CrmRequestError } from '../src/errors.ts';
import { RecordMutationService } from '../src/services/recordMutation.ts';
import { RecordBatchService } from '../src/services/recordBatch.ts';

export const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
export const environment = {orgUrl:'https://crm.invalid/Demo',authType:'online',apiVersion:'v9.1'};
export const response = (data = null,status = 204,headers = {}) => ({data,status,headers});
export function multipart(parts,{ids = true,nested = true,close = true,atomic = false} = {}) {
  const lines = ['--batchresponse_test'];
  for (let index = 0; index < parts.length; index++) {
    const item = parts[index];
    if (index > 0 && !atomic) lines.push('--batchresponse_test');
    if (nested && (!atomic || index === 0)) lines.push('Content-Type: multipart/mixed; boundary=changesetresponse_' + index,'');
    if (nested) lines.push('--changesetresponse_' + (atomic ? 0 : index));
    lines.push('Content-Type: application/http');
    if (ids && item.id !== null) lines.push('Content-ID: ' + (item.id ?? index + 1));
    lines.push('','HTTP/1.1 ' + (item.status ?? 204) + ' Result');
    for (const [field,value] of Object.entries(item.headers ?? {})) lines.push(field + ': ' + value);
    if (item.body !== undefined) lines.push('Content-Type: application/json');
    lines.push('');
    if (item.body !== undefined) lines.push(JSON.stringify(item.body));
    if (nested && (!atomic || index === parts.length - 1)) lines.push('--changesetresponse_' + (atomic ? 0 : index) + '--');
  }
  if (close) lines.push('--batchresponse_test--','');
  return response(lines.join('\r\n'),200,{'content-type':'multipart/mixed; boundary="batchresponse_test"'});
}
export function fixture(options = {}) {
  const calls = [];
  let lookupCleared = false;
  const base = environment.orgUrl + '/api/data/' + environment.apiVersion + '/';
  const client = {
    validateEndpoint(endpoint) {
      if (typeof endpoint !== 'string' || endpoint.startsWith('//') || endpoint.includes('\\')) throw new CrmRequestError('D365_ENDPOINT_INVALID','outside API',{outcome:'not_sent'});
      const url = new URL(endpoint.replace(/^\//,''),base);
      if (url.origin !== new URL(base).origin || !url.pathname.startsWith(new URL(base).pathname) || url.hash || url.username || url.password) throw new CrmRequestError('D365_ENDPOINT_INVALID','outside API',{outcome:'not_sent'});
      return url.href;
    },
    async makeRequest(endpoint,method = 'GET',data,requestOptions) {
      const call = {endpoint,method,data,options:requestOptions}; calls.push(call);
      if (options.metadata) { const custom = await options.metadata(call); if (custom !== undefined) return custom; }
      const url = new URL(client.validateEndpoint(endpoint));
      const local = url.pathname.slice(new URL(base).pathname.length);
      if (local === 'EntityDefinitions') {
        const contact = url.searchParams.get('$filter').includes("'contacts'");
        return {value:[{LogicalName:contact ? 'contact' : 'account',EntitySetName:contact ? 'contacts' : 'accounts',
          PrimaryIdAttribute:contact ? 'contactid' : 'accountid',IsOptimisticConcurrencyEnabled:options.concurrency ?? true,
          TableType:options.tableType ?? 'Standard'}]};
      }
      if (local.endsWith('/Keys')) return {value:[{SchemaName:'account_number',KeyAttributes:options.keyFields ?? ['accountnumber'],EntityKeyIndexStatus:options.keyStatus ?? 'Active'}]};
      if (local.includes('/Attributes(')) {
        const name = /Attributes\(LogicalName='([^']+)'\)/.exec(local)[1];
        return {LogicalName:name,AttributeType:options.keyType ?? 'String'};
      }
      if (local.endsWith('/ManyToOneRelationships')) return {value:[{
        ReferencingEntityNavigationPropertyName:'primarycontactid',ReferencingAttribute:'primarycontactid',ReferencedEntity:'contact'}]};
      if (local.endsWith('/OneToManyRelationships')) return {value:[{ReferencedEntityNavigationPropertyName:'contacts',ReferencingEntity:'contact'}]};
      if (local.endsWith('/ManyToManyRelationships')) return {value:[{Entity1LogicalName:'account',Entity2LogicalName:'contact',
        Entity1NavigationPropertyName:'new_accounts_contacts',Entity2NavigationPropertyName:'new_contacts_accounts'}]};
      throw new Error('Unexpected metadata request ' + endpoint);
    },
    async requestWithResponse(endpoint,method = 'GET',data,requestOptions = {}) {
      const call = {endpoint,method,data,options:requestOptions}; calls.push(call);
      if (requestOptions.signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled',{outcome:'not_sent'});
      if (options.request) { const custom = await options.request(call,calls); if (custom !== undefined) {
        if (method === 'DELETE' && endpoint.endsWith('/primarycontactid/$ref') && custom.status >= 200 && custom.status < 300 && !options.ignoreLookupClear) lookupCleared = true;
        return custom;
      } }
      if (method === 'GET') {
        if (options.missing) throw new CrmRequestError('D365_HTTP_ERROR','missing',{status:404,outcome:'rejected'});
        const url = new URL(client.validateEndpoint(endpoint));
        const contact = url.pathname.includes('/contacts(');
        const match = /\(([a-f0-9-]{36})\)/.exec(url.pathname);
        const id = match ? match[1] : A;
        return response({[contact ? 'contactid' : 'accountid']:id,name:'Before',accountnumber:'ABC',
          _primarycontactid_value:lookupCleared ? null : options.lookupId === undefined ? B : options.lookupId,
          primarycontactid:lookupCleared ? null : Object.hasOwn(options,'navigationTarget') ? options.navigationTarget
            : {contactid:options.lookupId === undefined ? B : options.lookupId},
          '@odata.etag':Object.hasOwn(options,'etag') ? options.etag : 'W/"10"'},200);
      }
      if (endpoint === '/$batch') {
        const operations = [...data.matchAll(/^(POST|PATCH|DELETE) (https?:\/\/[^\r\n ]+) HTTP\/1\.1$/gm)];
        const contentIds = [...data.matchAll(/^Content-ID: (\d+)$/gm)].map(match => match[1]);
        const groups = [...data.matchAll(/^Content-Type: multipart\/mixed; boundary=changeset_/gm)].length;
        return multipart(operations.map((match,index) => ({id:contentIds[index],
          status:match[1] === 'POST' && !match[2].endsWith('/$ref') ? 201 : 204,
          ...(match[1] === 'POST' && !match[2].endsWith('/$ref') ? {body:{accountid:A}} : {})})),{atomic:groups === 1});
      }
      if (method === 'POST' && !endpoint.endsWith('/$ref')) return response({accountid:A},201);
      if (method === 'DELETE' && endpoint.endsWith('/primarycontactid/$ref') && !options.ignoreLookupClear) lookupCleared = true;
      return response();
    },
  };
  const writer = new RecordMutationService(client,environment);
  return {writer,batch:new RecordBatchService(writer),client,calls};
}
export const writes = calls => calls.filter(call => call.method !== 'GET');
