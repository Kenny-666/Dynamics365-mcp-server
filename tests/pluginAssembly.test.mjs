import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {inspectAssembly,assemblyBytes,assemblyHash,decodeAssembly,ASSEMBLY_LIMIT} from '../src/services/assemblyInspector.ts';
import {PluginAssemblyService,inspectPluginAssembly} from '../src/services/pluginAssembly.ts';
import {pluginAssemblyTools} from '../src/tools/pluginAssemblyTools.ts';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';

const id='11111111-1111-1111-1111-111111111111',typeId='22222222-2222-2222-2222-222222222222';
const environment={orgUrl:'https://crm.invalid/Demo',authType:'op_ad',apiVersion:'v9.1'};
const files={},metadata=new Map();
for(const name of ['original','updated','major','minor','lower','other-key','unsigned','renamed','x86','removed','added','framework','core','culture','inherited','native-import','nested']) {
  files[name]=await readFile(new URL('./fixtures/assemblies/'+name+'.dll',import.meta.url));
  metadata.set(assemblyHash(files[name]),await inspectAssembly(files[name]));
}
const original=metadata.get(assemblyHash(files.original));
const reply=(data=null,status=200,headers={})=>({data,status,headers});
const inspect=async bytes=>structuredClone(metadata.get(assemblyHash(bytes)) ?? await inspectAssembly(bytes));
function fixture(options={}) {
  const calls=[];let wrote=false;
  const stored={pluginassemblyid:id,name:original.name,version:original.version,culture:null,publickeytoken:original.publicKeyToken,
    sourcetype:0,isolationmode:2,ismanaged:false,iscustomizable:{Value:true},'@odata.etag':'W/"10"',content:files.original.toString('base64'),...options.stored};
  const types=[{plugintypeid:typeId,typename:'Example.AccountPlugin',isworkflowactivity:false,_pluginassemblyid_value:id,
    version:original.version,culture:null,publickeytoken:original.publicKeyToken}];
  const client={async makeRequest(){throw new Error('Use cancellable requestWithResponse');},
    async requestWithResponse(endpoint,method,data,requestOptions){
      const call={endpoint,method,data,options:requestOptions};calls.push(call);
      if(method!=='GET'){
        if(options.writeError)throw options.writeError;
        wrote=true;Object.assign(stored,data);for(const type of types)type.version=data.version;
        if(options.afterWrite)options.afterWrite(stored,types);
        return reply(null,204);
      }
      if(endpoint.includes('/Attributes?'))return reply({value:options.packageColumn?[{LogicalName:'packageid'}]:[]});
      if(endpoint.startsWith('/EntityDefinitions'))return reply({IsOptimisticConcurrencyEnabled:options.concurrency ?? true});
      if(endpoint.startsWith('/plugintypes?'))return reply({value:options.types ?? types,...(options.nextTypes?{'@odata.nextLink':'https://evil.invalid/secret'}:{})});
      if(endpoint.startsWith('/pluginassemblies(')){
        if(wrote && options.readbackError)throw options.readbackError;
        return reply({...stored,password:'DO_NOT_RETURN',username:'DO_NOT_RETURN'});
      }
      if(endpoint.startsWith('/pluginassemblies?'))return reply({value:[{...stored,password:'DO_NOT_RETURN'}],...(options.next?{'@odata.nextLink':'https://evil.invalid'}:{})});
      throw new Error('Unexpected '+endpoint);
    }};
  return {calls,client,service:new PluginAssemblyService(client,environment,options.inspect ?? inspect)};
}
const input={assembly_id:id,content_base64:files.updated.toString('base64')};
const writes=f=>f.calls.filter(c=>c.method!=='GET');
async function execute(f,args=input,signal){const preview=await f.service.update(args,signal);return f.service.update({...args,dry_run:false,expected_fingerprint:preview.fingerprint},signal);}
async function error(promise,code){try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);
  const payload=toolErrorPayload(e);if(code)assert.equal(payload.code,code);return payload;}}

test('actual reader derives signed identity, framework and IPlugin type without running static initializer',async()=>{
  const actual=await inspectAssembly(files.updated);assert.equal(actual.name,'FixturePlugin');assert.equal(actual.version,'1.2.1.0');
  assert.equal(actual.framework,'.NETFramework,Version=v4.6.2');assert.match(actual.publicKeyToken,/^[a-f0-9]{16}$/);
  assert.equal(actual.signed,true);assert.equal(actual.library,true);assert.equal(actual.ilOnly,true);
  assert.deepEqual(actual.types.map(t=>[t.name,t.plugin,t.concrete]),[['Example.AccountPlugin',true,true]]);
  assert.equal(actual.references.some(r=>r.name==='Microsoft.Xrm.Sdk'),true);
});
test('reader recognizes local inherited IPlugin and unsigned/x86/framework differences',()=>{
  assert.equal(metadata.get(assemblyHash(files.inherited)).types.find(t=>t.name==='Example.AccountPlugin').plugin,true);
  assert.equal(metadata.get(assemblyHash(files.unsigned)).signed,false);
  assert.equal(metadata.get(assemblyHash(files.x86)).requires32Bit,true);
  assert.equal(metadata.get(assemblyHash(files.core)).framework,'.NETCoreApp,Version=v10.0');
});
test('invalid PE, truncated metadata and missing reader/runtime return sanitized errors',async()=>{
  await error(inspectAssembly(Buffer.from('MZnot-a-real-PE')),'D365_ASSEMBLY_INVALID');
  await error(inspectAssembly(files.updated.subarray(0,512)),'D365_ASSEMBLY_INVALID');
  const result=await error(inspectAssembly(files.updated,undefined,{command:'DOES-NOT-EXIST-secret-dotnet'}),'D365_ASSEMBLY_INSPECTOR_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('reader timeout, cancellation and invalid/oversized output are bounded',async()=>{
  const folder=new URL('../.cache/assembly-reader-tests/',import.meta.url);await mkdir(folder,{recursive:true});
  const sleeping=new URL('sleep.cjs',folder);await writeFile(sleeping,'setTimeout(()=>{},10000);');
  await error(inspectAssembly(files.updated,undefined,{command:process.execPath,helper:fileURLToPath(sleeping),timeoutMs:10}),'D365_ASSEMBLY_INSPECTOR_TIMEOUT');
  const controller=new AbortController();controller.abort();await error(inspectAssembly(files.updated,controller.signal),'D365_ASSEMBLY_CANCELLED');
  const running=new AbortController();const promise=inspectAssembly(files.updated,running.signal,{command:process.execPath,helper:fileURLToPath(sleeping)});
  running.abort();await error(promise,'D365_ASSEMBLY_CANCELLED');
  for(const [name,source] of [['invalid','process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("secret-raw-output"));'],
    ['oversized','process.stdout.write("x".repeat(5*1024*1024));']]){
    const file=new URL(name+'.cjs',folder);await writeFile(file,source);
    const result=await error(inspectAssembly(files.updated,undefined,{command:process.execPath,helper:fileURLToPath(file)}),'D365_ASSEMBLY_INSPECTOR_OUTPUT');
    assert.equal(JSON.stringify(result).includes('secret-raw-output'),false);
  }
});
test('canonical base64 and bounded local sources reject ambiguity, paths and size violations',async()=>{
  for(const value of ['', 'YQ', 'YR==','data:application/octet-stream;base64,YQ==','YQ==\n','!!!!'])await error(Promise.resolve().then(()=>decodeAssembly(value)));
  await error(Promise.resolve().then(()=>decodeAssembly('A'.repeat(Math.ceil(ASSEMBLY_LIMIT/3)*4+4))));
  assert.equal(decodeAssembly('YQ==').toString(),'a');
  await error(assemblyBytes({}));await error(assemblyBytes({file_path:'secret-path',content_base64:'YQ=='}));
  const result=await error(assemblyBytes({file_path:'secret-path-not-found'}));assert.equal(JSON.stringify(result).includes('secret-path'),false);
  await error(assemblyBytes({file_path:fileURLToPath(new URL('./fixtures/assemblies/',import.meta.url))}));
  assert.equal(assemblyHash(await assemblyBytes({file_path:fileURLToPath(new URL('./fixtures/assemblies/updated.dll',import.meta.url))})),assemblyHash(files.updated));
});
test('local inspection works without CRM settings and never exposes binary bytes',async()=>{
  const result=await inspectPluginAssembly({contentBase64:files.updated.toString('base64')});
  assert.equal(result.inspection.codeExecuted,false);assert.equal(result.inspection.cryptographicSignatureVerified,false);
  assert.equal(result.inspection.sha256,assemblyHash(files.updated));assert.equal(JSON.stringify(result).includes(input.content_base64),false);
  const bad=await error(handleToolCall('d365_plugin_assembly_inspect',{}));assert.notEqual(bad.code,'D365_CONFIG_INVALID');
});
test('all tool schemas accept aliases and reject unknown fields',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});for(const tool of pluginAssemblyTools)ajv.compile(tool.inputSchema);
  const validate=ajv.compile(pluginAssemblyTools[2].inputSchema);
  assert.equal(validate({assemblyId:id,contentBase64:input.content_base64}),true);
  assert.equal(validate({assembly_id:id}),false);assert.equal(validate({...input,unknown:true}),false);
});
test('query projects metadata, combines exact filters and reports limits without reading content',async()=>{
  const f=fixture({next:true});const result=await f.service.query({assemblyId:id,name:"Fixture'Plugin"});
  assert.equal(result.complete,false);assert.equal(result.count,1);assert.equal(f.calls.length,1);
  assert.equal(result.items[0].content,undefined);assert.equal(result.items[0].password,undefined);
  const query=new URL(f.calls[0].endpoint,'https://crm.invalid').searchParams;
  assert.match(query.get('$filter'),/name eq 'Fixture''Plugin'/);assert.match(query.get('$filter'),new RegExp(id));
  assert.doesNotMatch(query.get('$select'),/content|password|username/);
});
test('update defaults to preview, compares actual bytes and preserves registered types',async()=>{
  const f=fixture();const result=await f.service.update(input);
  assert.equal(result.dryRun,true);assert.equal(result.canWrite,true);assert.equal(result.candidate.version,'1.2.1.0');
  assert.deepEqual(result.registeredTypes,[{id:typeId,name:'Example.AccountPlugin',workflow:false,version:original.version,culture:'',publicKeyToken:original.publicKeyToken}]);
  assert.equal(writes(f).length,0);assert.equal(JSON.stringify(result).includes(input.content_base64),false);
  assert.equal(JSON.stringify(result).includes('DO_NOT_RETURN'),false);
  assert.ok(f.calls.find(c=>c.endpoint.includes('/Attributes?')));
  assert.equal(f.calls.some(c=>c.endpoint.includes('_packageid_value')),false);
});
test('actual update inspects real PE and reads back exact binary/identity/types',async()=>{
  const f=fixture({inspect:inspectAssembly}),signal=new AbortController().signal;
  const result=await execute(f,input,signal);assert.equal(result.saved,true);assert.equal(result.readbackConfirmed,true);
  assert.equal(result.item.version,'1.2.1.0');assert.equal(result.registeredTypes[0].id,typeId);
  assert.equal(writes(f).length,1);assert.equal(writes(f)[0].method,'PATCH');
  assert.deepEqual(writes(f)[0].data,{content:input.content_base64,version:'1.2.1.0'});
  assert.equal(writes(f)[0].options.headers['If-Match'],'W/"10"');assert.ok(f.calls.every(call=>call.options.signal===signal));
});
for(const [name,reason] of [['major','MAJOR_MINOR_REQUIRES_SIDE_BY_SIDE'],['minor','MAJOR_MINOR_REQUIRES_SIDE_BY_SIDE'],
  ['lower','MAJOR_MINOR_REQUIRES_SIDE_BY_SIDE'],['other-key','PUBLIC_KEY_CHANGED'],['unsigned','STRONG_NAME_REQUIRED'],
  ['renamed','NAME_CHANGED'],['culture','CULTURE_CHANGED'],['x86','ANYCPU_MANAGED_DLL_REQUIRED'],['removed','REGISTERED_TYPE_SET_CHANGED_OR_UNRESOLVED'],
  ['added','REGISTERED_TYPE_SET_CHANGED_OR_UNRESOLVED'],['framework','TARGET_FRAMEWORK_CHANGED'],['core','TARGET_FRAMEWORK_UNSUPPORTED'],
  ['native-import','ANYCPU_MANAGED_DLL_REQUIRED'],['nested','UNRESOLVED_OR_NESTED_CONTRACT']])
test(`incompatible actual DLL ${name} is blocked before writing`,async()=>{
  const f=fixture(),args={...input,content_base64:files[name].toString('base64')};
  const result=await f.service.update(args);assert.equal(result.canWrite,false);assert.ok(result.blockedBy.includes(reason),JSON.stringify(result.blockedBy));
  await error(f.service.update({...args,dry_run:false,expected_fingerprint:result.fingerprint}),'D365_ASSEMBLY_UPDATE_BLOCKED');
  assert.equal(writes(f).length,0);
});
test('version downgrade within the same major/minor is blocked',async()=>{
  const f=fixture({stored:{version:'1.2.2.0'}});const result=await f.service.update(input);assert.ok(result.blockedBy.includes('VERSION_DOWNGRADE'));assert.equal(writes(f).length,0);
});
test('managed/customizable/source/isolation/packaged/platform boundaries are fail-closed',async()=>{
  for(const [stored,reason,packageColumn] of [[{ismanaged:true},'MANAGED_OR_NOT_CUSTOMIZABLE'],[{iscustomizable:null},'MANAGED_OR_NOT_CUSTOMIZABLE'],
    [{sourcetype:1},'SOURCE_OR_ISOLATION_UNSUPPORTED'],[{isolationmode:3},'SOURCE_OR_ISOLATION_UNSUPPORTED'],
    [{_packageid_value:id},'PLUGIN_PACKAGE_REQUIRES_PACKAGE_UPDATE',true],[{name:'Microsoft.Internal'},'PLATFORM_ASSEMBLY_UNSUPPORTED']]) {
    const f=fixture({stored,packageColumn});const result=await f.service.update(input);assert.ok(result.blockedBy.includes(reason));assert.equal(writes(f).length,0);
  }
});
test('workflow, empty, unconfirmed and missing registered types cannot be updated',async()=>{
  for(const types of [[],[{plugintypeid:typeId,typename:'Example.AccountPlugin',_pluginassemblyid_value:id}],
    [{plugintypeid:typeId,typename:'Example.AccountPlugin',_pluginassemblyid_value:id,isworkflowactivity:true}]]) {
    const result=await fixture({types}).service.update(input);assert.equal(result.canWrite,false);assert.ok(result.blockedBy.includes('PLUGIN_ONLY_TYPES_REQUIRED'));
  }
});
test('type paging, identity mismatch and duplicate IDs are rejected without following links',async()=>{
  const type={plugintypeid:typeId,typename:'Example.AccountPlugin',_pluginassemblyid_value:id,isworkflowactivity:false};
  for(const options of [{nextTypes:true},{types:[{...type,_pluginassemblyid_value:typeId}]},{types:[type,type]},{stored:{pluginassemblyid:typeId}}]){
    const f=fixture(options);await error(f.service.update(input));assert.equal(writes(f).length,0);assert.equal(f.calls.some(c=>c.endpoint.includes('evil')),false);
  }
});
test('declared server identity mismatch and reference changes block compatibility',async()=>{
  const f=fixture({stored:{publickeytoken:'1111111111111111'}});const preview=await f.service.update(input);
  assert.ok(preview.blockedBy.includes('STORED_IDENTITY_MISMATCH'));
  const changing=fixture({inspect:async bytes=>{const value=await inspect(bytes);if(assemblyHash(bytes)===assemblyHash(files.updated))value.references.push({name:'Unknown',version:'1.0.0.0'});return value;}});
  assert.ok((await changing.service.update(input)).blockedBy.includes('ASSEMBLY_REFERENCES_CHANGED'));
});
test('preview fingerprint is required and changes when the target/binary/type baseline changes',async()=>{
  const options={};const f=fixture(options),preview=await f.service.update(input);
  await error(f.service.update({...input,dry_run:false}),'D365_ASSEMBLY_PREVIEW_CHANGED');
  options.types=[{plugintypeid:typeId,typename:'Example.Other',isworkflowactivity:false,_pluginassemblyid_value:id}];
  await error(f.service.update({...input,dry_run:false,expected_fingerprint:preview.fingerprint}),'D365_ASSEMBLY_PREVIEW_CHANGED');assert.equal(writes(f).length,0);
});
test('unsupported concurrency requires explicit opt-in; specific ETag conflict is never bypassed',async()=>{
  const f=fixture({concurrency:false}),preview=await f.service.update(input);
  assert.ok(preview.blockedBy.includes('CONCURRENCY_UNSUPPORTED'));
  await error(f.service.update({...input,dry_run:false,expected_fingerprint:preview.fingerprint}),'D365_ASSEMBLY_UPDATE_BLOCKED');
  const result=await execute(f,{...input,allowUnprotectedUpdate:true});assert.equal(result.concurrencyProtected,false);assert.equal(writes(f)[0].options.headers['If-Match'],'*');
  for(const concurrency of [true,false]){
    const f=fixture({concurrency});const result=await f.service.update({...input,if_match:'W/"old"',allow_unprotected_update:true});
    assert.equal(result.canWrite,false);assert.ok(result.blockedBy.includes(concurrency?'ETAG_CONFLICT':'CONCURRENCY_UNSUPPORTED'));
  }
  await error(fixture().service.update({...input,if_match:'*'}));
});
test('no-change content does not write; no-current-ETag requires a supplied specific ETag',async()=>{
  const f=fixture({concurrency:false});const result=await execute(f,{...input,content_base64:files.original.toString('base64')});
  assert.equal(result.noChange,true);assert.equal(result.saved,false);assert.equal(writes(f).length,0);
  const missing=fixture({stored:{'@odata.etag':undefined}});assert.ok((await missing.service.update(input)).blockedBy.includes('ETAG_REQUIRED'));
  assert.equal((await execute(missing,{...input,if_match:'W/"10"'})).saved,true);
});
test('readback failure/changed bytes/identity/types preserves saved=true and ID',async()=>{
  for(const options of [{readbackError:new Error('secret-server-message')},{afterWrite:stored=>{stored.content=files.original.toString('base64');}},
    {afterWrite:stored=>{stored.version='9.9.9.9';}},{afterWrite:(_stored,types)=>{types[0].plugintypeid=id;}},
    {afterWrite:(_stored,types)=>{types[0].version='1.2.0.0';}}]) {
    const f=fixture(options);const result=await error(execute(f),'D365_ASSEMBLY_READBACK_FAILED');
    assert.equal(result.data.saved,true);assert.equal(result.data.assemblyId,id);assert.equal(result.data.phase,'readback');
    assert.equal(writes(f).length,1);assert.equal(JSON.stringify(result).includes('secret-server-message'),false);
  }
});
test('unknown writes and platform rejection are never replayed or expose content',async()=>{
  for(const [cause,saved] of [[new Error('secret-transport'),'unknown'],[new CrmRequestError('D365_TIMEOUT','secret',{outcome:'unknown'}),'unknown'],
    [new CrmRequestError('D365_CONCURRENCY_CONFLICT','secret',{status:412,outcome:'rejected'}),false]]) {
    const f=fixture({writeError:cause});const result=await error(execute(f),'D365_ASSEMBLY_WRITE_FAILED');
    assert.equal(result.data.saved,saved);assert.equal(result.data.assemblyId,id);assert.equal(writes(f).length,1);
    assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(JSON.stringify(result).includes(input.content_base64),false);
  }
});
test('cancellation before PATCH sends no mutation',async()=>{
  const f=fixture(),controller=new AbortController(),preview=await f.service.update(input);controller.abort();
  await error(f.service.update({...input,dry_run:false,expected_fingerprint:preview.fingerprint},controller.signal),'D365_ASSEMBLY_CANCELLED');assert.equal(writes(f).length,0);
});
test('handler routes assembly query/update and cancellation through the service',async t=>{
  const signal=new AbortController().signal;
  t.mock.method(PluginAssemblyService.prototype,'query',async (_args,received)=>{assert.equal(received,signal);return {route:'query'};});
  t.mock.method(PluginAssemblyService.prototype,'update',async (_args,received)=>{assert.equal(received,signal);return {route:'update'};});
  const saved={...process.env};Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:environment.orgUrl,AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try{assert.equal((await handleToolCall('d365_plugin_assemblies_query',{},{signal})).route,'query');assert.equal((await handleToolCall('d365_plugin_assembly_update',{},{signal})).route,'update');}
  finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: native binary PATCH/readback runs through actual auth request branch`,async t=>{
  t.mock.method(axios,'post',async()=>({data:{access_token:'offline-token',expires_in:3600}}));
  const config=readConfig({AUTH_TYPE:authType,ORG_URL:environment.orgUrl,ENVIRONMENT_URL:environment.orgUrl,API_VERSION:'v9.1',
    TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST',
    IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
  const client=new D365AuthService(config),f=fixture();
  client.getAxiosInstance().defaults.adapter=async config=>{
    const url=new URL(config.url);assert.equal(url.origin,'https://crm.invalid');assert.ok(url.pathname.startsWith('/Demo/api/data/v9.1/'));
    const response=await f.client.requestWithResponse(decodeURI(url.pathname.replace('/Demo/api/data/v9.1',''))+url.search,config.method.toUpperCase(),
      config.data?JSON.parse(config.data):undefined,{headers:Object.fromEntries(config.headers)});
    return {config,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};
  };
  const service=new PluginAssemblyService(client,{...environment,authType},inspectAssembly);
  const preview=await service.update(input);assert.equal(preview.canWrite,true);
  const result=await service.update({...input,dry_run:false,expected_fingerprint:preview.fingerprint});
  assert.equal(result.readbackConfirmed,true);assert.equal(writes(f).length,1);
});
