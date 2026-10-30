import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.ts';
import { CrmRequestError } from '../src/errors.ts';
import { EnvironmentService } from '../src/services/environment.ts';

const identity = {UserId:'user', OrganizationId:'org', BusinessUnitId:'unit'};
const env = {AUTH_TYPE:'op_ad', ORG_URL:'http://crm.invalid/Demo', API_VERSION:'v9.1',
  AD_USERNAME:'user', AD_PASSWORD:'secret', AD_DOMAIN:'DOMAIN'};
function create(lookup) {
  const calls = [];
  const service = new EnvironmentService({makeRequest:async (endpoint, method = 'GET') => {
    calls.push({endpoint, method});
    if (endpoint === '/WhoAmI') return identity;
    if (endpoint === '/RetrieveVersion()') return {Version:'9.1.25.1000'};
    return lookup(endpoint);
  }}, readConfig(env));
  return {service, calls};
}

test('native environment inspection reports evidence and leaves permissions/SDK unverified', async () => {
  const {service, calls} = create(() => ({value:[
    {LogicalName:'webresource', EntitySetName:'webresources'},
    {LogicalName:'systemform', EntitySetName:'systemforms'},
  ]}));
  const result = await service.getCapabilities();
  assert.equal(result.authType, 'op_ad');
  assert.equal(result.apiVersion, 'v9.1');
  assert.equal(result.serverVersion, '9.1.25.1000');
  assert.equal(result.authentication, 'verified');
  assert.equal(result.features.webResources.status, 'present_in_metadata');
  assert.equal(result.features.webResources.permissions, 'not_tested');
  assert.equal(result.features.customApi.status, 'not_present_in_metadata');
  assert.equal(result.sdkAdapter.verified, false);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.deepEqual(calls.slice(0, 2).map(call => call.endpoint), ['/WhoAmI', '/RetrieveVersion()']);
});

test('metadata paging follows server links and preserves actual EntitySetName', async () => {
  const continuation = 'http://crm.invalid/Demo/api/data/v9.1/EntityDefinitions?$skiptoken=next';
  const {service} = create(endpoint => endpoint === continuation ?
    {value:[{LogicalName:'customapiresponseproperty', EntitySetName:'customapiresponseproperties'}]} :
    {value:[{LogicalName:'customapi', EntitySetName:'actual_customapis'},
      {LogicalName:'customapirequestparameter', EntitySetName:'customapirequestparameters'}], '@odata.nextLink':continuation});
  const result = await service.getCapabilities();
  assert.equal(result.metadataComplete, true);
  assert.equal(result.features.customApi.status, 'present_in_metadata');
  assert.equal(result.features.customApi.tables[0].entitySetName, 'actual_customapis');
});

test('an incomplete/failed metadata listing leaves absent features unknown', async () => {
  const {service} = create(() => { throw new CrmRequestError('D365_REQUEST_TIMEOUT', 'timed out'); });
  const result = await service.getCapabilities();
  assert.equal(result.metadataComplete, false);
  assert.equal(result.features.customApi.status, 'unknown');
  assert.equal(result.issues[0].code, 'D365_REQUEST_TIMEOUT');
});

test('authentication/authorization failures are not misreported as unsupported capabilities', async () => {
  for (const status of [401, 403]) {
    const {service, calls} = create(() => { throw new CrmRequestError('D365_HTTP_ERROR', 'denied', {status}); });
    await assert.rejects(service.getCapabilities(), error => error.details.status === status);
    assert.equal(calls.length, 3);
  }
});

test('repeated metadata continuation is bounded and reported as incomplete', async () => {
  const {service, calls} = create(() => ({value:[], '@odata.nextLink':'repeat'}));
  const result = await service.getCapabilities();
  assert.equal(calls.length, 4);
  assert.equal(result.metadataComplete, false);
  assert.equal(result.features.customApi.status, 'unknown');
  assert.equal(result.issues[0].code, 'D365_RESPONSE_INVALID');
});
