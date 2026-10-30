import assert from 'node:assert/strict';
import test from 'node:test';
import { handleToolCall, tools } from '../src/tool_handler.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';

test('a failed initialization does not retain a broken service instance', async t => {
  const settings = {
    AUTH_TYPE:'online', ORG_URL:'https://crm.invalid', ENVIRONMENT_URL:'https://crm.invalid',
    CLIENT_ID:'offline', CLIENT_SECRET:'offline-placeholder', TENANT_ID:'',
    CACHE_TTL:'120', CACHE_TTL_SECONDS:'120', API_VERSION:'v9.2',
    REQUEST_TIMEOUT_MS:'30000', MAX_READ_RETRIES:'2', MAX_RETRY_DELAY_MS:'30000',
  };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  const request = t.mock.method(D365AuthService.prototype, 'makeRequest', async endpoint => {
    assert.equal(endpoint, '/WhoAmI');
    return {UserId:'offline-user'};
  });
  try {
    Object.assign(process.env, settings);
    await assert.rejects(handleToolCall('get_current_user_context', {}), /TENANT_ID is required/);
    assert.equal(request.mock.callCount(), 0);
    process.env.TENANT_ID = 'offline';
    assert.deepEqual(await handleToolCall('get_current_user_context', {}), {UserId:'offline-user'});
    assert.equal(request.mock.callCount(), 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('MCP handlers forward query options, allow FetchXML cursor-only calls and clear cursors', async t => {
  let reads = 0;
  t.mock.method(D365AuthService.prototype, 'makeRequest', async endpoint => {
    if (endpoint.startsWith('/EntityDefinitions')) {
      const entity = {LogicalName:'account', EntitySetName:'accounts', PrimaryIdAttribute:'accountid'};
      return endpoint.startsWith('/EntityDefinitions?') ? {value:[entity]} : entity;
    }
    reads++;
    return {value:[{id:1},{id:2}]};
  });
  const result = await handleToolCall('search_records_by_odata', {
    collection_name:'accounts', state_mode:'all', max_records:1, orderby:'name desc',
  });
  assert.equal(result.query.state.mode, 'all');
  assert.equal(result.query.orderby, 'name desc,accountid');
  assert.deepEqual(result.value, [{id:1}]);
  const fetched = await handleToolCall('query_by_fetchxml', {
    fetch_xml:'<fetch><entity name="account"/></fetch>', state_mode:'all', max_records:1,
  });
  const resumed = await handleToolCall('query_by_fetchxml', {continuation:fetched.paging.continuation});
  assert.deepEqual(resumed.value, [{id:2}]);
  assert.equal(reads, 2);
  assert.ok(tools.find(tool => tool.name === 'query_by_fetchxml').inputSchema.anyOf);
  await handleToolCall('clear_server_cache');
  await assert.rejects(handleToolCall('search_records_by_odata', {
    collection_name:'accounts', continuation:result.paging.continuation,
  }), {code:'D365_QUERY_CONTINUATION_EXPIRED'});
});
