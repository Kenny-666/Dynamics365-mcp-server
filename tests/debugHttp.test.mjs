import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

// Exercise the actual HTTP handler in-process: no socket or external CRM access.
test('debugger HTTP routes preserve protocol, input privacy and request limits',async t=>{
  let handler;
  t.mock.method(http,'createServer',callback=>{handler=callback;return {listen(){}};});
  const settings={AUTH_TYPE:'online',ORG_URL:'',ENVIRONMENT_URL:'',TENANT_ID:'',CLIENT_ID:'',CLIENT_SECRET:''};
  const previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));Object.assign(process.env,settings);
  try{
    await import('../src/debug/server.ts');assert.equal(typeof handler,'function');
    const invoke=({url='/',method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
      const request=Object.assign(new EventEmitter(),{url,method,headers:{host:'localhost:3000',...headers}}),responseHeaders={};
      let status=200,ended=false;const timer=setTimeout(()=>reject(Error('HTTP handler did not finish')),3000);
      const response={setHeader(key,value){responseHeaders[key.toLowerCase()]=value;},writeHead(code,values={}){status=code;for(const [key,value]of Object.entries(values))responseHeaders[key.toLowerCase()]=value;},
        end(value){if(ended)return;ended=true;clearTimeout(timer);resolve({status,headers:responseHeaders,body:value===undefined?'':String(value)});}};
      Promise.resolve(handler(request,response)).catch(error=>{clearTimeout(timer);reject(error);});
      if(body!==undefined)request.emit('data',Buffer.isBuffer(body)?body:Buffer.from(body));request.emit('end');
    });
    await t.test('tool inventory is returned as JSON with a no-sniff header',async()=>{
      const r=await invoke({url:'/api/tools'}),items=JSON.parse(r.body);assert.equal(r.status,200);assert.equal(items.length,84);assert.equal(new Set(items.map(i=>i.name)).size,84);assert.equal(r.headers['x-content-type-options'],'nosniff');
    });
    await t.test('static GET and HEAD return the UI without a body on HEAD',async()=>{
      const get=await invoke(),head=await invoke({method:'HEAD'});assert.equal(get.status,200);assert.match(get.body,/<html/i);assert.equal(head.status,200);assert.equal(head.body,'');assert.match(get.headers['content-type'],/text\/html/);
    });
    await t.test('same-origin cache clear works without CRM and missing config stays structured',async()=>{
      const clear=await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3000'},body:JSON.stringify({name:'clear_server_cache',arguments:{}})});assert.equal(clear.status,200);assert.equal(JSON.parse(clear.body).success,true);
      const missing=await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'get_current_user_context',arguments:{}})});assert.equal(JSON.parse(missing.body).code,'D365_CONFIG_INVALID');
    });
    await t.test('local ZIP inspection succeeds through the actual handler',async()=>{
      const bytes=await readFile(new URL('./fixtures/solutions/ribbon-demo.zip',import.meta.url)),r=await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'inspect_solution_package',arguments:{content_base64:bytes.toString('base64')}})});
      assert.equal(r.status,200);assert.equal(JSON.parse(r.body).package.manifest.uniqueName,'TransferDemo');
    });
    await t.test('malformed JSON returns a generic client error without echoing request text',async()=>{
      const r=await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json'},body:'QA_SECRET_MARKER_NOT_JSON'});
      assert.equal(r.status,400);assert.equal(JSON.parse(r.body).code,'D365_DEBUG_INVALID_REQUEST');assert.equal(r.body.includes('QA_SECRET_MARKER'),false);
    });
    await t.test('invalid envelopes and argument types are rejected as client errors',async()=>{
      for(const value of [null,[],{}, {name:'clear_server_cache',arguments:[]},{name:123,arguments:{}},{name:'',arguments:{}},{name:'clear_server_cache',arguments:{},extra:true}]){
        const r=await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,400);assert.equal(JSON.parse(r.body).code,'D365_DEBUG_INVALID_REQUEST');
      }
    });
    await t.test('unknown tool names are not echoed back',async()=>{
      const r=await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'QA_SECRET_UNKNOWN_TOOL',arguments:{}})});assert.equal(r.status,404);assert.equal(r.body.includes('QA_SECRET_UNKNOWN_TOOL'),false);
    });
    await t.test('cross-site hosts/origins and non-JSON writes are rejected before dispatch',async()=>{
      for(const headers of [{host:'evil.invalid:3000'},{origin:'https://evil.invalid'},{'sec-fetch-site':'cross-site'}])assert.equal((await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'})).status,403);
      assert.equal((await invoke({url:'/api/call',method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);
    });
    await t.test('oversized JSON returns 413 and never parses or dispatches',async()=>{
      const r=await invoke({url:'/api/call',method:'POST',headers:{'content-type':'application/json'},body:Buffer.alloc(16*1024*1024+1,32)});assert.equal(r.status,413);
    });
    await t.test('traversal, unsupported methods and missing static files stay bounded',async()=>{
      assert.equal((await invoke({url:'/%2e%2e/server.ts'})).status,404);assert.equal((await invoke({url:'/qa-nonexistent.txt'})).status,404);assert.equal((await invoke({method:'PUT'})).status,405);
    });
  }finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
