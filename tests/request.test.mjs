import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import axios, { AxiosError, AxiosHeaders, CanceledError } from 'axios';
import { readConfig } from '../src/config.ts';
import { toolErrorPayload } from '../src/errors.ts';
import { CacheService } from '../src/services/cache.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { retryAfterMilliseconds } from '../src/services/requestPolicy.ts';

const online = {
  TENANT_ID:'test-tenant', CLIENT_ID:'test-client', CLIENT_SECRET:'secret-do-not-echo',
  ORG_URL:'https://example.crm.invalid',
};
const ntlm = {
  AUTH_TYPE:'op_ad', ORG_URL:'http://crm.invalid/Demo',
  AD_USERNAME:'user', AD_PASSWORD:'secret-do-not-echo', AD_DOMAIN:'DOMAIN',
};
beforeEach(() => CacheService.flushExisting());

function response(config, data = {value:[]}, status = 200, headers = {}) {
  return {config, data, status, statusText:String(status), headers:new AxiosHeaders(headers)};
}
function fail(config, status, headers = {}, data = {error:{code:'0x80040220', message:'platform error'}}) {
  throw new AxiosError('raw request includes private data', 'ERR_BAD_RESPONSE', config, {}, response(config, data, status, headers));
}
function tokenMock(t, handler = () => ({access_token:'token-do-not-echo', expires_in:3600})) {
  return t.mock.method(axios, 'post', async (...args) => ({data:await handler(...args)}));
}
function service(t, env = online, adapter = config => response(config), runtime = {}) {
  const client = new D365AuthService(readConfig(env), {sleep:async () => {}, ...runtime});
  const requests = [];
  client.getAxiosInstance().defaults.adapter = async config => {
    requests.push(config);
    return adapter(config, requests.length);
  };
  return {client, requests};
}

test('typed response keeps status, ETag and created ID; legacy calls still return data only', async t => {
  tokenMock(t);
  const {client, requests} = service(t, online, config => response(config, {id:'created'}, 201, {
    ETag:'W/"123"', 'OData-EntityId':'https://example.crm.invalid/api/data/v9.2/accounts(123)',
    'Set-Cookie':'must-not-return',
  }));
  const result = await client.requestWithResponse('/accounts', 'POST', {name:'Example'}, {headers:{'If-Match':'W/"old"', Authorization:'injected'}});
  assert.equal(result.status, 201);
  assert.equal(result.headers.etag, 'W/"123"');
  assert.ok(result.headers['odata-entityid']);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer token-do-not-echo');
  assert.equal(requests[0].headers.get('If-Match'), 'W/"old"');
  assert.equal(requests[0].timeout, 30000);
  assert.equal(requests[0].maxRedirects, 0);
  assert.deepEqual(await client.makeRequest('/accounts'), {id:'created'});
});

test('NTLM uses its native client with no OAuth fetch and normalizes empty responses', async t => {
  const tokens = tokenMock(t);
  const {client, requests} = service(t, ntlm, config => response(config, '', 204));
  assert.equal(await client.makeRequest('/accounts(123)', 'PATCH', {name:'Example'}), null);
  assert.equal(tokens.mock.callCount(), 0);
  assert.equal(requests[0].headers.get('Authorization'), undefined);
  assert.equal(requests[0].url, 'http://crm.invalid/Demo/api/data/v9.2/accounts(123)');
});

test('IFD sends its configured ADFS grant, resource and timeout', async t => {
  const tokens = tokenMock(t, (url, params, options) => {
    assert.equal(url, 'https://adfs.invalid/adfs/oauth2/token');
    assert.equal(params.get('grant_type'), 'password');
    assert.equal(params.get('resource'), 'https://crm.invalid');
    assert.equal(params.get('username'), 'DOMAIN\\user');
    assert.equal(params.get('password'), 'ifd-test-password');
    assert.equal(options.timeout, 1234);
    return {access_token:'ifd-token', expires_in:3600};
  });
  const {client} = service(t, {
    AUTH_TYPE:'op_ifd', ORG_URL:'https://crm.invalid', IFD_ADFS_URL:'https://adfs.invalid',
    IFD_CLIENT_ID:'client', IFD_USERNAME:'DOMAIN\\user', IFD_PASSWORD:'ifd-test-password', REQUEST_TIMEOUT_MS:'1234',
  });
  await client.makeRequest('/WhoAmI');
  assert.equal(tokens.mock.callCount(), 1);
});

test('Token cache isolates organization, client, authority and credential changes', async t => {
  let counter = 0;
  const tokens = tokenMock(t, () => ({access_token:`token-${++counter}`, expires_in:3600}));
  const variants = [online, {...online, ORG_URL:'https://other.crm.invalid'},
    {...online, CLIENT_ID:'other-client'}, {...online, TENANT_ID:'other-tenant'},
    {...online, CLIENT_SECRET:'different-secret'}];
  const values = [];
  for (const env of variants) values.push(await service(t, env).client.getAccessToken());
  assert.equal(new Set(values).size, variants.length);
  assert.equal(await service(t, online).client.getAccessToken(), values[0]);
  assert.equal(tokens.mock.callCount(), variants.length);
});

test('concurrent callers share one token fetch and recover after a failed fetch', async t => {
  let calls = 0;
  const tokens = tokenMock(t, async () => {
    await Promise.resolve();
    if (++calls === 1) throw new Error('identity provider unavailable');
    return {access_token:'recovered', expires_in:3600};
  });
  const {client} = service(t);
  const failed = await Promise.allSettled(Array.from({length:8}, () => client.getAccessToken()));
  assert.ok(failed.every(item => item.status === 'rejected' && item.reason.code === 'D365_AUTH_FAILED'));
  assert.equal(tokens.mock.callCount(), 1);
  assert.deepEqual(await Promise.all(Array.from({length:8}, () => client.getAccessToken())), Array(8).fill('recovered'));
  assert.equal(tokens.mock.callCount(), 2);
});

test('short-lived tokens expire instead of becoming permanent cache entries', async t => {
  let now = 100000;
  let count = 0;
  tokenMock(t, () => ({access_token:`short-${++count}`, expires_in:10}));
  const {client} = service(t, online, undefined, {now:() => now});
  assert.equal(await client.getAccessToken(), 'short-1');
  now += 8000;
  assert.equal(await client.getAccessToken(), 'short-1');
  now += 2000;
  assert.equal(await client.getAccessToken(), 'short-2');
});

test('invalid token lifetime is rejected rather than cached indefinitely', async t => {
  tokenMock(t, () => ({access_token:'bad-lifetime', expires_in:0}));
  await assert.rejects(service(t).client.getAccessToken(), {code:'D365_AUTH_FAILED'});
});

test('401 on a read refreshes once and retries with the new token', async t => {
  let tokenCount = 0;
  tokenMock(t, () => ({access_token:`token-${++tokenCount}`, expires_in:3600}));
  const {client, requests} = service(t, online, (config, attempt) => {
    if (attempt === 1) fail(config, 401);
    return response(config, {UserId:'user'});
  });
  assert.deepEqual(await client.makeRequest('/WhoAmI'), {UserId:'user'});
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer token-1');
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer token-2');
});

test('persistent 401 is not an infinite refresh loop; 403 never refreshes', async t => {
  const tokens = tokenMock(t);
  for (const status of [401, 403]) {
    CacheService.flushExisting();
    const {client, requests} = service(t, online, config => fail(config, status));
    await assert.rejects(client.makeRequest('/WhoAmI'), error => error.details.status === status);
    assert.equal(requests.length, status === 401 ? 2 : 1);
  }
  assert.equal(tokens.mock.callCount(), 3);
});

test('GET retries throttling after the full Retry-After and preserves final response', async t => {
  tokenMock(t);
  const waits = [];
  const {client, requests} = service(t, online, (config, count) => {
    if (count === 1) fail(config, 429, {'Retry-After':'2'});
    return response(config, {value:[{name:'OK'}]});
  }, {sleep:async ms => { waits.push(ms); }});
  assert.deepEqual(await client.makeRequest('/accounts'), {value:[{name:'OK'}]});
  assert.deepEqual(waits, [2000]);
  assert.equal(requests.length, 2);
});

test('long Retry-After is returned without sleeping less than the server requested', async t => {
  tokenMock(t);
  const waits = [];
  const {client, requests} = service(t, online, config => fail(config, 429, {'Retry-After':'120'}), {
    sleep:async ms => { waits.push(ms); },
  });
  await assert.rejects(client.makeRequest('/accounts'), error =>
    error.code === 'D365_RATE_LIMITED' && error.details.retryAfterMs === 120000);
  assert.equal(requests.length, 1);
  assert.deepEqual(waits, []);
});

test('read failures have a finite retry budget and exponential backoff', async t => {
  tokenMock(t);
  const waits = [];
  const {client, requests} = service(t, online, config => fail(config, 503), {sleep:async ms => { waits.push(ms); }});
  await assert.rejects(client.makeRequest('/accounts'), error => error.details.attempts === 3);
  assert.equal(requests.length, 3);
  assert.deepEqual(waits, [250, 500]);
});

test('read timeout uses the same bounded retry policy', async t => {
  tokenMock(t);
  const {client, requests} = service(t, online, config => {
    throw new AxiosError('timeout', 'ECONNABORTED', config);
  });
  await assert.rejects(client.makeRequest('/accounts'), {code:'D365_REQUEST_TIMEOUT'});
  assert.equal(requests.length, 3);
});

test('write timeout, 5xx, 429 and 401 are never automatically repeated', async t => {
  const tokens = tokenMock(t);
  for (const status of [undefined, 500, 429, 401]) {
    const {client, requests} = service(t, online, config => {
      if (status === undefined) throw new AxiosError('timeout', 'ECONNABORTED', config);
      fail(config, status);
    });
    await assert.rejects(client.makeRequest('/accounts', 'POST', {name:'Example'}), error => {
      assert.equal(error.details.retryable, false);
      assert.equal(error.details.outcome, status === undefined || status === 500 ? 'unknown' : 'rejected');
      return true;
    });
    assert.equal(requests.length, 1);
  }
  assert.equal(tokens.mock.callCount(), 1);
});

test('structured errors preserve platform evidence while removing tokens and credentials', async t => {
  tokenMock(t);
  const {client} = service(t, online, config => fail(config, 412, {'x-ms-service-request-id':'request-123'}, {
    error:{code:'0x80060882', message:'conflict secret-do-not-echo Bearer token-do-not-echo'},
  }));
  await assert.rejects(client.makeRequest('/accounts(123)', 'PATCH', {name:'private-data'}), error => {
    const payload = toolErrorPayload(error);
    assert.equal(payload.code, 'D365_CONCURRENCY_CONFLICT');
    assert.equal(payload.platformCode, '0x80060882');
    assert.equal(payload.requestId, 'request-123');
    const serialized = JSON.stringify(payload);
    for (const secret of ['secret-do-not-echo','token-do-not-echo','private-data','Authorization','raw request']) {
      assert.ok(!serialized.includes(secret), serialized);
    }
    return true;
  });
});

test('authentication failures are sanitized and never send the business request', async t => {
  tokenMock(t, (_url, _params, options) => fail(options, 401, {}, {
    error_description:'invalid secret-do-not-echo client_secret=another-secret',
  }));
  const {client, requests} = service(t);
  await assert.rejects(client.makeRequest('/accounts'), error => {
    assert.equal(error.code, 'D365_AUTH_FAILED');
    assert.equal(error.details.outcome, 'not_sent');
    const serialized = JSON.stringify(toolErrorPayload(error));
    assert.ok(!serialized.includes('secret-do-not-echo'));
    assert.ok(!serialized.includes('another-secret'));
    return true;
  });
  assert.equal(requests.length, 0);
});

test('requests cannot escape the configured organization before authentication', async t => {
  const tokens = tokenMock(t);
  const {client, requests} = service(t);
  for (const endpoint of ['https://elsewhere.invalid/api/data/v9.2/accounts', '//elsewhere.invalid',
    '../v9.1/accounts', '../../other/accounts', '/%2e%2e%2fother', '/%5c..%5cother',
    'https://example.crm.invalid/other/accounts', '/accounts#fragment']) {
    await assert.rejects(client.makeRequest(endpoint), {code:'D365_ENDPOINT_INVALID'});
  }
  assert.equal(tokens.mock.callCount(), 0);
  assert.equal(requests.length, 0);
});

test('same-organization continuation URL and query are preserved', async t => {
  tokenMock(t);
  const {client, requests} = service(t);
  const nextLink = 'https://example.crm.invalid/api/data/v9.2/accounts?$skiptoken=a%2Bb%2520&$select=name';
  await client.makeRequest(nextLink);
  assert.equal(requests[0].url, nextLink);
});

test('redirect is surfaced instead of being followed or retried', async t => {
  tokenMock(t);
  const {client, requests} = service(t, online, config => fail(config, 302, {Location:'https://elsewhere.invalid'}));
  await assert.rejects(client.makeRequest('/accounts'), error => error.details.status === 302);
  assert.equal(requests.length, 1);
});

test('cancellation before dispatch does not fetch credentials or send a request', async t => {
  const tokens = tokenMock(t);
  const {client, requests} = service(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.makeRequest('/accounts', 'GET', undefined, {signal:controller.signal}), {code:'D365_REQUEST_ABORTED'});
  assert.equal(tokens.mock.callCount(), 0);
  assert.equal(requests.length, 0);
});

test('cancelling one token waiter leaves the shared token fetch usable by another', async t => {
  let resolveToken;
  tokenMock(t, () => new Promise(resolve => { resolveToken = resolve; }));
  const {client, requests} = service(t);
  const controller = new AbortController();
  const cancelled = client.makeRequest('/accounts', 'GET', undefined, {signal:controller.signal});
  const surviving = client.makeRequest('/accounts');
  const rejected = assert.rejects(cancelled, {code:'D365_REQUEST_ABORTED'});
  controller.abort();
  resolveToken({access_token:'shared-token', expires_in:3600});
  await rejected;
  await surviving;
  assert.equal(requests.length, 1);
});

test('cancellation after a write is dispatched reports an unknown outcome', async t => {
  tokenMock(t);
  const {client, requests} = service(t, online, () => { throw new CanceledError('cancelled'); });
  await assert.rejects(client.makeRequest('/accounts', 'POST', {}), error =>
    error.code === 'D365_REQUEST_ABORTED' && error.details.outcome === 'unknown');
  assert.equal(requests.length, 1);
});

test('Retry-After supports HTTP dates and rejects negative/fractional values', () => {
  const now = Date.parse('2026-10-26T00:00:00Z');
  assert.equal(retryAfterMilliseconds('Mon, 26 Oct 2026 00:00:03 GMT', now), 3000);
  assert.equal(retryAfterMilliseconds('Mon, 26 Oct 2026 00:00:00 GMT', now), 0);
  assert.equal(retryAfterMilliseconds('-1', now), undefined);
  assert.equal(retryAfterMilliseconds('0.5', now), undefined);
  assert.equal(retryAfterMilliseconds('bad', now), undefined);
});
