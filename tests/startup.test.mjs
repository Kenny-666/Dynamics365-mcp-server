import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
const entry = resolve(process.env.D365_SMOKE_ENTRY || join(projectRoot, manifest.main));
const guard = join(projectRoot, 'tests/fixtures/deny-network.cjs');
const expectedTools = [
  'import_ribbon_solution','publish_ribbon_solution','verify_ribbon_deployment',
  'get_ribbon_definition','inspect_ribbon_solution','edit_ribbon_solution',
  'get_solution_snapshot','compare_solution_snapshots','verify_solution_deployment','get_solution_import_log',
  'inspect_solution_package','export_solution','import_solution_async','get_solution_import_status',
  'list_solutions','list_solution_components','get_solution_component_dependencies','add_solution_component',
  'get_api_operation',
  'update_model_column_settings','update_model_relationship','reactivate_model_key',
  'd365_plugin_assembly_inspect','d365_plugin_assemblies_query','d365_plugin_assembly_update',
  'd365_plugin_images_query','d365_plugin_image_register','d365_plugin_image_update','d365_plugin_image_delete',
  'list_model_ui_components','get_model_ui_component','edit_model_form','edit_model_view',
  'get_model_choices','create_model_choices','change_model_choice_value','publish_model_choices',
  'get_model_relationship','create_model_relationship','get_model_key','create_model_key',
  'get_model_definition','create_model_table','create_model_column','update_model_labels','publish_model_table',
  'get_diagnostic_settings','query_plugin_trace_logs','query_failed_system_jobs','diagnose_plugin_failure',
  'query_security_principals','get_principal_security_context','get_record_access','get_record_audit_history','get_audit_details',
  'upsert_record_by_key','associate_records','disassociate_records',
  'execute_record_batch','execute_record_transaction',
  'd365_plugin_registration_metadata', 'd365_plugin_steps_query',
  'd365_plugin_step_register', 'd365_plugin_step_update',
  'search_web_resources_by_name', 'create_web_resource_and_publish',
  'update_web_resource_and_publish', 'publish_web_resource',
  'get_environment_capabilities',
  'get_entity_metadata_summary', 'get_field_picklist_options', 'get_entity_navigation_links',
  'preview_fetchxml_query', 'query_by_fetchxml', 'clear_server_cache', 'get_current_user_context',
  'list_all_entity_definitions', 'search_records_by_odata', 'get_record_by_id',
  'create_new_record', 'update_existing_record', 'delete_record_by_id',
  'call_d365_api_action', 'get_detailed_field_metadata',
].sort();

async function withServer(settings, run, options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'd365-mcp-startup-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(TENANT_ID|CLIENT_ID|CLIENT_SECRET|ENVIRONMENT_URL|ORG_URL|AUTH_TYPE|API_VERSION|CACHE_TTL|CACHE_TTL_SECONDS|REQUEST_TIMEOUT_MS|MAX_READ_RETRIES|MAX_RETRY_DELAY_MS|AD_.*|IFD_.*|DOTENV_.*|NODE_OPTIONS)$/i.test(key) &&
    !(options.emptyPath && key.toLowerCase() === 'path')));
  const client = new Client({name:'startup-test', version:'1.0.0'});
  const transport = new StdioClientTransport({
    command:process.execPath,
    args:['--require', guard, options.entry || entry],
    cwd,
    env:{...env, ...(options.emptyPath ? {PATH:''} : {}), ...settings},
    stderr:'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  try {
    if (options.dotenv) await writeFile(join(cwd, '.env'), options.dotenv);
    await client.connect(transport);
    await run(client);
    assert.ok(!stderr.includes('UNEXPECTED_NETWORK_REQUEST_IN_STARTUP_TEST'), stderr);
  } finally {
    await client.close();
    // cwd is a freshly created temporary directory owned by this test.
    await rm(cwd, {recursive:true, force:true});
  }
}

async function assertToolInventory(client) {
  const result = await client.listTools();
  assert.deepEqual(result.tools.map(tool => tool.name).sort(), expectedTools);
}

test('local assembly metadata inspection works without CRM configuration using packaged reader', {timeout:20000},async()=>{
  const bytes=await readFile(join(projectRoot,'tests/fixtures/assemblies/updated.dll'));
  await withServer({},async client=>{
    const result=await client.callTool({name:'d365_plugin_assembly_inspect',arguments:{content_base64:bytes.toString('base64')}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    const payload=JSON.parse(result.content[0].text);assert.equal(payload.inspection.name,'FixturePlugin');
    assert.equal(payload.inspection.version,'1.2.1.0');assert.equal(payload.inspection.codeExecuted,false);
    assert.equal(payload.inspection.cryptographicSignatureVerified,false);
  });
});

test('local solution ZIP inspection runs from packaged server without CRM settings or external runtimes', {timeout:15000},async()=>{
  const bytes=await readFile(join(projectRoot,'tests/fixtures/solutions/transfer-demo.zip'));
  await withServer({},async client=>{
    const result=await client.callTool({name:'inspect_solution_package',arguments:{content_base64:bytes.toString('base64')}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    const payload=JSON.parse(result.content[0].text);assert.equal(payload.package.manifest.uniqueName,'TransferDemo');
    assert.equal(payload.package.validation.executed,false);assert.equal(payload.package.validation.extracted,false);
    assert.equal(payload.package.manifest.managed,false);
  },{emptyPath:true});
});

test('offline snapshot comparison runs from packaged server without CRM configuration or external PATH', {timeout:15000},async()=>{
  const snapshot=JSON.parse(await readFile(join(projectRoot,'tests/fixtures/solutions/snapshot-v1.json'),'utf8'));
  await withServer({},async client=>{
    const result=await client.callTool({name:'compare_solution_snapshots',arguments:{source_snapshot:snapshot,target_snapshot:snapshot}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    const payload=JSON.parse(result.content[0].text);assert.equal(payload.selectedScopeCheck,'matched');
    assert.equal(payload.matched.length,5);assert.equal(payload.deploymentVerified,false);
  },{emptyPath:true});
});

test('packaged Ribbon editor previews and creates a local ZIP without CRM configuration or external PATH', {timeout:15000},async()=>{
  const bytes=await readFile(join(projectRoot,'tests/fixtures/solutions/ribbon-demo.zip')),outputDir=await mkdtemp(join(tmpdir(),'d365-ribbon-package-'));
  try {
    await withServer({},async client=>{
      const args={content_base64:bytes.toString('base64'),logical_name:'demo_table',output_path:join(outputDir,'candidate.zip'),changes:[{operation:'update_button',button_id:'demo.table.Existing',labels:[{language_code:2052,text:'已更新按钮'}]}]};
      const preview=await client.callTool({name:'edit_ribbon_solution',arguments:args});assert.notEqual(preview.isError,true,JSON.stringify(preview));const p=JSON.parse(preview.content[0].text);assert.equal(p.dryRun,true);assert.equal(p.localSaved,false);
      const saved=await client.callTool({name:'edit_ribbon_solution',arguments:{...args,dry_run:false,expected_hash:p.planHash}});assert.notEqual(saved.isError,true,JSON.stringify(saved));const result=JSON.parse(saved.content[0].text);
      assert.equal(result.localSaved,true);assert.equal(result.crmChanged,false);assert.equal(result.imported,false);assert.equal(result.published,false);
      const inspected=await client.callTool({name:'inspect_ribbon_solution',arguments:{file_path:args.output_path,logical_name:'demo_table',include_xml:true}});assert.notEqual(inspected.isError,true,JSON.stringify(inspected));assert.match(JSON.parse(inspected.content[0].text).ribbonDiffXml,/已更新按钮/);
    },{emptyPath:true});
  } finally {await rm(outputDir,{recursive:true,force:true});}
});

for (const authType of ['online', 'op_ad', 'op_ifd']) {
  test(`${authType}: discover tools without settings; CRM calls return actionable config errors`, {timeout:15000}, async () => {
    await withServer({AUTH_TYPE:authType}, async client => {
      await assertToolInventory(client);
      const result = await client.callTool({name:'get_current_user_context', arguments:{}});
      assert.equal(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.equal(payload.code, 'D365_CONFIG_INVALID');
      assert.match(payload.error, /ORG_URL/);
      assert.doesNotMatch(payload.error, /TypeError|replace|undefined/);
      await assertToolInventory(client);
    });
  });
}

test('local cache clear works even when CRM settings are invalid', {timeout:15000}, async () => {
  await withServer({AUTH_TYPE:'invalid', CACHE_TTL:'invalid'}, async client => {
    const result = await client.callTool({name:'clear_server_cache', arguments:{}});
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).success, true);
  });
});

for (const settings of [{
  TENANT_ID:'offline', CLIENT_ID:'offline', CLIENT_SECRET:'offline-placeholder',
  ENVIRONMENT_URL:'https://crm.invalid',
}, {
  AUTH_TYPE:'op_ad', ORG_URL:'http://crm.invalid/Demo',
  AD_USERNAME:'offline', AD_PASSWORD:'offline-placeholder', AD_DOMAIN:'OFFLINE',
}, {
  AUTH_TYPE:'op_ifd', ORG_URL:'https://crm.invalid', IFD_ADFS_URL:'https://adfs.invalid',
  IFD_CLIENT_ID:'offline', IFD_USERNAME:'offline', IFD_PASSWORD:'offline-placeholder',
}]) {
  test(`${settings.AUTH_TYPE || 'online'}: configured discovery does not open a CRM connection`, {timeout:15000}, async () => {
    await withServer(settings, assertToolInventory);
  });
}

test('dotenv does not write startup banners into the MCP protocol stream', {timeout:15000}, async () => {
  await withServer({}, assertToolInventory, {dotenv:'AUTH_TYPE=op_ifd\nIFD_CLIENT_SECRET=offline-placeholder\n'});
});

test('CLI uses the running Node process even when node is absent from PATH', {timeout:15000}, async () => {
  await withServer({}, assertToolInventory, {
    entry:resolve(process.env.D365_SMOKE_BIN || join(projectRoot, manifest.bin['dynamics365-mcp-server'])),
    emptyPath:true,
  });
});

test('unknown tools are distinguished from missing CRM configuration', {timeout:15000}, async () => {
  await withServer({}, async client => {
    const result = await client.callTool({name:'not_a_tool', arguments:{}});
    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.match(payload.error, /Unknown tool/);
    assert.equal(payload.code, undefined);
  });
});
