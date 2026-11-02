import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import {SiteMapPublicationService} from '../src/services/siteMapPublication.ts';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
import {readConfig} from '../src/config.ts';
import {RecordMutationService} from '../src/services/recordMutation.ts';
import {tools,handleToolCall} from '../src/tool_handler.ts';

const id='abcdefab-1234-5678-abcd-123456789abc',other='11111111-1111-1111-1111-111111111111';
const env={orgUrl:'https://crm.invalid/Demo',authType:'op_ad',apiVersion:'v9.1'};
const draft='<SiteMap><Area Id="QA"><Group Id="Group"><SubArea Id="Nav" Url="/qa"/></Group></Area></SiteMap>';
const old='<SiteMap><Area Id="Old"/></SiteMap>';
const row=xml=>({sitemapid:id,sitemapname:'QA navigation',sitemapnameunique:'qa_nav',isappaware:true,sitemapxml:xml});
const response=(data=null,status=200)=>({data,status,headers:{}});
function fixture(options={}) {
  const calls=[];let published=options.published??old,saved=options.saved??draft,accepted=false;
  const client={async makeRequest(){throw Error('Use the typed response client');},async requestWithResponse(endpoint,method='GET',body,requestOptions={}){
    const call={endpoint,method,body,options:requestOptions};calls.push(call);
    const custom=await options.request?.(call,{accepted,calls});if(custom!==undefined)return custom;
    assert.equal(endpoint.includes('$metadata'),false);assert.equal(endpoint.includes('PublishAllXml'),false);
    if(method==='POST'){assert.equal(endpoint,'/PublishXml');if(options.postError)throw options.postError;accepted=true;if(!options.ignorePublish)published=saved;options.afterPost?.();return response(null,options.postStatus??204);}
    if(endpoint.includes('RetrieveUnpublishedMultiple'))return response(options.page??{value:[options.savedRow??row(saved)]});
    assert.ok(endpoint.startsWith('/sitemaps('+id+')?'));
    if(accepted&&options.readbackError)throw options.readbackError;
    if(options.publishedMissing&&!accepted)return response(null,404);
    return response(row(published));
  }};
  return {service:new SiteMapPublicationService(client,env),client,calls,setSaved:xml=>{saved=xml;},setPublished:xml=>{published=xml;}};
}
const execute=(service,preview,extra={})=>service.publish({id,dry_run:false,expected_hash:preview.planHash,allow_sitemap_scope_publish:true,...extra});
const posts=f=>f.calls.filter(c=>c.method==='POST');

test('SiteMap generic record updates explicitly direct callers to the separate publish tool',async()=>{
  const calls=[];const client={async makeRequest(){return {value:[{LogicalName:'sitemap',EntitySetName:'sitemaps',PrimaryIdAttribute:'sitemapid',IsOptimisticConcurrencyEnabled:false}]};},async requestWithResponse(endpoint,method='GET'){calls.push({endpoint,method});return response(method==='GET'?{sitemapid:id}:null,method==='GET'?200:204);}};
  const result=await new RecordMutationService(client,env).execute('update',{collection_name:'sitemaps',id,data:{sitemapxml:draft},allow_unprotected_write:true,dry_run:false});assert.equal(result.saved,true);assert.equal(result.publication.nextTool,'publish_sitemap');assert.equal(result.publication.published,null);assert.equal(calls.some(c=>c.endpoint==='/PublishXml'),false);
});

test('SiteMap default preview reads saved and published layers without CSDL or publication',async()=>{
  const f=fixture(),p=await f.service.publish({id:id.toUpperCase()});assert.equal(p.dryRun,true);assert.equal(p.sitemapId,id);assert.equal(p.noChange,false);assert.match(p.planHash,/^[a-f0-9]{64}$/);assert.equal(posts(f).length,0);
  assert.equal(f.calls.length,2);const url=new URL(f.calls[0].endpoint,'https://crm.invalid');assert.equal(url.searchParams.get('$filter'),'sitemapid eq '+id);assert.equal(url.searchParams.get('$top'),'2');assert.equal(f.calls[0].options.headers.Consistency,'Strong');assert.equal(JSON.stringify(p).includes(draft),false);assert.equal(p.concurrencyProtected,false);assert.match(p.scopeNote,/Legacy/);
});
test('SiteMap execution publishes the saved target once and verifies the published XML',async()=>{
  const f=fixture(),p=await f.service.publish({id}),r=await execute(f.service,p);assert.equal(r.published,true);assert.equal(r.publicationAccepted,true);assert.equal(r.publishedDefinitionVerified,true);assert.equal(r.runtimeVerified,false);assert.equal(r.publicationStatus,'verified');assert.equal(posts(f).length,1);assert.deepEqual(posts(f)[0].body,{ParameterXml:'<importexportxml><sitemaps><sitemap>'+id+'</sitemap></sitemaps></importexportxml>'});assert.ok(f.calls.every(c=>['GET','POST'].includes(c.method)));assert.equal(r.savedDefinitionHash,r.publishedDefinitionHash);
});
test('SiteMap publication works when only an unpublished native definition exists',async()=>{
  const f=fixture({publishedMissing:true}),p=await f.service.publish({id});assert.equal(p.publishedDefinitionHash,null);assert.equal((await execute(f.service,p)).published,true);
});
test('SiteMap stale saved definition blocks publication without replaying its save',async()=>{
  const f=fixture(),p=await f.service.publish({id});f.setSaved('<SiteMap><Area Id="Changed"/></SiteMap>');await assert.rejects(execute(f.service,p),{code:'D365_SITEMAP_CONFLICT'});assert.equal(posts(f).length,0);
});
test('SiteMap changed published baseline also invalidates the preview fingerprint',async()=>{
  const f=fixture(),p=await f.service.publish({id});f.setPublished('<SiteMap><Area Id="Concurrent"/></SiteMap>');await assert.rejects(execute(f.service,p),{code:'D365_SITEMAP_CONFLICT'});assert.equal(posts(f).length,0);
});
test('SiteMap already matching definitions skip publication, ignoring harmless XML formatting',async()=>{
  const saved='<SiteMap><Area Id="QA" Title="Name"><Group Id="G"/></Area></SiteMap>';
  const published='<?xml version="1.0"?><SiteMap>\n<Area Title="Name" Id="QA"><!-- comment --><Group Id="G"> </Group></Area>\n</SiteMap>';
  const f=fixture({saved,published}),p=await f.service.publish({id});assert.equal(p.noChange,true);const r=await execute(f.service,p);assert.equal(r.publicationStatus,'already_matches');assert.equal(r.publicationAccepted,false);assert.equal(posts(f).length,0);
});
test('SiteMap camelCase aliases behave consistently and conflicting aliases are rejected',async()=>{
  const f=fixture(),p=await f.service.publish({id,dryRun:true});assert.equal((await f.service.publish({id,dryRun:false,expectedHash:p.planHash,allowSitemapScopePublish:true})).published,true);
  await assert.rejects(f.service.publish({id,dry_run:true,dryRun:false}),{code:'D365_SITEMAP_INVALID'});
});
test('SiteMap invalid inputs, injection and missing execute acknowledgement fail before reads',async()=>{
  const f=fixture();for(const args of [null,[],{}, {id:'x'},{id:id+')/PublishAllXml'},{id:'{'+id+'}'},{id,dry_run:'false'},{id,expected_hash:2},{id,expected_hash:'x'},{id,dry_run:false},{id,dry_run:false,expected_hash:'a'.repeat(64)},{id,dry_run:false,expected_hash:'a'.repeat(64),allow_sitemap_scope_publish:false},{id,allow_sitemap_scope_publish:'true'},{id,publish_all:true}])await assert.rejects(f.service.publish(args));assert.equal(f.calls.length,0);
});
for(const [name,page] of [['empty',{value:[]}],['duplicate',{value:[row(draft),row(draft)]}],['wrong identity',{value:[{...row(draft),sitemapid:other}]}],['partial',{value:[row(draft)],'@odata.nextLink':'https://outside.invalid/'}],['missing XML',{value:[{sitemapid:id}]}]])test('SiteMap rejects '+name+' unpublished baseline',async()=>{const f=fixture({page});await assert.rejects(f.service.publish({id}));assert.equal(posts(f).length,0);assert.equal(f.calls.length,1);});
for(const xml of ['<!DOCTYPE SiteMap [<!ENTITY x SYSTEM "file:///private">]><SiteMap>&x;</SiteMap>','<Wrong/>','<SiteMap><Area/></Wrong>','<SiteMap A="&#0;"/>','<SiteMap>'+'<N>'.repeat(70)+'</N>'.repeat(70)+'</SiteMap>'])test('SiteMap unsafe or unsupported XML blocks publication '+xml.slice(0,25),async()=>{const f=fixture({saved:xml});await assert.rejects(f.service.publish({id}),{code:'D365_SITEMAP_XML_INVALID'});assert.equal(posts(f).length,0);});
test('SiteMap unavailable unpublished API is not silently replaced by the published layer',async()=>{
  const f=fixture({request:c=>{if(c.endpoint.includes('RetrieveUnpublishedMultiple'))throw new CrmRequestError('D365_HTTP_ERROR','secret server text',{status:405,outcome:'rejected'});}});await assert.rejects(f.service.publish({id}),error=>{assert.equal(error.code,'D365_SITEMAP_READ_FAILED');assert.equal(error.toJSON().status,405);assert.equal(JSON.stringify(error.toJSON()).includes('secret server text'),false);return true;});assert.equal(f.calls.length,1);
});
for(const outcome of ['rejected','unknown','not_sent'])test('SiteMap preserves '+outcome+' publication failure evidence without retry',async()=>{
  const f=fixture({postError:new CrmRequestError('D365_HTTP_ERROR','password-and-xml-must-not-leak',{status:outcome==='rejected'?403:undefined,outcome})}),p=await f.service.publish({id});await assert.rejects(execute(f.service,p),error=>{const data=toolErrorPayload(error);assert.equal(data.code,'D365_SITEMAP_PUBLISH_FAILED');assert.equal(data.data.publicationAccepted,outcome==='unknown'?null:false);assert.equal(data.retryable,false);assert.equal(JSON.stringify(data).includes('password-and-xml'),false);return true;});assert.equal(posts(f).length,1);
});
test('SiteMap HTTP success with unchanged published XML is a readback failure',async()=>{
  const f=fixture({ignorePublish:true}),p=await f.service.publish({id});await assert.rejects(execute(f.service,p),e=>{assert.equal(e.code,'D365_SITEMAP_READBACK_MISMATCH');assert.equal(e.data.publicationAccepted,true);assert.equal(e.data.published,null);assert.equal(e.data.publishedDefinitionVerified,false);return true;});assert.equal(posts(f).length,1);
});
test('SiteMap readback errors retain acceptance and withhold native error text',async()=>{
  const f=fixture({readbackError:new CrmRequestError('D365_HTTP_ERROR','private XML and token',{status:403,outcome:'rejected'})}),p=await f.service.publish({id});await assert.rejects(execute(f.service,p),e=>{assert.equal(e.code,'D365_SITEMAP_READBACK_FAILED');assert.equal(e.data.publicationAccepted,true);assert.equal(e.data.published,null);assert.equal(JSON.stringify(e.toJSON()).includes('private XML'),false);return true;});assert.equal(posts(f).length,1);
});
test('SiteMap asynchronous/unexpected response cannot be called verified publication',async()=>{
  const f=fixture({postStatus:202}),p=await f.service.publish({id});await assert.rejects(execute(f.service,p),e=>e.code==='D365_SITEMAP_PUBLISH_RESPONSE_INVALID'&&e.data.publicationAccepted===null);assert.equal(posts(f).length,1);
});
test('SiteMap pre-cancelled calls perform no reads or publication',async()=>{const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.service.publish({id},controller.signal),{code:'D365_REQUEST_ABORTED'});assert.equal(f.calls.length,0);});
test('SiteMap cancellation after acceptance is a readback failure, never a replay',async()=>{const controller=new AbortController(),f=fixture({afterPost:()=>controller.abort()}),p=await f.service.publish({id});await assert.rejects(f.service.publish({id,dry_run:false,expected_hash:p.planHash,allow_sitemap_scope_publish:true},controller.signal),e=>e.code==='D365_SITEMAP_READBACK_FAILED'&&e.data.publicationAccepted===true);assert.equal(posts(f).length,1);});
test('SiteMap schema is registered exactly once and MCP route forwards cancellation',async t=>{
  const definitions=tools.filter(t=>t.name==='publish_sitemap');assert.equal(definitions.length,1);const validate=new Ajv({strict:false}).compile(definitions[0].inputSchema);assert.equal(validate({id}),true);assert.equal(validate({id,publishAll:true}),false);
  const config={AUTH_TYPE:'op_ad',ORG_URL:env.orgUrl,API_VERSION:'v9.1',AD_DOMAIN:'QA',AD_USERNAME:'offline',AD_PASSWORD:'offline'};const before=Object.fromEntries(Object.keys(config).map(k=>[k,process.env[k]]));
  const controller=new AbortController();const mock=t.mock.method(SiteMapPublicationService.prototype,'publish',async(raw,signal)=>{assert.equal(signal,controller.signal);return {routed:raw.id};});try{Object.assign(process.env,config);assert.deepEqual(await handleToolCall('publish_sitemap',{id},{signal:controller.signal}),{routed:id});assert.equal(mock.mock.callCount(),1);}finally{for(const [key,value] of Object.entries(before))value===undefined?delete process.env[key]:process.env[key]=value;}
});
for(const authType of ['online','op_ad','op_ifd'])test(authType+': real request branch sends native SiteMap publication and independent readback',async t=>{
  t.mock.method(axios,'post',async()=>({data:{access_token:'offline-token',expires_in:3600}}));
  const config=readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,ENVIRONMENT_URL:env.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',AD_USERNAME:'offline',AD_PASSWORD:'offline',AD_DOMAIN:'QA',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'}),client=new D365AuthService(config),f=fixture();
  client.getAxiosInstance().defaults.adapter=async config=>{const url=new URL(config.url);assert.equal(url.origin,'https://crm.invalid');assert.ok(url.pathname.startsWith('/Demo/api/data/v9.1/'));const result=await f.client.requestWithResponse(url.pathname.replace('/Demo/api/data/v9.1','')+url.search,config.method.toUpperCase(),config.data?JSON.parse(config.data):undefined,{headers:config.headers});return {config,data:result.data,status:result.status,statusText:'OK',headers:new AxiosHeaders()};};
  const service=new SiteMapPublicationService(client,{...env,authType}),p=await service.publish({id});assert.equal((await execute(service,p)).published,true);assert.equal(posts(f).length,1);
});
