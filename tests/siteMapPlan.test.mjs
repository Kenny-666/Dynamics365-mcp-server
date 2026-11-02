import test from 'node:test';
import assert from 'node:assert/strict';
import {planSiteMapPublication} from '../src/services/siteMapPlan.ts';
import {CrmRequestError} from '../src/errors.ts';
const id='11111111-1111-1111-1111-111111111111',app='22222222-2222-2222-2222-222222222222';
test('combines independent read-only previews and reports dependency scope',async()=>{
 const seen=[];const result=await planSiteMapPublication({id},{publishSiteMap:async a=>{seen.push(a);return {planHash:'site'};},inspectApplications:async()=>({applications:[{id:app}]}),publishApp:async a=>{seen.push(a);return {planHash:'app'};},dependencies:async a=>{assert.equal(a.component_type,62);return {items:[],complete:true};}});
 assert.equal(result.publicationAttempted,false);assert.equal(result.appPreviews[0].preview.planHash,'app');assert.equal(result.requiredDependencies.status,'available');assert.deepEqual(seen,[{id},{id:app}]);
});
test('preserves site preview and explicit partial state when optional reads fail',async()=>{
 const result=await planSiteMapPublication({id},{publishSiteMap:async()=>({planHash:'site'}),inspectApplications:async()=>{throw new Error('secret');},publishApp:async()=>{throw Error('not called');},dependencies:async()=>{throw new CrmRequestError('NO_CSDL','secret');}});
 assert.equal(result.applications.status,'unavailable');assert.equal(result.requiredDependencies.code,'NO_CSDL');assert.equal(result.appPreviews.length,0);assert.ok(!JSON.stringify(result).includes('secret'));
});
