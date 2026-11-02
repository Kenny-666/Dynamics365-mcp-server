import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSiteMapApplications } from '../src/services/siteMapApplications.ts';
const sitemap='11111111-1111-1111-1111-111111111111', unique='22222222-2222-2222-2222-222222222222', app='33333333-3333-3333-3333-333333333333';
test('resolves and deduplicates direct application associations',async () => {
 let calls=0;
 const client={makeRequest:async path => { calls++; return path.startsWith('/appmodulecomponents?') ? {value:[{objectid:sitemap,_appmoduleidunique_value:unique},{objectid:sitemap,_appmoduleidunique_value:unique}]} : {value:[{appmoduleid:app,appmoduleidunique:unique,name:'App'}]};}};
 const result=await inspectSiteMapApplications(client,{id:sitemap});
 assert.equal(calls,2); assert.equal(result.applications.length,1); assert.equal(result.applications[0].id,app);
 assert.equal(result.publication_status,'not_checked'); assert.equal(result.publication_attempted,false);
});
test('fails closed on pagination, wrong target or invalid identifier',async () => {
 await assert.rejects(inspectSiteMapApplications({makeRequest:async()=>({value:[], '@odata.nextLink':'more'})},{id:sitemap}),/incomplete or paginated/);
 await assert.rejects(inspectSiteMapApplications({makeRequest:async()=>({value:[{objectid:app,_appmoduleidunique_value:unique}]})},{id:sitemap}),/another SiteMap/);
 await assert.rejects(inspectSiteMapApplications({makeRequest:async()=>{throw new Error('should not call');}},{id:'invalid'}),/GUID/);
});
