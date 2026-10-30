const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const readline = require('node:readline');
const root = __dirname;

async function main() {
  assert.equal(process.platform, 'win32', 'This portable package requires Windows.');
  assert.equal(process.arch, 'x64', 'This portable package requires an x64 runtime.');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const file of manifest.files) {
    const target = path.resolve(root, file.path);
    assert.ok(target.startsWith(root + path.sep), 'Invalid manifest path.');
    const bytes = fs.readFileSync(target);
    assert.equal(bytes.length, file.size, 'File size mismatch: ' + file.path);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256, 'Hash mismatch: ' + file.path);
  }
  console.log('OK: package file hashes (' + manifest.files.length + ' files)');
  console.log('OK: bundled Node.js ' + process.version);
  const dotnet = path.join(root, 'runtime', 'dotnet', 'dotnet.exe');
  const probe = spawnSync(dotnet, ['--list-runtimes'], {windowsHide:true, encoding:'utf8', timeout:15000,
    env:{...process.env, DOTNET_ROOT:path.dirname(dotnet), DOTNET_ROOT_X64:path.dirname(dotnet)}});
  assert.equal(probe.status, 0, 'Bundled .NET runtime did not start.');
  assert.match(probe.stdout, /Microsoft\.NETCore\.App 10\./, 'Bundled .NET 10 runtime was not found.');
  console.log('OK: bundled .NET 10 runtime');

  const child = spawn(process.execPath, [path.join(root, 'launch.cjs')], {
    cwd:process.env.TEMP || root, windowsHide:true, stdio:['pipe','pipe','pipe'],
    env:{...process.env, PATH:'', DOTENV_CONFIG_DEBUG:'false'},
  });
  const pending = new Map();let sequence = 0;let protocolError;
  const lines = readline.createInterface({input:child.stdout});
  const fail = error => {protocolError = error;for (const item of pending.values()) item.reject(error);pending.clear();};
  child.on('error', () => fail(new Error('Packaged server could not start.')));
  child.on('close', () => fail(new Error('Packaged server closed before the local check completed.')));
  child.stderr.on('data', () => {});
  lines.on('line', line => {
    let message;
    try {message = JSON.parse(line);} catch {fail(new Error('Unexpected non-protocol output on stdout.'));return;}
    const item = pending.get(message.id);
    if (item) {pending.delete(message.id);message.error ? item.reject(new Error('MCP request rejected.')) : item.resolve(message.result);}
  });
  function call(method, params) {
    if (protocolError) return Promise.reject(protocolError);
    const id = ++sequence;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {pending.delete(id);reject(new Error('Local MCP check timed out.'));}, 20000);
      pending.set(id, {resolve:value=>{clearTimeout(timer);resolve(value);}, reject:error=>{clearTimeout(timer);reject(error);}});
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params}) + '\n');
    });
  }
  try {
    const initialized = await call('initialize', {protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'portable-local-check',version:'1.0.0'}});
    assert.equal(initialized.serverInfo.name, 'dynamics365-mcp-server');
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const list = await call('tools/list', {});
    assert.equal(list.tools.length, manifest.toolCount, 'Unexpected tool inventory.');
    assert.equal(new Set(list.tools.map(tool=>tool.name)).size, manifest.toolCount);
    console.log('OK: MCP initialization and ' + list.tools.length + ' tools');
    const bytes = fs.readFileSync(path.join(root, 'app', 'bin', 'assembly-inspector', 'AssemblyInspector.dll'));
    const result = await call('tools/call', {name:'d365_plugin_assembly_inspect',arguments:{content_base64:bytes.toString('base64')}});
    assert.notEqual(result.isError, true, 'Packaged assembly inspection failed.');
    const inspected = JSON.parse(result.content.find(part=>part.type==='text').text);
    assert.equal(inspected.inspection.name, 'AssemblyInspector');
    assert.equal(inspected.inspection.codeExecuted, false);
    console.log('OK: local DLL metadata inspection using bundled .NET');
  } finally {
    lines.close();
    child.stdin.end();
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => {child.kill();resolve();}, 3000);
      child.once('close', () => {clearTimeout(timer);resolve();});
    });
  }
  console.log(fs.existsSync(path.join(root,'.env'))
    ? 'Configuration: .env exists. CRM authentication and network access are checked when CRM tools are called.'
    : 'Next: run configure.cmd, fill in your CRM settings, then run generate-client-config.cmd.');
  console.log('Local checks passed. No CRM request was sent.');
}
main().catch(error => {console.error('CHECK FAILED: ' + error.message);process.exitCode=1;});
