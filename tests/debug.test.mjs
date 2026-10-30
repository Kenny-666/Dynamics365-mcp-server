import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { debugStaticPath, validateDebugRequest } from '../src/debug/requestGuard.ts';
import { webResourceTools } from '../src/tools/webResourceTools.ts';

test('debugger accepts its own UI and direct JSON clients on loopback hosts', () => {
  for (const host of ['localhost:3000','127.0.0.1:3000']) {
    assert.equal(validateDebugRequest({method:'GET', headers:{host}}, 3000), undefined);
    assert.equal(validateDebugRequest({method:'POST', headers:{host, origin:'http://' + host,
      'content-type':'application/json; charset=utf-8', 'sec-fetch-site':'same-origin'}}, 3000), undefined);
    assert.equal(validateDebugRequest({method:'POST', headers:{host, 'content-type':'application/json'}}, 3000), undefined);
  }
});

test('debugger rejects cross-site requests, DNS rebinding hosts and non-JSON writes', () => {
  for (const headers of [{host:'evil.invalid:3000'}, {host:'localhost:4000'}, {},
    {host:'localhost:3000', origin:'https://evil.invalid'}, {host:'localhost:3000', origin:'null'},
    {host:'localhost:3000', 'sec-fetch-site':'cross-site'}]) {
    assert.equal(validateDebugRequest({method:'POST', headers:{...headers, 'content-type':'application/json'}}, 3000), 403);
  }
  for (const type of [undefined, 'text/plain', 'application/x-www-form-urlencoded']) {
    assert.equal(validateDebugRequest({method:'POST', headers:{host:'localhost:3000','content-type':type}}, 3000), 415);
  }
});

test('debugger static files stay in the UI directory after URL decoding on Windows', () => {
  const root = path.resolve('src/debug/ui');
  assert.equal(debugStaticPath(root, '/'), path.join(root, 'index.html'));
  assert.equal(debugStaticPath(root, '/styles.css?v=1'), path.join(root, 'styles.css'));
  for (const url of ['/../server.ts', '/%2e%2e/server.ts', '/%2e%2e%2fserver.ts', '/..%5cserver.ts',
    '/C:%5cWindows%5cwin.ini', '/%00', '/%', 'server.ts', '//../server.ts']) {
    assert.equal(debugStaticPath(root, url), undefined, url);
  }
});

test('debugger rejects NTFS alternate streams and Windows device names before file I/O',()=>{
  const root=path.resolve('src/debug/ui');
  for(const url of ['/index.html::$DATA','/index.html:private','/styles.css%3Aprivate','/NUL','/nul.txt','/COM1','/images/LPT9.png','/aux','/con.json','/index.html.','/index.html '])assert.equal(debugStaticPath(root,url),undefined,url);
});

test('debugger Web Resource form sends canonical typed arguments and omits unused source fields', async () => {
  const tool = webResourceTools.find(t => t.name === 'create_web_resource_and_publish');
  const elements = new Map();
  function element() {
    return {value:'', children:[], classList:{add() {}, remove() {}}, style:{},
      appendChild(child) { this.children.push(child); },
      set innerHTML(html) {
        this.html = html;
        for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element());
      },
      get innerHTML() { return this.html; },
    };
  }
  for (const id of ['toolList','toolName','toolDesc','formContainer','resultOutput','copyBtn','toast']) elements.set(id, element());
  let ready;
  let submitted;
  const document = {
    addEventListener(_name, callback) { ready = callback; },
    getElementById(id) { return elements.get(id); },
    createElement() { return element(); },
    querySelectorAll() { return []; },
  };
  runInNewContext(await readFile(new URL('../src/debug/ui/app.js', import.meta.url), 'utf8'), {
    document, setTimeout() {}, navigator:{},
    async fetch(url, options) {
      if (url === '/api/tools') return {json:async () => [tool]};
      submitted = JSON.parse(options.body);
      return {json:async () => ({data:{dryRun:true}})};
    },
  });
  ready();
  await new Promise(resolve => setImmediate(resolve));
  const item = elements.get('toolList').children[0];
  item.onclick({currentTarget:item});
  assert.equal(elements.has('field_displayName'), false);
  assert.match(elements.get('formContainer').innerHTML, /type="number" id="field_web_resource_type"/);
  for (const [key, value] of Object.entries({name:'new_test.js', display_name:'Test', web_resource_type:'3', content:'hello', dry_run:'true'})) {
    elements.get('field_' + key).value = value;
  }
  await elements.get('executeBtn').onclick();
  assert.deepEqual(submitted, {name:tool.name, arguments:{name:'new_test.js', display_name:'Test', web_resource_type:3, content:'hello', dry_run:true}});
});
