import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios, { AxiosHeaders } from 'axios';
import { PluginStepService } from '../src/services/pluginStep.ts';
import { CrmRequestError, toolErrorPayload } from '../src/errors.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { handleToolCall } from '../src/tool_handler.ts';
import { pluginStepTools } from '../src/tools/pluginStepTools.ts';
import { readConfig } from '../src/config.ts';
import { CacheService } from '../src/services/cache.ts';

const ids = {
  type:'11111111-1111-1111-1111-111111111111', message:'22222222-2222-2222-2222-222222222222',
  filter:'33333333-3333-3333-3333-333333333333', step:'44444444-4444-4444-4444-444444444444',
  secure:'55555555-5555-5555-5555-555555555555', old:'66666666-6666-6666-6666-666666666666',
  other:'77777777-7777-7777-7777-777777777777', assembly:'88888888-8888-8888-8888-888888888888',
};
const environment = {orgUrl:'https://crm.invalid/Demo', authType:'op_ad', apiVersion:'v9.1'};
const secret = 'plugin-secret-must-not-be-echoed';
const type = {plugintypeid:ids.type, typename:'Company.Test', friendlyname:'Test', _pluginassemblyid_value:ids.assembly,
  pluginassemblyid:{pluginassemblyid:ids.assembly, name:'Company'}, isworkflowactivity:false};
const message = {sdkmessageid:ids.message, name:'Update', isprivate:false, isactive:true};
const filter = {sdkmessagefilterid:ids.filter, _sdkmessageid_value:ids.message, primaryobjecttypecode:'account', iscustomprocessingstepallowed:true};
const step = {sdkmessageprocessingstepid:ids.step, name:'Test: Update', stage:20, mode:0, rank:1, supporteddeployment:0,
  _eventhandler_value:ids.type, _sdkmessageid_value:ids.message, _sdkmessagefilterid_value:ids.filter,
  _sdkmessageprocessingstepsecureconfigid_value:ids.old, eventhandler_plugintype:{...type},
  sdkmessageid:{...message}, sdkmessagefilterid:{...filter}, statecode:0, '@odata.etag':'W/"10"'};
const registration = {plugin_type:{plugin_type_name:'Company.Test'}, message:'Update', primary_entity:'account', stage:20, mode:0, rank:1};
const reply = (data = null, headers = {}, status = 204) => ({data, headers, status});

function fixture(options = {}) {
  const calls = [];
  let writes = false;
  const savedStep = structuredClone(options.existing || step);
  const client = {
    validateEndpoint(endpoint) {
      const url = new URL(endpoint, environment.orgUrl + '/api/data/v9.1/');
      if (url.origin !== 'https://crm.invalid' || !url.pathname.startsWith('/Demo/api/data/v9.1/')) {
        // Root-relative service paths are interpreted by the real transport inside the API base.
        if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('/api/data/')) throw new CrmRequestError('D365_ENDPOINT_INVALID', 'outside organization');
      }
      return endpoint;
    },
    async makeRequest(endpoint) {
      const call = {endpoint, method:'GET'}; calls.push(call);
      if (options.read) {
        const result = await options.read(call, calls);
        if (result !== undefined) return result;
      }
      if (endpoint.startsWith('/plugintypes?')) return {value:[structuredClone(type)]};
      if (endpoint.startsWith('/sdkmessages?')) return {value:[structuredClone(message)]};
      if (endpoint.startsWith('/sdkmessagefilters?')) return {value:[structuredClone(filter)]};
      if (endpoint.includes('/Attributes?')) return {value:[{LogicalName:'name'},{LogicalName:'telephone1'}]};
      if (endpoint.startsWith('/EntityDefinitions')) return {PrimaryIdAttribute:'accountid', IsOptimisticConcurrencyEnabled:Object.hasOwn(options, 'concurrency') ? options.concurrency : true};
      if (endpoint.startsWith('/sdkmessageprocessingsteps?')) {
        const filterText = new URL(endpoint, 'https://crm.invalid').searchParams.get('$filter') || '';
        if (filterText.startsWith('sdkmessageprocessingstepid eq')) return {value:[structuredClone(savedStep)]};
        if (writes) return {value:[structuredClone(savedStep)]};
        return {value:options.duplicates || []};
      }
      throw new Error('Unexpected request ' + endpoint);
    },
    async requestWithResponse(endpoint, method, data, requestOptions) {
      const call = {endpoint, method, data, options:requestOptions}; calls.push(call);
      function apply() {
        if (endpoint.startsWith('/sdkmessageprocessingsteps')) {
          for (const [field, value] of Object.entries(data)) if (!field.includes('@odata.bind')) savedStep[field] = value;
          const secureBinding = data['sdkmessageprocessingstepsecureconfigid@odata.bind'];
          if (secureBinding !== undefined) savedStep._sdkmessageprocessingstepsecureconfigid_value = secureBinding === null ? null : /\(([^)]+)\)/.exec(secureBinding)[1];
        }
      }
      if (options.write) {
        const result = await options.write(call, calls);
        if (result !== undefined) { apply(); writes = true; return result; }
      }
      apply();
      writes = true;
      return reply();
    },
  };
  const generated = [ids.step, ids.secure, ids.other];
  const service = new PluginStepService(client, environment, () => generated.shift());
  return {service, calls, client};
}
const writeCalls = calls => calls.filter(c => c.method !== 'GET');
const errorPayload = async promise => {
  try { await promise; assert.fail('Expected an error'); } catch (e) {
    assert.ok(e instanceof CrmRequestError, e.stack);
    return toolErrorPayload(e);
  }
};

test('registration metadata discovers native records without writing or fetching secure content', async () => {
  const {service, calls} = fixture();
  const result = await service.metadata({pluginTypeName:'Company.Test', assemblyName:'Company', message:'Update', primaryEntity:'ACCOUNT'});
  assert.equal(result.pluginTypes[0].id, ids.type);
  assert.equal(result.pluginTypes[0].assemblyName, 'Company');
  assert.equal(result.messages[0].name, 'Update');
  assert.equal(result.messageFilters[0].customProcessingStepAllowed, true);
  assert.equal(calls.every(c => c.method === 'GET'), true);
  assert.equal(calls.some(c => c.endpoint.includes('secureconfig')), false);
});

test('discovery handles missing types and reports bounded listings rather than claiming a full inventory', async () => {
  const {service} = fixture({read:c => c.endpoint.startsWith('/plugintypes?') ? {value:[]} : undefined});
  const result = await service.metadata({});
  assert.deepEqual(result.pluginTypes, []);
  assert.deepEqual(result.messageFilters, []);
  const capped = fixture({read:c => c.endpoint.startsWith('/plugintypes?') ? {value:Array.from({length:100}, () => type)} : undefined});
  assert.equal((await capped.service.metadata({})).limited.pluginTypes, true);
});

test('read-only metadata can inspect private/inactive messages even though registration rejects them', async () => {
  const {service, calls} = fixture({read:c => c.endpoint.startsWith('/sdkmessages?')
    ? {value:[{...message,isprivate:true,isactive:false}]} : undefined});
  assert.equal((await service.metadata({message:'Update'})).messages[0].id, ids.message);
  await assert.rejects(service.register(registration), {code:'D365_PLUGIN_INVALID'});
  assert.equal(writeCalls(calls).length, 0);
});

test('step query excludes secure plaintext by default even if the transport returns extra fields', async () => {
  const {service, calls} = fixture({duplicates:[{...step, configuration:'visible-unsecure',
    sdkmessageprocessingstepsecureconfigid:{sdkmessageprocessingstepsecureconfigid:ids.old, secureconfig:secret}, arbitrary:{secureconfig:secret}}]});
  const result = await service.query({});
  assert.equal(result.items[0].secureConfiguration.value, null);
  assert.equal(result.items[0].secureConfiguration.present, true);
  assert.equal(result.items[0].secureConfiguration.included, false);
  assert.equal(result.items[0].unsecureConfiguration, 'visible-unsecure');
  assert.equal(JSON.stringify(result).includes(secret), false);
  const expand = new URL(calls[0].endpoint, 'https://crm.invalid').searchParams.get('$expand');
  assert.equal(expand.includes('secureconfig'), false);
});

test('secure plaintext can be requested explicitly; unsecure content can be excluded independently', async () => {
  const {service, calls} = fixture({duplicates:[{...step, configuration:'hidden',
    sdkmessageprocessingstepsecureconfigid:{sdkmessageprocessingstepsecureconfigid:ids.old, secureconfig:secret}}]});
  const result = await service.query({includeSecureConfiguration:true, includeUnsecureConfiguration:false});
  assert.equal(result.items[0].secureConfiguration.value, secret);
  assert.equal(result.items[0].secureConfiguration.included, true);
  assert.equal(result.items[0].unsecureConfiguration, null);
  const url = new URL(calls[0].endpoint, 'https://crm.invalid');
  assert.match(url.searchParams.get('$expand'), /secureconfig/);
  assert.equal(url.searchParams.get('$select').split(',').includes('configuration'), false);
});

test('query combines all exact filters with a supplied step ID and escapes strings', async () => {
  const {service, calls} = fixture();
  await service.query({stepId:ids.step, pluginTypeName:"Company.Test' OR 'x", assemblyName:'Company', primaryEntity:'account',
    message:'Update', stage:'PreOperation', mode:'Synchronous', enabled:false, top:2});
  const params = new URL(calls[0].endpoint, 'https://crm.invalid').searchParams;
  const value = params.get('$filter');
  assert.match(value, /sdkmessageprocessingstepid eq/);
  assert.match(value, /Company.Test'' OR ''x/);
  assert.match(value, /stage eq 20/);
  assert.match(value, /mode eq 0/);
  assert.match(value, /statecode eq 1/);
  assert.match(value, /primaryobjecttypecode eq 'account'/);
  assert.equal(params.get('$top'), '2');
});

test('native query pages are followed within the organization before resolving uniqueness', async () => {
  let typeReads = 0;
  const {service, calls} = fixture({read:c => {
    if (c.endpoint.startsWith('/plugintypes?')) { typeReads++; return {value:[], '@odata.nextLink':environment.orgUrl + '/api/data/v9.1/plugintypes?$skiptoken=x'}; }
    if (c.endpoint.includes('$skiptoken=x')) return {value:[type]};
    return undefined;
  }});
  const result = await service.register({...registration, dry_run:true});
  assert.equal(result.dryRun, true);
  assert.equal(typeReads, 1);
  assert.equal(writeCalls(calls).length, 0);
});

test('external and cyclic lookup pages fail before any writes or second external request', async () => {
  for (const next of ['https://evil.invalid/api/data/v9.1/plugintypes', '/loop']) {
    const {service, calls} = fixture({read:c => c.endpoint.startsWith('/plugintypes?') || c.endpoint === '/loop'
      ? {value:[], '@odata.nextLink':next} : undefined});
    const error = await errorPayload(service.register(registration));
    assert.ok(['D365_ENDPOINT_INVALID','D365_PLUGIN_LOOKUP_INCOMPLETE'].includes(error.code));
    assert.equal(calls.some(c => c.endpoint.startsWith('https://evil.invalid')), false);
    assert.equal(writeCalls(calls).length, 0);
  }
});

test('register resolves native references and sends one enabled synchronous step create', async () => {
  const {service, calls} = fixture();
  const result = await service.register({...registration, pluginType:{pluginTypeName:'Company.Test'}, plugin_type:undefined});
  const writes = writeCalls(calls);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].endpoint, '/sdkmessageprocessingsteps');
  assert.equal(writes[0].data['eventhandler_plugintype@odata.bind'], `/plugintypes(${ids.type})`);
  assert.equal(writes[0].data['sdkmessagefilterid@odata.bind'], `/sdkmessagefilters(${ids.filter})`);
  assert.equal(writes[0].data.sdkmessageprocessingstepid, ids.step);
  assert.equal(result.saved, true);
  assert.equal(result.item.secureConfiguration.value, null);
});

test('register secure configuration is allocated once, bound once and never echoed in readback', async () => {
  const {service, calls} = fixture({existing:{...step, configuration:secret,
    sdkmessageprocessingstepsecureconfigid:{secureconfig:secret}}});
  const result = await service.register({...registration, secureConfiguration:secret, unsecureConfiguration:secret});
  const writes = writeCalls(calls);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].endpoint, '/sdkmessageprocessingstepsecureconfigs');
  assert.equal(writes[0].data.secureconfig, secret);
  assert.equal(writes[1].data['sdkmessageprocessingstepsecureconfigid@odata.bind'], `/sdkmessageprocessingstepsecureconfigs(${ids.secure})`);
  assert.equal(writes[1].data.configuration, secret);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(calls.filter(c => c.method === 'GET').some(c => decodeURIComponent(c.endpoint).includes(',secureconfig)')), false);
});

test('register preview resolves the environment/target but never allocates or echoes configuration', async () => {
  const {service, calls} = fixture();
  const result = await service.register({...registration, secure_configuration:secret, unsecure_configuration:secret, dryRun:true});
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.environment, environment);
  assert.deepEqual(result.configurationChanges, {secure:{action:'set'}, unsecure:{action:'set'}});
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(writeCalls(calls).length, 0);
});

test('numeric/named enums and filtering fields normalize and validate against metadata', async () => {
  const {service, calls} = fixture();
  await service.register({...registration, stage:'PostOperation', mode:'Asynchronous', supportedDeployment:'Both',
    filteringAttributes:['Name','name','Telephone1'], impersonatingUserId:ids.other});
  const write = writeCalls(calls)[0];
  assert.equal(write.data.stage, 40);
  assert.equal(write.data.mode, 1);
  assert.equal(write.data.supporteddeployment, 2);
  assert.equal(write.data.filteringattributes, 'name,telephone1');
  assert.equal(write.data['impersonatinguserid@odata.bind'], `/systemusers(${ids.other})`);
  assert.ok(calls.some(c => c.endpoint.includes('/Attributes?')));
});

test('primary-key, unknown and globally scoped filtering fields never reach a write', async () => {
  for (const [field, primary_entity] of [['accountid','account'], ['unknown','account'], ['name',undefined]]) {
    const {service, calls} = fixture();
    await assert.rejects(service.register({...registration, primary_entity, filtering_attributes:[field]}));
    assert.equal(writeCalls(calls).length, 0);
  }
});

test('ambiguous plugin types/messages and disallowed/ambiguous entity filters prevent registration', async () => {
  for (const read of [
    c => c.endpoint.startsWith('/plugintypes?') ? {value:[type,{...type,plugintypeid:ids.other}]} : undefined,
    c => c.endpoint.startsWith('/sdkmessages?') ? {value:[message,{...message,sdkmessageid:ids.other}]} : undefined,
    c => c.endpoint.startsWith('/sdkmessagefilters?') ? {value:[{...filter,iscustomprocessingstepallowed:false}]} : undefined,
    c => c.endpoint.startsWith('/sdkmessagefilters?') ? {value:[filter,{...filter,sdkmessagefilterid:ids.other}]} : undefined,
    c => c.endpoint.startsWith('/plugintypes?') ? {value:[{...type,isworkflowactivity:true}]} : undefined,
    c => c.endpoint.startsWith('/sdkmessages?') ? {value:[{...message,isprivate:true}]} : undefined,
  ]) {
    const {service, calls} = fixture({read});
    await assert.rejects(service.register(registration));
    assert.equal(writeCalls(calls).length, 0);
  }
});

test('register duplicate error and return_existing never write or expose secure values', async () => {
  const duplicate = {...step,sdkmessageprocessingstepsecureconfigid:{secureconfig:secret}};
  const {service, calls} = fixture({duplicates:[duplicate]});
  await assert.rejects(service.register(registration), {code:'D365_PLUGIN_DUPLICATE_STEP'});
  const result = await service.register({...registration, conflictPolicy:'return_existing', secureConfiguration:secret});
  assert.equal(result.created, false);
  assert.equal(result.changed, false);
  assert.equal(result.item.stepId, ids.step);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(writeCalls(calls).length, 0);
});

test('multiple duplicates are never selected arbitrarily by any conflict policy', async () => {
  const {service, calls} = fixture({duplicates:[step,{...step,sdkmessageprocessingstepid:ids.other}]});
  for (const conflict_policy of ['error','return_existing','update_existing']) {
    await assert.rejects(service.register({...registration, conflict_policy}), {code:'D365_PLUGIN_DUPLICATE_AMBIGUOUS'});
  }
  assert.equal(writeCalls(calls).length, 0);
});

test('update_existing preserves omitted optional fields/configuration and uses a specific ETag', async () => {
  const {service, calls} = fixture({duplicates:[step]});
  const result = await service.register({...registration, conflict_policy:'update_existing', rank:5});
  const write = writeCalls(calls)[0];
  assert.equal(result.created, false);
  assert.equal(write.method, 'PATCH');
  assert.deepEqual(write.data, {stage:20,mode:0,rank:5});
  assert.equal(write.options.headers['If-Match'], 'W/"10"');
});

test('plain update keeps configuration, normalizes aliases and changes only requested fields', async () => {
  const {service, calls} = fixture();
  const result = await service.update({stepId:ids.step, patch:{rank:5, supportedDeployment:'ServerOnly', enabled:false,
    impersonatingUserId:null, description:''}});
  const writes = writeCalls(calls);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].data, {rank:5,supporteddeployment:0,statecode:1,statuscode:2,
    'impersonatinguserid@odata.bind':null,description:''});
  assert.equal(result.saved, true);
});

test('keep-only update is a genuine no-op with no concurrency probe or write', async () => {
  const {service, calls} = fixture();
  const result = await service.update({step_id:ids.step, secure_configuration:{action:'keep'}, unsecure_configuration:{action:'keep'}});
  assert.equal(result.changed, false);
  assert.equal(calls.length, 1);
  assert.equal(writeCalls(calls).length, 0);
});

test('secure set replaces rather than edits a shared config and returns the retained old ID', async () => {
  const {service, calls} = fixture();
  const result = await service.update({step_id:ids.step, patch:{rank:7}, secure_configuration:{action:'set',value:secret}});
  const writes = writeCalls(calls);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].data.sdkmessageprocessingstepsecureconfigid, ids.step);
  assert.equal(writes[1].method, 'PATCH');
  assert.equal(writes[1].data.rank, 7);
  assert.equal(writes[1].data['sdkmessageprocessingstepsecureconfigid@odata.bind'], `/sdkmessageprocessingstepsecureconfigs(${ids.step})`);
  assert.deepEqual(result.retainedSecureConfigIds, [ids.old]);
  assert.equal(writes.some(c => c.method === 'DELETE' || c.endpoint === `/sdkmessageprocessingstepsecureconfigs(${ids.old})`), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('clear unbinds secure config and clears unsecure config in one conditional PATCH without deleting', async () => {
  const {service, calls} = fixture();
  await service.update({step_id:ids.step, secureConfiguration:{action:'clear'}, unsecureConfiguration:{action:'clear'}});
  const writes = writeCalls(calls);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].data, {configuration:null,'sdkmessageprocessingstepsecureconfigid@odata.bind':null});
  assert.equal(writes[0].options.headers['If-Match'], 'W/"10"');
});

test('empty secure/unsecure strings deliberately set content; keep/clear cannot carry a value', async () => {
  const {service, calls} = fixture();
  await service.update({step_id:ids.step, secure_configuration:{action:'set',value:''}, unsecure_configuration:{action:'set',value:''}});
  assert.equal(writeCalls(calls)[0].data.secureconfig, '');
  assert.equal(writeCalls(calls)[1].data.configuration, '');
  for (const action of ['keep','clear']) await assert.rejects(service.update({step_id:ids.step, secure_configuration:{action,value:secret}}), {code:'D365_PLUGIN_INVALID'});
});

test('update preview is read-only, includes environment and never exposes configuration or its hash', async () => {
  const {service, calls} = fixture();
  const result = await service.update({step_id:ids.step, patch:{rank:8}, secure_configuration:{action:'set',value:secret},
    unsecure_configuration:{action:'set',value:secret}, dry_run:true});
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.changes.rank, {before:1,after:8});
  assert.equal(result.ifMatch, 'W/"10"');
  assert.deepEqual(result.environment, environment);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes('sha256'), false);
  assert.equal(writeCalls(calls).length, 0);
});

test('a stale supplied ETag fails before secure allocation', async () => {
  const {service, calls} = fixture();
  await assert.rejects(service.update({step_id:ids.step, ifMatch:'W/"9"', secureConfiguration:{action:'set',value:secret}}), {code:'D365_CONCURRENCY_CONFLICT'});
  assert.equal(writeCalls(calls).length, 0);
});

test('server 412 after config allocation retains the new row and reports step not saved', async () => {
  const {service, calls} = fixture({write:c => {
    if (c.method === 'PATCH') throw new CrmRequestError('D365_CONCURRENCY_CONFLICT', secret, {status:412,outcome:'rejected'});
    return undefined;
  }});
  const error = await errorPayload(service.update({step_id:ids.step, secure_configuration:{action:'set',value:secret}}));
  assert.equal(error.status, 412);
  assert.equal(error.data.phase, 'step_write');
  assert.equal(error.data.saved, false);
  assert.equal(error.data.secureConfiguration.created, true);
  assert.equal(error.data.secureConfiguration.binding, 'not_applied');
  assert.equal(JSON.stringify(error).includes(secret), false);
  assert.equal(writeCalls(calls).length, 2);
});

test('unsupported/unknown table concurrency stops writes unless unprotected update was explicit', async () => {
  for (const concurrency of [false, null]) {
    const {service, calls} = fixture({concurrency});
    await assert.rejects(service.update({step_id:ids.step, patch:{rank:2}}), {code:'D365_PLUGIN_CONCURRENCY_UNSUPPORTED'});
    assert.equal(writeCalls(calls).length, 0);
  }
  const {service, calls} = fixture({concurrency:false});
  const result = await service.update({step_id:ids.step, patch:{rank:2}, allowUnprotectedUpdate:true});
  assert.equal(result.concurrencyProtected, false);
  assert.equal(writeCalls(calls)[0].options.headers['If-Match'], '*');
  await assert.rejects(service.update({step_id:ids.step, patch:{rank:2}, allow_unprotected_update:true, if_match:'W/"10"'}), {code:'D365_PLUGIN_CONCURRENCY_UNSUPPORTED'});
});

test('missing ETag on a supported table stops an update before allocation', async () => {
  const {service, calls} = fixture({existing:{...step,'@odata.etag':undefined}});
  await assert.rejects(service.update({step_id:ids.step, secure_configuration:{action:'set',value:secret}}), {code:'D365_PLUGIN_ETAG_REQUIRED'});
  assert.equal(writeCalls(calls).length, 0);
});

test('preview still explains changes and write blockers on tables without confirmed concurrency', async () => {
  const {service, calls} = fixture({concurrency:false});
  const result = await service.update({step_id:ids.step,patch:{rank:2},dry_run:true});
  assert.equal(result.dryRun, true);
  assert.equal(result.canWrite, false);
  assert.equal(result.blockedBy, 'D365_PLUGIN_CONCURRENCY_UNSUPPORTED');
  assert.deepEqual(result.changes.rank, {before:1,after:2});
  assert.equal(writeCalls(calls).length, 0);
});

test('secure create failures preserve exact phase and never create/patch the step', async () => {
  for (const outcome of ['rejected','unknown','not_sent']) {
    const {service, calls} = fixture({write:c => {
      if (c.endpoint === '/sdkmessageprocessingstepsecureconfigs') throw new CrmRequestError('D365_HTTP_ERROR', secret, {status:outcome === 'unknown' ? 500 : 403,outcome});
      return undefined;
    }});
    const error = await errorPayload(service.register({...registration, secure_configuration:secret}));
    assert.equal(error.data.phase, 'secure_configuration_create');
    assert.equal(error.data.saved, false);
    assert.equal(error.data.secureConfiguration.id, ids.secure);
    assert.equal(error.data.secureConfiguration.created, outcome === 'unknown' ? 'unknown' : false);
    assert.equal(writeCalls(calls).length, 1);
    assert.equal(JSON.stringify(error).includes(secret), false);
  }
});

test('step write timeout preserves IDs and unknown binding without rollback or replay', async () => {
  const {service, calls} = fixture({write:c => {
    if (c.endpoint === '/sdkmessageprocessingsteps') throw new CrmRequestError('D365_REQUEST_TIMEOUT', secret, {outcome:'unknown'});
    return undefined;
  }});
  const error = await errorPayload(service.register({...registration, secure_configuration:secret}));
  assert.equal(error.data.saved, 'unknown');
  assert.equal(error.data.stepId, ids.step);
  assert.equal(error.data.secureConfiguration.id, ids.secure);
  assert.equal(error.data.secureConfiguration.created, true);
  assert.equal(error.data.secureConfiguration.binding, 'unknown');
  assert.equal(error.retryable, false);
  assert.equal(writeCalls(calls).length, 2);
  assert.equal(writeCalls(calls).some(c => c.method === 'DELETE'), false);
});

test('successful write plus failed readback retains saved=true and does not attempt compensation', async () => {
  let failed = false;
  const {service, calls} = fixture({write:() => { failed = true; return reply(); }, read:c => {
    if (failed && c.endpoint.startsWith('/sdkmessageprocessingsteps?')) throw new CrmRequestError('D365_HTTP_ERROR', secret, {status:403,outcome:'rejected'});
    return undefined;
  }});
  const error = await errorPayload(service.register(registration));
  assert.equal(error.data.phase, 'readback');
  assert.equal(error.data.saved, true);
  assert.equal(error.data.stepId, ids.step);
  assert.equal(writeCalls(calls).length, 1);
});

test('readback detects an unconfirmed secure binding without deleting either configuration row', async () => {
  let written = false;
  const {service, calls} = fixture({write:c => {
    if (c.method === 'PATCH') written = true;
    return undefined;
  }, read:c => written && c.endpoint.startsWith('/sdkmessageprocessingsteps?') ? {value:[step]} : undefined});
  const error = await errorPayload(service.update({step_id:ids.step, secure_configuration:{action:'set',value:secret}}));
  assert.equal(error.data.phase, 'readback');
  assert.equal(error.data.saved, true);
  assert.equal(error.data.secureConfiguration.created, true);
  assert.equal(error.data.secureConfiguration.binding, 'not_confirmed');
  assert.equal(error.data.reconciliationRequired, true);
  assert.equal(writeCalls(calls).length, 2);
  assert.equal(calls.some(c => c.method === 'DELETE'), false);
});

test('a submitted configuration is redacted even if it appears in a valid-shaped request ID', async () => {
  const {service} = fixture({write:() => {
    throw new CrmRequestError('D365_HTTP_ERROR', ids.other, {status:403,outcome:'rejected',requestId:ids.other,platformCode:'0x80040220'});
  }});
  const error = await errorPayload(service.register({...registration, secure_configuration:ids.other}));
  assert.equal(error.requestId, '[REDACTED]');
  assert.equal(error.platformCode, '0x80040220');
  assert.equal(JSON.stringify(error).includes(ids.other), false);
});

test('successful empty create responses use the submitted ID; body and trusted header IDs must agree', async () => {
  for (const format of ['body','header','empty']) {
    const {service} = fixture({write:c => c.endpoint === '/sdkmessageprocessingsteps'
      ? format === 'body' ? reply({sdkmessageprocessingstepid:ids.step})
        : format === 'header' ? reply(null, {'odata-entityid':environment.orgUrl + `/api/data/v9.1/sdkmessageprocessingsteps(${ids.step})`}) : reply()
      : undefined});
    assert.equal((await service.register(registration)).saved, true);
  }
  const {service, calls} = fixture({write:() => reply({sdkmessageprocessingstepid:ids.other})});
  const error = await errorPayload(service.register(registration));
  assert.equal(error.data.saved, true);
  assert.equal(error.data.phase, 'step_write');
  assert.equal(writeCalls(calls).length, 1);
});

test('an external create-ID header is rejected while preserving successful-save evidence', async () => {
  const {service, calls} = fixture({write:() => reply(null, {'odata-entityid':`https://evil.invalid/api/data/v9.1/sdkmessageprocessingsteps(${ids.step})`})});
  const error = await errorPayload(service.register(registration));
  assert.equal(error.data.saved, true);
  assert.equal(error.data.phase, 'step_write');
  assert.equal(writeCalls(calls).length, 1);
  assert.equal(calls.some(c => c.endpoint.startsWith('https://evil.invalid')), false);
});

test('stage/mode update validates the combined state and prevents a new duplicate signature', async () => {
  const {service, calls} = fixture({duplicates:[{...step,sdkmessageprocessingstepid:ids.other}]});
  await assert.rejects(service.update({step_id:ids.step, patch:{mode:1}}), {code:'D365_PLUGIN_INVALID'});
  await assert.rejects(service.update({step_id:ids.step, patch:{stage:40,mode:1}}), {code:'D365_PLUGIN_DUPLICATE_STEP'});
  assert.equal(writeCalls(calls).length, 0);
});

test('malformed inputs, aliases and mutation actions fail locally without leaking their values', async () => {
  const {service, calls} = fixture();
  for (const args of [null, [], {step_id:'bad'}, {step_id:ids.step,stepId:ids.other},
    {step_id:ids.step,patch:{rank:0}}, {step_id:ids.step,patch:{enabled:'false'}},
    {step_id:ids.step,if_match:'*'}, {step_id:ids.step,if_match:'W/"1"\r\nX: y'},
    {step_id:ids.step,patch:{unknown:secret}}, {step_id:ids.step,secure_configuration:{action:'invalid',value:secret}},
    {step_id:ids.step,secure_configuration:{action:'set'}}, {step_id:ids.step,secure_configuration:{action:'set',value:1}},
    {step_id:ids.step,dry_run:'true'}, {step_id:ids.step,allow_unprotected_update:'true'},
  ]) {
    const error = await errorPayload(service.update(args));
    assert.equal(error.code, 'D365_PLUGIN_INVALID');
    assert.equal(JSON.stringify(error).includes(secret), false);
  }
  for (const args of [{...registration,stage:10,mode:1}, {...registration,rank:1.5}, {...registration,filteringAttributes:['bad-name']},
    {...registration,secure_configuration:{}}, {...registration,plugin_type:{}}, {...registration,conflictPolicy:'wrong'},
    {...registration,plugin_type:{id:'bad'}}, {...registration,primary_entity:'bad/table'}]) {
    await assert.rejects(service.register(args), {code:'D365_PLUGIN_INVALID'});
  }
  assert.equal(calls.length, 0);
});

test('equivalent nested aliases accept different key order and camel/snake spelling', async () => {
  const {service, calls} = fixture();
  const result = await service.register({...registration, dry_run:true,
    plugin_type:{id:ids.type,plugin_type_name:'Company.Test'},
    pluginType:{pluginTypeName:'Company.Test',id:ids.type}});
  assert.equal(result.dryRun, true);
  assert.equal(writeCalls(calls).length, 0);
});

test('malformed native responses and 401/403 remain errors instead of empty success or version fallback', async () => {
  for (const value of [null, {}, {value:42}, {value:[null]}]) {
    const {service} = fixture({read:() => value});
    await assert.rejects(service.metadata({}), {code:'D365_PLUGIN_RESPONSE_INVALID'});
  }
  for (const status of [401,403]) {
    const {service, calls} = fixture({read:() => { throw new CrmRequestError('D365_HTTP_ERROR', secret, {status,platformCode:'0x80040220'}); }});
    const error = await errorPayload(service.query({includeSecureConfiguration:true}));
    assert.equal(error.status, status);
    assert.equal(error.platformCode, '0x80040220');
    assert.equal(JSON.stringify(error).includes(secret), false);
    assert.equal(calls.length, 1);
  }
});

test('all four schemas compile and accept both legacy and canonical forms without default alias injection', () => {
  const ajv = new Ajv({strict:false,useDefaults:true});
  const examples = {
    d365_plugin_registration_metadata:[{}, {pluginTypeName:'Company.Test'}],
    d365_plugin_steps_query:[{}, {stepId:ids.step,includeSecureConfiguration:false}],
    d365_plugin_step_register:[registration,{pluginType:{pluginTypeName:'Company.Test'},message:'Update',stage:'PreOperation',mode:'Synchronous',rank:1}],
    d365_plugin_step_update:[{step_id:ids.step,secure_configuration:{action:'set',value:secret}},
      {stepId:ids.step,patch:{supportedDeployment:'ServerOnly'},secureConfiguration:{action:'clear'}}],
  };
  for (const tool of pluginStepTools) {
    const validate = ajv.compile(tool.inputSchema);
    for (const input of examples[tool.name]) assert.equal(validate(input), true, JSON.stringify(validate.errors));
    assert.equal(validate({unknown:secret}), false);
  }
});

test('the MCP routes each plugin tool to the configured shared client', async t => {
  const settings = {AUTH_TYPE:'online', ORG_URL:'https://crm.invalid', ENVIRONMENT_URL:'https://crm.invalid',
    CLIENT_ID:'offline',CLIENT_SECRET:'offline',TENANT_ID:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]]));
  const f = fixture();
  t.mock.method(D365AuthService.prototype, 'makeRequest', (...args) => f.client.makeRequest(...args));
  t.mock.method(D365AuthService.prototype, 'requestWithResponse', (...args) => f.client.requestWithResponse(...args));
  Object.assign(process.env, settings);
  try {
    assert.equal((await handleToolCall('d365_plugin_registration_metadata', {})).success, true);
    assert.equal((await handleToolCall('d365_plugin_steps_query', {})).success, true);
    assert.equal((await handleToolCall('d365_plugin_step_register', {...registration,dryRun:true})).dryRun, true);
    assert.equal((await handleToolCall('d365_plugin_step_update', {stepId:ids.step,patch:{rank:2},dryRun:true})).dryRun, true);
    assert.equal(writeCalls(f.calls).length, 0);
  } finally {
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Online, NTLM and IFD execute the same bounded native plugin registration through the real request layer', async t => {
  const configurations = [
    {AUTH_TYPE:'online',ORG_URL:'https://crm.invalid/Demo',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'},
    {AUTH_TYPE:'op_ad',ORG_URL:'http://crm.invalid/Demo',AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline'},
    {AUTH_TYPE:'op_ifd',ORG_URL:'https://crm.invalid/Demo',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'},
  ];
  const token = t.mock.method(axios, 'post', async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const env of configurations) {
    CacheService.flushExisting();
    const f = fixture();
    const client = new D365AuthService(readConfig({...env,API_VERSION:'v9.1'}));
    const requests = [];
    client.getAxiosInstance().defaults.adapter = async config => {
      requests.push(config);
      const endpoint = new URL(config.url).pathname.replace('/Demo/api/data/v9.1', '') + new URL(config.url).search;
      let result;
      if (config.method.toUpperCase() === 'GET') result = reply(await f.client.makeRequest(endpoint), {}, 200);
      else result = await f.client.requestWithResponse(endpoint, config.method.toUpperCase(), JSON.parse(config.data), {headers:{}});
      return {config, status:result.status,statusText:String(result.status),data:result.data,headers:new AxiosHeaders(result.headers)};
    };
    const generated = [ids.step,ids.secure];
    const service = new PluginStepService(client, {...environment,orgUrl:env.ORG_URL,authType:env.AUTH_TYPE}, () => generated.shift());
    const before = token.mock.callCount();
    const result = await service.register({...registration,secure_configuration:secret});
    assert.equal(result.saved, true);
    assert.equal(result.item.stepId, ids.step);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(requests.filter(c => c.method.toUpperCase() === 'POST').length, 2);
    assert.equal(token.mock.callCount() - before, env.AUTH_TYPE === 'op_ad' ? 0 : 1);
    for (const request of requests) {
      if (env.AUTH_TYPE !== 'op_ad') assert.equal(request.headers.get('Authorization'), 'Bearer offline-token');
      assert.equal(new URL(request.url).origin, new URL(env.ORG_URL).origin);
      assert.equal(request.maxRedirects, 0);
    }
  }
});
