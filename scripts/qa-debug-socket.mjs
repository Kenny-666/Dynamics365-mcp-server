// Localhost-only debugger transport smoke test. Child CRM access is disabled.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import http from 'node:http';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
const cwd=await mkdtemp(join(tmpdir(),'d365-debug-qa-'));
assert.equal(dirname(resolve(cwd)),resolve(tmpdir()));assert.ok(basename(cwd).startsWith('d365-debug-qa-'));
const env={...process.env,AUTH_TYPE:'online',ORG_URL:'',ENVIRONMENT_URL:'',TENANT_ID:'',CLIENT_ID:'',CLIENT_SECRET:''};
const child=spawn(process.execPath,['--require',join(root,'tests/fixtures/deny-network.cjs'),'--import',pathToFileURL(require.resolve('tsx')).href,join(root,'src/debug/server.ts')],{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',()=>{});
function request(url,{method='GET',body,headers={}}={}){return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:3000,path:url,method,headers:{host:'localhost:3000',...headers},timeout:3000},res=>{let text='';res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,body:text}));});
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Local request timeout')));req.end(body);
});}
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clearInterval(poll);reject(Error('Debugger startup timeout'));},10000);const poll=setInterval(()=>{if(output.includes('Debug GUI is running')){clearInterval(poll);clearTimeout(timer);resolve();}else if(child.exitCode!==null){clearInterval(poll);clearTimeout(timer);reject(Error('Debugger exited before listening'));}},25);});
  assert.equal((await request('/')).status,200);
  assert.equal((await request('/',{method:'HEAD'})).body,'');
  assert.equal(JSON.parse((await request('/api/tools')).body).length,84);
  assert.equal((await request('/api/tools',{headers:{origin:'https://example.invalid'}})).status,403);
  assert.equal((await request('/api/call',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);
  const invalid=await request('/api/call',{method:'POST',headers:{'content-type':'application/json'},body:'{"fake_secret":"QA_MARKER"'});assert.equal(invalid.status,400);assert.ok(!invalid.body.includes('QA_MARKER'));
  assert.equal((await request('/api/call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'unknown_tool'})})).status,404);
  assert.equal((await request('/api/call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'clear_server_cache'})})).status,200);
  assert.equal((await request('/index.html:stream')).status,404);
  assert.equal((await request('/%2e%2e/server.ts')).status,404);
  console.log(JSON.stringify({node:process.version,transport:'real localhost TCP/HTTP',checks:10,passed:10,crm:'disabled by blank configuration and child network guard'},null,2));
} finally {
  child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('close',resolve);});
  await rm(cwd,{recursive:true,force:true});
}
