import test from 'node:test';
import assert from 'node:assert/strict';
import {handleToolCall} from '../src/tool_handler.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';

test('concurrent profiles isolate CRM clients and metadata caches', async () => {
 const keys={D365_PROFILE_ALPHA__AUTH_TYPE:'op_ad',D365_PROFILE_ALPHA__ORG_URL:'https://alpha.invalid',D365_PROFILE_ALPHA__AD_USERNAME:'u',D365_PROFILE_ALPHA__AD_DOMAIN:'d',D365_PROFILE_ALPHA__AD_PASSWORD:'p',D365_PROFILE_BETA__AUTH_TYPE:'op_ad',D365_PROFILE_BETA__ORG_URL:'https://beta.invalid',D365_PROFILE_BETA__AD_USERNAME:'u',D365_PROFILE_BETA__AD_DOMAIN:'d',D365_PROFILE_BETA__AD_PASSWORD:'p'};
 const previous=Object.fromEntries(Object.keys(keys).map(k=>[k,process.env[k]]));Object.assign(process.env,keys);
 const original=D365AuthService.prototype.makeRequest;
 D365AuthService.prototype.makeRequest=async function(endpoint) {const host=new URL(this.getAxiosInstance().defaults.baseURL).hostname;
   if(endpoint.includes('/Attributes?')) return {value:[{LogicalName:'new_field',DisplayName:{UserLocalizedLabel:{Label:host}}}]};
   return {LogicalName:'account',SchemaName:host,PrimaryIdAttribute:'accountid'};};
 try {
   const [a,b]=await Promise.all([handleToolCall('get_entity_metadata_summary',{logical_name:'account'},{environmentProfile:'alpha'}),handleToolCall('get_entity_metadata_summary',{logical_name:'account'},{environmentProfile:'beta'})]);
   assert.equal(a.schemaName,'alpha.invalid');assert.equal(b.schemaName,'beta.invalid');
   assert.equal((await handleToolCall('get_entity_metadata_summary',{logical_name:'account'},{environmentProfile:'alpha'})).schemaName,'alpha.invalid');
   await assert.rejects(handleToolCall('get_entity_metadata_summary',{logical_name:'account'},{environmentProfile:'missing'}),/profile/);
 } finally {D365AuthService.prototype.makeRequest=original; for(const k of Object.keys(keys)) {if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});
