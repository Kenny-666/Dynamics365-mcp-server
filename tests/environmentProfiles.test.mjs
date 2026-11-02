import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, validateConfig } from '../src/config.ts';
test('named profile isolates all connection and credential settings', () => {
 const config = readConfig({D365_PROFILE:'test', ORG_URL:'https://wrong.invalid', CLIENT_SECRET:'wrong-secret',
  D365_PROFILE_TEST__AUTH_TYPE:'op_ad',D365_PROFILE_TEST__ORG_URL:'https://test.invalid',
  D365_PROFILE_TEST__AD_USERNAME:'user', D365_PROFILE_TEST__AD_PASSWORD:'test-secret',D365_PROFILE_TEST__AD_DOMAIN:'DOMAIN',
  D365_PROFILE_PROD__ORG_URL:'https://production.invalid',D365_PROFILE_PROD__AD_PASSWORD:'prod-secret'});
 assert.equal(config.orgUrl,'https://test.invalid'); assert.equal(config.ad.password,'test-secret');
 assert.equal(config.clientSecret,''); assert.doesNotThrow(() => validateConfig(config));
});
test('selected profiles never inherit missing credentials or targets', () => {
 const config=readConfig({D365_PROFILE:'test', D365_PROFILE_TEST__AUTH_TYPE:'op_ad', ORG_URL:'https://wrong.invalid',AD_PASSWORD:'wrong'});
 assert.equal(config.orgUrl,''); assert.equal(config.ad.password,undefined);
 assert.throws(() => validateConfig(config),/ORG_URL/);
});
test('invalid or absent named profiles are rejected without leaking input', () => {
 assert.throws(() => readConfig({D365_PROFILE:'bad/profile'}),/D365_PROFILE/);
 assert.throws(() => readConfig({D365_PROFILE:'missing', D365_PROFILE_OTHER__ORG_URL:'https://secret.invalid'}),error => !error.message.includes('secret.invalid'));
});
