// Local fake CRM + real stdio package. This command never contacts a real CRM.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const id='11111111-2222-3333-4444-555555555555';
let saved='<SiteMap><Area Id="Changed"/></SiteMap>',published='<SiteMap><Area Id="Old"/></SiteMap>',ignorePublish=false;
const calls=[],prefix='/QA/api/data/v9.1';
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');calls.push({method:req.method,path:url.pathname});
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(data===undefined?'':JSON.stringify(data));};
  const row=xml=>({sitemapid:id,sitemapxml:xml,sitemapname:'Offline QA',sitemapnameunique:'offline_qa',isappaware:true});
  if(url.pathname===prefix+'/sitemaps/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()')return send({value:[row(saved)]});
  if(url.pathname===prefix+'/sitemaps('+id+')')return send(row(published));
  if(url.pathname===prefix+'/PublishXml'&&req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk;
    assert.deepEqual(JSON.parse(body),{ParameterXml:'<importexportxml><sitemaps><sitemap>'+id+'</sitemap></sitemaps></importexportxml>'});
    if(!ignorePublish)published=saved;return send(undefined,204);
  }
  send({error:{message:'Unrequested fake CRM route'}},500);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'d365-sitemap-package-'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(AUTH_TYPE|ORG_URL|ENVIRONMENT_URL|TENANT_ID|CLIENT_ID|CLIENT_SECRET|API_VERSION|AD_.*|IFD_.*|NODE_OPTIONS|DOTENV_.*)$/i.test(key)));
Object.assign(env,{AUTH_TYPE:'op_ad',ORG_URL:'http://127.0.0.1:'+server.address().port+'/QA',API_VERSION:'v9.1',AD_DOMAIN:'QA',AD_USERNAME:'offline',AD_PASSWORD:'offline-placeholder',MAX_READ_RETRIES:'0',REQUEST_TIMEOUT_MS:'10000'});
const client=new Client({name:'sitemap-package-qa',version:'1.0.0'},{capabilities:{}});
const transport=new StdioClientTransport({command:process.env.D365_SMOKE_NODE||process.execPath,args:[path.resolve(process.argv[2]||'dist/index.cjs')],cwd,env,stderr:'pipe'});transport.stderr?.on('data',()=>{});
async function call(args){const result=await client.callTool({name:'publish_sitemap',arguments:args},undefined,{timeout:15000});return {result,data:JSON.parse(result.content.find(p=>p.type==='text').text)};}
try{
 await client.connect(transport,{timeout:15000});assert.equal(client.getServerVersion().version,'1.1.1');assert.equal((await client.listTools()).tools.length,116);
 const p=await call({id});assert.notEqual(p.result.isError,true);assert.equal(calls.some(c=>c.method==='POST'),false);
 const done=await call({id,dry_run:false,expected_hash:p.data.planHash,allow_sitemap_scope_publish:true});assert.notEqual(done.result.isError,true);assert.equal(done.data.publishedDefinitionVerified,true);assert.equal(saved,published);
 saved='<SiteMap><Area Id="AnotherChange"/></SiteMap>';ignorePublish=true;
 const retry=await call({id});const mismatch=await call({id,dry_run:false,expected_hash:retry.data.planHash,allow_sitemap_scope_publish:true});assert.equal(mismatch.result.isError,true);assert.equal(mismatch.data.code,'D365_SITEMAP_READBACK_MISMATCH');assert.equal(mismatch.data.data.publicationAccepted,true);assert.equal(mismatch.data.data.published,null);
 assert.equal(calls.filter(c=>c.method==='POST').length,2);assert.equal(calls.some(c=>c.path.includes('$metadata')||c.path.includes('PublishAllXml')),false);
 console.log(JSON.stringify({transport:'actual stdio package and local HTTP fake CRM',version:'1.1.1',tools:116,previewSubmittedNoWrites:true,publicationAndPublishedReadbackPassed:true,ineffectiveHttp204ReportedAsError:true,postRequests:2,csdlRequests:0,publishAllRequests:0,realCrmRequests:0},null,2));
}finally{await client.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));await fs.rmdir(cwd).catch(()=>{});}
