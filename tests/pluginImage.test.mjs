import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios, {AxiosHeaders} from 'axios';
import {PluginImageService} from '../src/services/pluginImage.ts';
import {pluginImageTools} from '../src/tools/pluginImageTools.ts';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {handleToolCall} from '../src/tool_handler.ts';

const ids = {step:'11111111-1111-1111-1111-111111111111',image:'22222222-2222-2222-2222-222222222222',
  type:'33333333-3333-3333-3333-333333333333',other:'44444444-4444-4444-4444-444444444444'};
const environment = {orgUrl:'https://crm.invalid/Demo',authType:'op_ad',apiVersion:'v9.1'};
const image = {sdkmessageprocessingstepimageid:ids.image,_sdkmessageprocessingstepid_value:ids.step,
  name:'Before',entityalias:'Before',imagetype:0,attributes:'name',messagepropertyname:'Target',
  ismanaged:false,iscustomizable:{Value:true},'@odata.etag':'W/"10"'};
const registration = {step_id:ids.step,name:'Before',entity_alias:'Before',image_type:'PreImage',attributes:['name']};
const reply = (data=null,status=200,headers={}) => ({data,status,headers});
function fixture(options={}) {
  const calls=[];
  let saved = options.existing === false ? null : structuredClone({...image,...options.image});
  let wrote=false;
  const client = {async makeRequest(){throw new Error('Use cancellable requestWithResponse');},
    async requestWithResponse(endpoint,method,data,requestOptions) {
      const call={endpoint,method,data,options:requestOptions};calls.push(call);
      if (method !== 'GET') {
        if (options.writeError) throw options.writeError;
        wrote=true;
        if(method==='DELETE') saved=null;
        else if(method==='POST') saved={...structuredClone(image),...data,_sdkmessageprocessingstepid_value:ids.step};
        else saved={...saved,...data};
        if(options.afterWrite) options.afterWrite(saved);
        return reply(options.response ?? null,204);
      }
      if (endpoint.startsWith('/sdkmessageprocessingstepimages(')) {
        if(wrote && options.readbackError) throw options.readbackError;
        if(!saved) throw new CrmRequestError('D365_HTTP_ERROR','Missing',{status:404,outcome:'rejected'});
        return reply({...saved,configuration:'never-return-this'});
      }
      if(endpoint.startsWith('/sdkmessageprocessingstepimages?')) return reply({value:options.siblings ?? (saved ? [saved] : []),
        ...(options.next ? {'@odata.nextLink':'https://evil.invalid/secret'} : {})});
      if(endpoint.startsWith('/sdkmessageprocessingsteps(')) return reply({sdkmessageprocessingstepid:ids.step,stage:20,mode:0,
        eventhandler_plugintype:{plugintypeid:ids.type},sdkmessageid:{name:'Update'},sdkmessagefilterid:{primaryobjecttypecode:'account'},...options.step});
      if(endpoint.includes('/Attributes(')) {
        const field=/Attributes\(LogicalName='([^']+)'\)/.exec(endpoint)[1];
        return reply({LogicalName:field,IsValidForRead:options.readable ?? true});
      }
      if(endpoint.startsWith('/EntityDefinitions')) return reply({IsOptimisticConcurrencyEnabled:options.concurrency ?? true});
      throw new Error('Unexpected endpoint '+endpoint);
    }};
  return {client,calls,service:new PluginImageService(client,environment,()=>ids.image)};
}
const writes = fixture => fixture.calls.filter(call=>call.method!=='GET');
async function execute(fixture,args,operation,signal) {
  const preview=await fixture.service.mutate(args,operation,signal);
  return fixture.service.mutate({...args,dry_run:false,expected_fingerprint:preview.fingerprint},operation,signal);
}
async function error(promise,code) {
  try{await promise;assert.fail('Expected failure');}catch(e){assert.ok(e instanceof CrmRequestError,e.stack);
    const payload=toolErrorPayload(e);if(code)assert.equal(payload.code,code);return payload;}
}

test('image schema inventory, aliases and explicit fields',()=>{
  const ajv=new Ajv({strict:false,useDefaults:true});
  for(const tool of pluginImageTools) ajv.compile(tool.inputSchema);
  const validate=ajv.compile(pluginImageTools[1].inputSchema);
  assert.equal(validate({stepId:ids.step,name:'Before',entityAlias:'Before',imageType:0,attributes:['name']}),true);
  assert.equal(validate({...registration,attributes:[]}),false);
  assert.equal(validate({...registration,unknown:true}),false);
});
test('query projects image fields, excludes configuration and preserves cancellation',async()=>{
  const f=fixture(),signal=new AbortController().signal;
  const result=await f.service.query({stepId:ids.step},signal);
  assert.equal(result.count,1);assert.equal(result.complete,true);
  assert.equal(result.items[0].configuration,undefined);
  assert.equal(f.calls[0].options.signal,signal);
  assert.doesNotMatch(f.calls[0].endpoint,/configuration|secureconfig/);
});
test('query exposes incomplete results and never follows native nextLink',async()=>{
  const f=fixture({next:true});const result=await f.service.query({step_id:ids.step});
  assert.equal(result.complete,false);assert.equal(f.calls.length,1);
});
test('register preview defaults to read-only; writes are fingerprint-gated',async()=>{
  const f=fixture({existing:false});const result=await f.service.mutate(registration,'register');
  assert.equal(result.dryRun,true);assert.equal(result.saved,false);assert.match(result.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(writes(f).length,0);
  await error(f.service.mutate({...registration,dry_run:false},'register'),'D365_PLUGIN_IMAGE_PREVIEW_CHANGED');
  assert.equal(writes(f).length,0);
});
test('register assigns an ID and parent binding and verifies saved attributes',async()=>{
  const f=fixture({existing:false});
  const result=await execute(f,{...registration,attributes:['Telephone1','name','NAME']},'register');
  assert.equal(result.saved,true);assert.equal(result.readbackConfirmed,true);assert.equal(result.imageId,ids.image);
  assert.equal(writes(f)[0].data.attributes,'name,telephone1');
  assert.equal(writes(f)[0].data['sdkmessageprocessingstepid@odata.bind'],'/sdkmessageprocessingsteps('+ids.step+')');
  assert.equal(writes(f)[0].data.messagepropertyname,'Target');
  assert.equal(JSON.stringify(result).includes('never-return-this'),false);
});
for(const [message,stage,imageType,valid] of [
  ['Create',40,1,true],['Create',20,0,false],['Create',40,2,false],['Delete',20,0,true],['Delete',40,1,false],
  ['Update',10,0,true],['Update',20,1,false],['Update',40,2,true],['Assign',40,1,true],['SetState',20,0,true],
  ['Retrieve',40,0,false],['Merge',40,0,false],['Update',30,0,false],
])test(`image availability: ${message}/${stage}/${imageType}`,async()=>{
  const f=fixture({existing:false,step:{stage,sdkmessageid:{name:message}}});
  const result=f.service.mutate({...registration,image_type:imageType},'register');
  if(valid){const value=await result;assert.equal(value.canWrite,true);
    if(message==='SetState')assert.equal(value.changes.messagepropertyname,'EntityMoniker');}
  else await error(result);
  assert.equal(writes(f).length,0);
});
test('unsupported entity, plugin handler, async stage and unreadable metadata are rejected',async()=>{
  for(const options of [{step:{sdkmessagefilterid:null}},{step:{eventhandler_plugintype:null}},{step:{mode:1,stage:20}},
    {readable:false}]) {
    const f=fixture({existing:false,...options});
    await error(f.service.mutate(registration,'register'));assert.equal(writes(f).length,0);
  }
});
test('missing field readability metadata fails closed',async()=>{
  const f=fixture({existing:false}),base=f.client.requestWithResponse;
  f.client.requestWithResponse=async (...args)=>args[0].includes('/Attributes(')?reply({LogicalName:'name'}):base(...args);
  await error(f.service.mutate(registration,'register'),'D365_PLUGIN_IMAGE_ATTRIBUTE_INVALID');
});
test('empty/all-column and malformed attributes, types, names and alias conflicts are rejected',async()=>{
  for(const args of [{attributes:[]},{attributes:['*']},{attributes:['name)']},{image_type:3},{name:'x\n'},
    {entity_alias:'x'.repeat(257)},{image_type:0,imageType:1}]) {
    const f=fixture({existing:false});await error(f.service.mutate({...registration,...args},'register'));
    assert.equal(writes(f).length,0);
  }
});
test('duplicate name or overlapping alias is blocked; separate Pre/Post alias is permitted',async()=>{
  for(const other of [{name:'BEFORE',entityalias:'Different',imagetype:1},{name:'Other',entityalias:'before',imagetype:0},
    {name:'Other',entityalias:'before',imagetype:2}]) {
    const f=fixture({existing:false,siblings:[{...image,...other,sdkmessageprocessingstepimageid:ids.other}]});
    await error(f.service.mutate(registration,'register'),'D365_PLUGIN_IMAGE_DUPLICATE');
  }
  const f=fixture({existing:false,siblings:[{...image,name:'After',imagetype:1,sdkmessageprocessingstepimageid:ids.other}]});
  assert.equal((await f.service.mutate(registration,'register')).canWrite,true);
});
test('incomplete image enumeration blocks mutation without following outside links',async()=>{
  const f=fixture({next:true});await error(f.service.mutate({image_id:ids.image},'delete'),'D365_PLUGIN_IMAGE_INCOMPLETE');
  assert.equal(writes(f).length,0);assert.equal(f.calls.some(c=>c.endpoint.includes('evil')),false);
});
test('update uses specific ETag and preserves omitted values',async()=>{
  const f=fixture();const result=await execute(f,{imageId:ids.image,patch:{entityAlias:'Snapshot',attributes:['telephone1']}},'update');
  assert.equal(result.item.name,'Before');assert.equal(result.item.entityalias,'Snapshot');assert.equal(result.concurrencyProtected,true);
  assert.equal(writes(f)[0].options.headers['If-Match'],'W/"10"');
  assert.deepEqual(writes(f)[0].data,{entityalias:'Snapshot',attributes:'telephone1'});
});
test('mutations reject stale fingerprints after a parent stage or image change',async()=>{
  const options={};const f=fixture(options);const args={image_id:ids.image,patch:{name:'Changed'}};
  const preview=await f.service.mutate(args,'update');options.step={stage:40};
  await error(f.service.mutate({...args,dry_run:false,expected_fingerprint:preview.fingerprint},'update'),'D365_PLUGIN_IMAGE_PREVIEW_CHANGED');
  assert.equal(writes(f).length,0);
});
test('managed or non-customizable images and unsafe existing properties are rejected',async()=>{
  for(const changed of [{ismanaged:true},{iscustomizable:{Value:false}},{iscustomizable:null},{messagepropertyname:'Other'},
    {relatedattributename:'parentid'},{attributes:null}]) {
    const f=fixture({image:changed});await error(f.service.mutate({image_id:ids.image,patch:{name:'Changed'}},'update'));
    assert.equal(writes(f).length,0);
  }
});
test('returned image and parent identities must match',async()=>{
  for(const changed of [{sdkmessageprocessingstepimageid:ids.other},{_sdkmessageprocessingstepid_value:'broken'}]) {
    const f=fixture({image:changed});await error(f.service.mutate({image_id:ids.image},'delete'));assert.equal(writes(f).length,0);
  }
});
test('unsupported concurrency is a blocked preview; explicit opt-in uses If-Match:*',async()=>{
  const f=fixture({concurrency:false}),args={image_id:ids.image,patch:{name:'Changed'}};
  const preview=await f.service.mutate(args,'update');assert.equal(preview.canWrite,false);
  await error(f.service.mutate({...args,dry_run:false,expected_fingerprint:preview.fingerprint},'update'),'D365_PLUGIN_IMAGE_CONCURRENCY_UNSUPPORTED');
  const result=await execute(f,{...args,allow_unprotected_update:true},'update');
  assert.equal(result.concurrencyProtected,false);assert.equal(writes(f)[0].options.headers['If-Match'],'*');
});
test('a supplied specific ETag cannot be bypassed; wildcard input is rejected',async()=>{
  for(const concurrency of [true,false]) {
    const f=fixture({concurrency}),args={image_id:ids.image,patch:{name:'Changed'},if_match:'W/"old"',allow_unprotected_update:true};
    const preview=await f.service.mutate(args,'update');assert.equal(preview.canWrite,false);
    await error(f.service.mutate({...args,dry_run:false,expected_fingerprint:preview.fingerprint},'update'));
    assert.equal(writes(f).length,0);
  }
  await error(fixture().service.mutate({image_id:ids.image,if_match:'*'},'delete'));
});
test('missing native ETag blocks a write unless a specific ETag is supplied',async()=>{
  const f=fixture({image:{'@odata.etag':undefined}}),args={image_id:ids.image,patch:{name:'Changed'}};
  const preview=await f.service.mutate(args,'update');assert.equal(preview.canWrite,false);
  assert.equal(preview.blockedBy,'D365_PLUGIN_IMAGE_ETAG_REQUIRED');
  const result=await execute(f,{...args,if_match:'W/"10"'},'update');assert.equal(result.saved,true);
  assert.equal(writes(f)[0].options.headers['If-Match'],'W/"10"');
});
test('unknown concurrency metadata blocks a protected operation',async()=>{
  const f=fixture(),base=f.client.requestWithResponse;
  f.client.requestWithResponse=async (...args)=>args[0].startsWith('/EntityDefinitions')?reply({}):base(...args);
  const preview=await f.service.mutate({image_id:ids.image},'delete');
  assert.equal(preview.blockedBy,'D365_PLUGIN_IMAGE_CONCURRENCY_UNSUPPORTED');assert.equal(writes(f).length,0);
});
test('delete is confirmed only after native 404 and uses concurrency header',async()=>{
  const f=fixture();const result=await execute(f,{image_id:ids.image},'delete');
  assert.equal(result.deleted,true);assert.equal(result.readbackConfirmed,true);
  assert.equal(writes(f)[0].method,'DELETE');assert.equal(writes(f)[0].data,undefined);
});
test('delete readback authorization failure is not confused with absence',async()=>{
  const f=fixture({readbackError:new CrmRequestError('D365_HTTP_ERROR','secret',{status:403,outcome:'rejected'})});
  const result=await error(execute(f,{image_id:ids.image},'delete'),'D365_PLUGIN_IMAGE_READBACK_FAILED');
  assert.equal(result.data.saved,true);assert.equal(result.data.readbackConfirmed,false);assert.equal(result.status,403);
});
test('delete readback with a retained image is not confirmed',async()=>{
  const f=fixture(),base=f.client.requestWithResponse;let deleted=false;
  f.client.requestWithResponse=async (...args)=>{
    if(args[1]==='DELETE'){deleted=true;return reply(null,204);}
    if(deleted && args[0].startsWith('/sdkmessageprocessingstepimages('))return reply(image);
    return base(...args);
  };
  const result=await error(execute(f,{image_id:ids.image},'delete'),'D365_PLUGIN_IMAGE_READBACK_FAILED');
  assert.equal(result.data.saved,true);assert.equal(result.data.cause,'D365_PLUGIN_IMAGE_READBACK_MISMATCH');
});
test('malformed collections and image ownership mismatches fail closed',async()=>{
  for(const collection of [{value:{}},{value:[{...image,_sdkmessageprocessingstepid_value:ids.other}]},{value:[{name:'No ID'}]}]){
    const f=fixture(),base=f.client.requestWithResponse;
    f.client.requestWithResponse=async (...args)=>args[0].startsWith('/sdkmessageprocessingstepimages?')?reply(collection):base(...args);
    await error(f.service.query({step_id:ids.step}));
  }
});
test('register/update/query/delete cycle preserves the native parent step',async()=>{
  const f=fixture({existing:false});
  const created=await execute(f,registration,'register');
  const changed=await execute(f,{image_id:created.imageId,patch:{attributes:['name','telephone1'],description:'Both values'}},'update');
  assert.equal(changed.item.attributes,'name,telephone1');
  assert.equal((await f.service.query({step_id:ids.step})).count,1);
  assert.equal((await execute(f,{image_id:ids.image},'delete')).deleted,true);
  assert.equal((await f.service.query({step_id:ids.step})).count,0);
  assert.equal(writes(f).length,3);assert.ok(writes(f).every(call=>call.endpoint.startsWith('/sdkmessageprocessingstepimages')));
});
test('readback failure and divergence retain saved=true and exact image ID',async()=>{
  for(const options of [{readbackError:new Error('secret-server-text')},{afterWrite:saved=>{saved.name='Other';}},
    {readbackError:new CrmRequestError('D365_REQUEST_CANCELLED','secret',{outcome:'not_sent'})}]) {
    const f=fixture(options);const payload=await error(execute(f,{image_id:ids.image,patch:{name:'Changed'}},'update'),'D365_PLUGIN_IMAGE_READBACK_FAILED');
    assert.equal(payload.data.saved,true);assert.equal(payload.data.imageId,ids.image);assert.equal(payload.data.phase,'readback');
    assert.equal(JSON.stringify(payload).includes('secret'),false);assert.equal(writes(f).length,1);
  }
});
test('write rejection, unknown outcome and wrong response identity are never replayed',async()=>{
  for(const [options,saved] of [[{writeError:new CrmRequestError('D365_CONCURRENCY_CONFLICT','secret',{status:412,outcome:'rejected'})},false],
    [{writeError:new CrmRequestError('D365_TIMEOUT','secret',{outcome:'unknown'})},'unknown'],[{writeError:new Error('secret')},'unknown'],
    [{response:{sdkmessageprocessingstepimageid:ids.other}},true]]) {
    const f=fixture(options);const payload=await error(execute(f,{image_id:ids.image,patch:{name:'Changed'}},'update'),'D365_PLUGIN_IMAGE_WRITE_FAILED');
    assert.equal(payload.data.saved,saved);assert.equal(payload.data.imageId,ids.image);assert.equal(writes(f).length,1);
    assert.equal(JSON.stringify(payload).includes('secret'),false);
  }
});
test('cancellation before writing sends no mutation',async()=>{
  const f=fixture(),controller=new AbortController(),args={image_id:ids.image,patch:{name:'Changed'}};
  const preview=await f.service.mutate(args,'update');controller.abort();
  await error(f.service.mutate({...args,dry_run:false,expected_fingerprint:preview.fingerprint},'update',controller.signal),'D365_REQUEST_CANCELLED');
  assert.equal(writes(f).length,0);
});
test('handler routes images with signal through the shared transport',async t=>{
  const signal=new AbortController().signal;
  t.mock.method(PluginImageService.prototype,'query',async (args,received)=>{assert.equal(received,signal);return {success:true,args};});
  t.mock.method(PluginImageService.prototype,'mutate',async (args,operation,received)=>{assert.equal(received,signal);return {success:true,args,operation};});
  const restore={...process.env};
  Object.assign(process.env,{AUTH_TYPE:'op_ad',ORG_URL:environment.orgUrl,API_VERSION:'v9.1',AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST'});
  try {
    assert.equal((await handleToolCall('d365_plugin_images_query',{step_id:ids.step},{signal})).success,true);
    for(const operation of ['register','update','delete'])assert.equal((await handleToolCall('d365_plugin_image_'+operation,{},{signal})).operation,operation);
  }
  finally {for(const key of Object.keys(process.env))if(!(key in restore))delete process.env[key];Object.assign(process.env,restore);}
});
for(const authType of ['online','op_ad','op_ifd'])test(`${authType}: native image roundtrip uses configured org/API request branch`,async t=>{
  t.mock.method(axios,'post',async()=>({data:{access_token:'offline-token',expires_in:3600}}));
  const config=readConfig({AUTH_TYPE:authType,ORG_URL:environment.orgUrl,ENVIRONMENT_URL:environment.orgUrl,API_VERSION:'v9.1',
    TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'TEST',
    IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
  const client=new D365AuthService(config),f=fixture({existing:false});
  client.getAxiosInstance().defaults.adapter=async config=>{
    const url=new URL(config.url);assert.equal(url.origin,'https://crm.invalid');assert.ok(url.pathname.startsWith('/Demo/api/data/v9.1/'));
    const response=await f.client.requestWithResponse(url.pathname.replace('/Demo/api/data/v9.1','')+url.search,
      config.method.toUpperCase(),config.data?JSON.parse(config.data):undefined,{headers:Object.fromEntries(config.headers)});
    return {config,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};
  };
  const service=new PluginImageService(client,{...environment,authType},()=>ids.image);
  const preview=await service.mutate(registration,'register');
  const result=await service.mutate({...registration,dry_run:false,expected_fingerprint:preview.fingerprint},'register');
  assert.equal(result.readbackConfirmed,true);assert.equal(writes(f).length,1);
});
