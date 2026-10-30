import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Ajv from 'ajv';
import { WebResourceService } from '../src/services/webResource.ts';
import { CrmRequestError, toolErrorPayload } from '../src/errors.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { handleToolCall, tools } from '../src/tool_handler.ts';

const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const environment = {orgUrl:'https://crm.invalid/Demo', apiVersion:'v9.1', authType:'op_ad'};
const base = {name:'new_/scripts/test.js', display_name:'Test', web_resource_type:3, content:'const 示例 = 1;'};
const response = (data = null, headers = {}, status = 204) => ({data, headers, status});

function fixture({read, write} = {}) {
  const calls = [];
  const client = {
    async makeRequest(endpoint, method = 'GET', data, options) {
      const call = {endpoint, method, data, options}; calls.push(call);
      return read ? read(call) : {value:[]};
    },
    async requestWithResponse(endpoint, method = 'GET', data, options) {
      const call = {endpoint, method, data, options}; calls.push(call);
      return write ? write(call) : response();
    },
    validateEndpoint(endpoint) {
      const url = new URL(endpoint, environment.orgUrl + '/api/data/v9.1/');
      if (url.origin !== 'https://crm.invalid' || !url.pathname.startsWith('/Demo/api/data/v9.1/')) throw new Error('outside API');
    },
  };
  return {service:new WebResourceService(client, environment), calls};
}

test('Web Resource search preserves the old envelope, bounds results and escapes OData literals', async () => {
  const {service, calls} = fixture({read:() => ({value:[{name:'test', content:'should-not-leak'}]})});
  const result = await service.search({nameKeyword:"x' or name ne 'x", top:10});
  const url = new URL(calls[0].endpoint, 'https://crm.invalid');
  assert.equal(url.pathname, '/webresourceset');
  assert.equal(url.searchParams.get('$filter'), "contains(name,'x'' or name ne ''x')");
  assert.equal(url.searchParams.get('$top'), '10');
  assert.equal(url.searchParams.get('$select').includes('content'), false);
  assert.equal(url.searchParams.get('$orderby'), 'name asc,webresourceid asc');
  assert.deepEqual(result, {operation:'searchWebResources', version:'v9.1', fromCache:false, data:{value:[{name:'test'}]}});
});

test('content retrieval is opt-in and legacy/snake aliases can agree', async () => {
  const {service, calls} = fixture({read:() => ({value:[{content:'eA=='}]})});
  const result = await service.search({name_keyword:'x', nameKeyword:'x', includeContent:true});
  assert.equal(result.data.value[0].content, 'eA==');
  assert.match(calls[0].endpoint, /content/);
});

test('invalid search options fail before CRM access', async () => {
  const {service, calls} = fixture();
  for (const args of [{}, {name_keyword:' '}, {name_keyword:'x', nameKeyword:'y'},
    {name_keyword:'x', top:0}, {name_keyword:'x', top:101}, {name_keyword:'x', top:1.1},
    {name_keyword:'x', include_content:'false'}, {name_keyword:'x', include_unpublished:'true'},
    {name_keyword:'x', includeContnet:true}, null, []]) {
    await assert.rejects(service.search(args), {code:'D365_WEBRESOURCE_INVALID'});
  }
  assert.equal(calls.length, 0);
});

test('saved-only resources can be found through an explicit native unpublished search', async () => {
  const {service, calls} = fixture({read:() => ({value:[{webresourceid:ID, name:'new_saved.js'}]})});
  const result = await service.search({nameKeyword:'new_saved', includeUnpublished:true});
  assert.match(calls[0].endpoint, /^\/webresourceset\/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple\(\)\?/);
  assert.equal(result.data.value[0].webresourceid, ID);
});

test('create with entity response saves UTF-8 once and publishes only the created resource', async () => {
  const {service, calls} = fixture({write:c => c.endpoint.startsWith('/webresourceset') ? response({webresourceid:ID}, {}, 201) : response()});
  const result = await service.create({...base, solutionUniqueName:'My_Solution', description:''});
  assert.deepEqual(calls.map(c => c.method), ['GET','POST','POST']);
  assert.match(calls[0].endpoint, /RetrieveUnpublishedMultiple/);
  assert.equal(new URL(calls[0].endpoint, 'https://crm.invalid').searchParams.get('$filter'), "name eq 'new_/scripts/test.js'");
  assert.equal(calls[1].data.content, Buffer.from(base.content).toString('base64'));
  assert.equal(calls[1].data.description, '');
  assert.equal(calls[1].options.headers['MSCRM.SolutionUniqueName'], 'My_Solution');
  assert.equal(calls[1].options.headers.Prefer, 'return=representation');
  assert.equal(calls[2].endpoint, '/PublishXml');
  assert.equal(calls[2].data.ParameterXml, `<importexportxml><webresources><webresource>{${ID}}</webresource></webresources></importexportxml>`);
  assert.equal(result.data.saved, true);
  assert.equal(result.data.published, true);
});

test('create recognizes an ID-only response header and supports save-only behavior', async () => {
  const {service, calls} = fixture({write:() => response(null, {'odata-entityid':environment.orgUrl + `/api/data/v9.1/webresourceset(${ID})`})});
  const result = await service.create({...base, publish:false});
  assert.equal(result.data.webresourceid, ID);
  assert.equal(result.data.saved, true);
  assert.deepEqual(result.data.publication, {status:'not_requested'});
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});

test('saved names, including unpublished definitions, are never silently overwritten', async () => {
  const {service, calls} = fixture({read:() => ({value:[{webresourceid:ID}]})});
  await assert.rejects(service.create(base), {code:'D365_WEBRESOURCE_NAME_EXISTS'});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

test('create preview returns environment and changes with hashes, without uploading source', async () => {
  const {service, calls} = fixture();
  const result = await service.create({...base, dryRun:true});
  assert.equal(result.data.dryRun, true);
  assert.deepEqual(result.data.environment, environment);
  assert.equal(result.data.changes.content.after.bytes, Buffer.byteLength(base.content));
  assert.match(result.data.changes.content.after.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.data.saved, false);
  assert.equal(JSON.stringify(result).includes(base.content), false);
  assert.equal(calls.length, 1);
});

test('no created ID, malformed ID or an external ID header retains confirmed save evidence', async () => {
  for (const reply of [response(), response({webresourceid:'bad'}), response(null, {'odata-entityid':`https://evil.invalid/api/data/v9.1/webresourceset(${ID})`})]) {
    const {service, calls} = fixture({write:() => reply});
    await assert.rejects(service.create(base), error => {
      const payload = toolErrorPayload(error);
      assert.equal(payload.code, 'D365_WEBRESOURCE_CREATE_ID_MISSING');
      assert.equal(payload.data.saved, true);
      assert.equal(payload.data.webresourceid, null);
      assert.equal(payload.data.name, base.name);
      assert.equal(payload.data.publication.status, 'not_attempted');
      return true;
    });
    assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  }
});

test('create save rejection/unknown outcome never triggers publication or a second save', async () => {
  for (const status of [401, 403, 429, 500]) {
    const error = new CrmRequestError('D365_REQUEST_FAILED', 'save failed', {status, outcome:status === 500 ? 'unknown' : 'rejected'});
    const {service, calls} = fixture({write:() => { throw error; }});
    await assert.rejects(service.create(base), e => e === error);
    assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  }
});

test('known publish rejection preserves save success, resource ID and platform evidence', async () => {
  const {service, calls} = fixture({write:c => {
    if (c.endpoint === '/PublishXml') throw new CrmRequestError('D365_REQUEST_FAILED', base.content, {
      status:403, platformCode:'denied', requestId:'trace', outcome:'rejected', attempts:1,
    });
    return response({webresourceid:ID});
  }});
  await assert.rejects(service.create(base), error => {
    const payload = toolErrorPayload(error);
    assert.equal(payload.code, 'D365_WEBRESOURCE_PUBLISH_FAILED');
    assert.equal(payload.status, 403);
    assert.equal(payload.requestId, 'trace');
    assert.equal(payload.data.success, false);
    assert.equal(payload.data.saved, true);
    assert.equal(payload.data.webresourceid, ID);
    assert.equal(payload.data.published, false);
    assert.equal(payload.data.publication.status, 'failed');
    assert.equal(JSON.stringify(payload).includes(base.content), false);
    return true;
  });
  assert.equal(calls.length, 3);
});

test('publish timeout preserves save success and reports publication outcome unknown', async () => {
  const {service, calls} = fixture({write:c => {
    if (c.endpoint === '/PublishXml') throw new CrmRequestError('D365_REQUEST_TIMEOUT', 'timeout', {outcome:'unknown', attempts:1});
    return response({webresourceid:ID});
  }});
  await assert.rejects(service.create(base), error => {
    const payload = toolErrorPayload(error);
    assert.equal(payload.outcome, 'unknown');
    assert.equal(payload.data.saved, true);
    assert.equal(payload.data.published, null);
    assert.equal(payload.data.publication.status, 'unknown');
    return true;
  });
  assert.equal(calls.filter(c => c.endpoint === '/PublishXml').length, 1);
});

test('update with legacy filePath reads binary bytes and uses update-only PATCH', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'd365-webresource-'));
  try {
    const file = join(dir, 'test.bin');
    const bytes = Buffer.from([0,255,128,13,10]);
    await writeFile(file, bytes);
    const {service, calls} = fixture();
    const result = await service.update({id:ID.toUpperCase(), filePath:file, displayName:'New', publish:false});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(calls[0].endpoint, `/webresourceset(${ID})`);
    assert.deepEqual(calls[0].data, {displayname:'New', content:bytes.toString('base64')});
    assert.equal(calls[0].options.headers['If-Match'], '*');
    assert.equal(result.data.saved, true);
  } finally {
    // dir was freshly created by this test, never supplied by the caller.
    await rm(dir, {recursive:true, force:true});
  }
});

test('empty UTF-8/Base64 content is a deliberate valid save', async () => {
  for (const content_encoding of ['utf8','base64']) {
    const {service, calls} = fixture();
    await service.update({id:ID, content:'', content_encoding, publish:false});
    assert.equal(calls[0].data.content, '');
  }
});

test('canonical Base64 is passed as bytes without double encoding', async () => {
  const {service, calls} = fixture();
  await service.update({id:ID, content:'AP+A', contentEncoding:'base64', publish:false});
  assert.equal(calls[0].data.content, 'AP+A');
});

test('specific ETags are preserved; a 412 conflict is never published or retried', async () => {
  const error = new CrmRequestError('D365_REQUEST_FAILED', 'conflict', {status:412, outcome:'rejected'});
  const {service, calls} = fixture({write:() => { throw error; }});
  await assert.rejects(service.update({id:ID, content:'x', ifMatch:'W/"123"'}), e => e === error);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['If-Match'], 'W/"123"');
});

test('update preview compares latest saved/unpublished content and exposes ETag, never source', async () => {
  const {service, calls} = fixture({read:() => ({webresourceid:ID, name:'new_test.js', content:'b2xk',
    displayname:'Old', description:'Before', '@odata.etag':'W/"12"'})});
  const result = await service.update({id:ID, content:'new', display_name:'New', description:'', dry_run:true});
  assert.match(calls[0].endpoint, /Microsoft.Dynamics.CRM.RetrieveUnpublished\(\)/);
  assert.equal(calls.length, 1);
  assert.equal(result.data.etag, 'W/"12"');
  assert.deepEqual(result.data.changes.displayname, {before:'Old', after:'New'});
  assert.deepEqual(result.data.changes.description, {before:'Before', after:''});
  assert.equal(result.data.changes.content.before.bytes, 3);
  assert.notEqual(result.data.changes.content.before.sha256, result.data.changes.content.after.sha256);
  assert.equal(JSON.stringify(result).includes('b2xk'), false);
});

test('unavailable native unpublished reads retain 401/403/404 instead of falling back to published data', async () => {
  for (const status of [401,403,404]) {
    const error = new CrmRequestError('D365_REQUEST_FAILED', 'native error', {status});
    const {service, calls} = fixture({read:() => { throw error; }});
    await assert.rejects(service.update({id:ID, content:'x', dry_run:true}), e => e === error);
    await assert.rejects(service.create(base), e => e === error);
    assert.equal(calls.length, 2);
    assert.equal(calls.every(c => c.method === 'GET'), true);
  }
});

test('publish-only recovery sends one PublishXml and never uploads or updates content', async () => {
  const {service, calls} = fixture();
  const result = await service.publish({id:ID});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, '/PublishXml');
  assert.equal(result.data.saved, false);
  assert.equal(result.data.published, true);
});

test('publish preview performs no CRM calls and includes the environment and single ID', async () => {
  const {service, calls} = fixture();
  const result = await service.publish({id:ID, dryRun:true});
  assert.deepEqual(result.data.environment, environment);
  assert.equal(result.data.target.webresourceid, ID);
  assert.equal(calls.length, 0);
});

test('invalid write parameters and aliases fail before any CRM access', async () => {
  const {service, calls} = fixture();
  for (const patch of [
    {id:'bad'}, {id:`${ID})/PublishAllXml`}, {publish:'false'}, {dry_run:'true'}, {content:42},
    {if_match:'*'}, {if_match:'W/"1"\r\nOther: x'}, {if_match:'W/"\0"'}, {if_match:'123'},
    {file_path:'relative.js', content:undefined}, {filePath:'relative.js', content:undefined},
    {file_path:'C:\\x.js'}, {content:undefined}, {display_name:''}, {description:5},
    {content_encoding:'hex'}, {file_path:'C:\\x', content:undefined, content_encoding:'base64'},
    {dry_run:true, dryRun:false}, {display_name:'x', displayName:'y'}, {unknown:true},
  ]) await assert.rejects(service.update({id:ID, content:'x', ...patch}), {code:'D365_WEBRESOURCE_INVALID'});
  for (const patch of [{name:''}, {display_name:''}, {web_resource_type:0}, {web_resource_type:13},
    {web_resource_type:1.1}, {solution_unique_name:'x\r\nHeader: x'}, {solution_unique_name:' '}, {description:null}]) {
    await assert.rejects(service.create({...base, ...patch}), {code:'D365_WEBRESOURCE_INVALID'});
  }
  assert.equal(calls.length, 0);
});

test('malformed/noncanonical Base64 and oversized content are rejected locally', async () => {
  const {service, calls} = fixture();
  for (const content of ['not base64!', 'Zg', 'Zh==', 'Zg=\n', 'data:text/plain;base64,Zg==', '====']) {
    await assert.rejects(service.update({id:ID, content, content_encoding:'base64'}), {code:'D365_WEBRESOURCE_INVALID'});
  }
  await assert.rejects(service.update({id:ID, content:'x'.repeat(10 * 1024 * 1024 + 1)}), {code:'D365_WEBRESOURCE_INVALID'});
  assert.equal(calls.length, 0);
});

test('large valid Base64 avoids regex recursion and stays within the local size bound', async () => {
  const content = Buffer.alloc(1024 * 1024, 255).toString('base64');
  const {service, calls} = fixture();
  await service.update({id:ID, content, content_encoding:'base64', publish:false});
  assert.equal(calls[0].data.content, content);
});

test('unreadable files, directories and oversized files return a generic local error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'd365-webresource-'));
  try {
    const oversized = join(dir, 'large.bin');
    await writeFile(oversized, Buffer.alloc(10 * 1024 * 1024 + 1));
    const {service, calls} = fixture();
    for (const file_path of [dir, join(dir, 'missing-secret.js'), oversized]) {
      await assert.rejects(service.update({id:ID, file_path}), error => {
        assert.equal(error.code, 'D365_WEBRESOURCE_INVALID');
        assert.equal(error.message.includes(dir), false);
        return true;
      });
    }
    assert.equal(calls.length, 0);
  } finally {
    await rm(dir, {recursive:true, force:true});
  }
});

test('malformed CRM reads never produce a preview or dispatch a write', async () => {
  for (const reply of [null, {}, {value:null}]) {
    const {service, calls} = fixture({read:() => reply});
    await assert.rejects(service.search({name_keyword:'x'}), {code:'D365_RESPONSE_INVALID'});
    await assert.rejects(service.create(base), {code:'D365_RESPONSE_INVALID'});
    assert.equal(calls.every(c => c.method === 'GET'), true);
  }
  for (const reply of [{webresourceid:5, content:'YQ=='}, {webresourceid:ID}, null]) {
    const {service} = fixture({read:() => reply});
    await assert.rejects(service.update({id:ID, content:'x', dry_run:true}), {code:'D365_RESPONSE_INVALID'});
  }
});

test('the four MCP registrations have valid schemas accepting legacy and new parameter forms', () => {
  const ajv = new Ajv({strict:false, useDefaults:true});
  const cases = {
    search_web_resources_by_name:[{nameKeyword:'x'}, {name_keyword:'x'}],
    create_web_resource_and_publish:[base, {name:'new_x', displayName:'x', webResourceType:3, filePath:'C:\\test.js'}],
    update_web_resource_and_publish:[{id:ID, content:'x'}, {id:ID, filePath:'C:\\test.js'}],
    publish_web_resource:[{id:ID}, {id:ID, dryRun:true}],
  };
  for (const [name, args] of Object.entries(cases)) {
    const tool = tools.find(t => t.name === name);
    assert.ok(tool);
    const validate = ajv.compile(tool.inputSchema);
    for (const arg of args) assert.equal(validate(arg), true, JSON.stringify(validate.errors));
    assert.equal(validate({}), false);
    assert.equal(validate({...args[0], accidentalUnknown:true}), false);
  }
});

test('MCP routes all four tools to the shared client and exposes partial publish errors', async t => {
  const settings = {AUTH_TYPE:'online', ORG_URL:'https://crm.invalid', ENVIRONMENT_URL:'https://crm.invalid',
    TENANT_ID:'offline', CLIENT_ID:'offline', CLIENT_SECRET:'offline-placeholder'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  const calls = [];
  Object.assign(process.env, settings);
  t.mock.method(D365AuthService.prototype, 'makeRequest', async endpoint => {
    calls.push(endpoint); return {value:[]};
  });
  t.mock.method(D365AuthService.prototype, 'requestWithResponse', async (endpoint, method) => {
    calls.push(endpoint);
    if (endpoint === '/PublishXml') throw new CrmRequestError('D365_REQUEST_FAILED', 'rejected', {status:403, outcome:'rejected'});
    return response(method === 'POST' ? {webresourceid:ID} : null);
  });
  try {
    await handleToolCall('search_web_resources_by_name', {nameKeyword:'x'});
    await handleToolCall('create_web_resource_and_publish', {...base, publish:false});
    await handleToolCall('update_web_resource_and_publish', {id:ID, content:'x', publish:false});
    await assert.rejects(handleToolCall('publish_web_resource', {id:ID}), error => {
      assert.equal(toolErrorPayload(error).code, 'D365_WEBRESOURCE_PUBLISH_FAILED');
      return true;
    });
    assert.equal(calls.length, 5);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
