import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigurationError, readConfig, validateConfig } from '../src/config.ts';

const online = {
  TENANT_ID: 'example-tenant', CLIENT_ID: 'example-client', CLIENT_SECRET: 'secret-for-test',
  ORG_URL: 'https://example.crm.invalid',
};

test('configuration can be read without credentials; validation reports setting names', () => {
  const config = readConfig({});
  assert.throws(() => validateConfig(config), error => {
    assert.ok(error instanceof ConfigurationError);
    assert.equal(error.code, 'D365_CONFIG_INVALID');
    for (const setting of ['ORG_URL', 'TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET']) {
      assert.ok(error.message.includes(setting));
    }
    return true;
  });
});

test('Online, NTLM and IFD accept their own credentials without requiring other auth settings', () => {
  const environments = [online, {
    AUTH_TYPE: 'op_ad', ORG_URL: 'http://crm.invalid/Demo/',
    AD_USERNAME: 'user', AD_PASSWORD: 'password', AD_DOMAIN: 'DOMAIN',
  }, {
    AUTH_TYPE: 'op_ifd', ORG_URL: 'https://crm.invalid',
    IFD_ADFS_URL: 'https://adfs.invalid', IFD_CLIENT_ID: 'client',
    IFD_USERNAME: 'DOMAIN\\user', IFD_PASSWORD: 'password',
  }];
  for (const env of environments) assert.doesNotThrow(() => validateConfig(readConfig(env)));
});

test('partial AD/IFD settings report missing fields instead of constructor errors', () => {
  assert.throws(() => validateConfig(readConfig({AUTH_TYPE:'op_ad'})), /AD_USERNAME.*AD_PASSWORD.*AD_DOMAIN/);
  assert.throws(() => validateConfig(readConfig({AUTH_TYPE:'op_ifd'})), /IFD_ADFS_URL.*IFD_CLIENT_ID.*IFD_USERNAME.*IFD_PASSWORD/);
});

test('invalid auth type, version and cache TTL fail before connection creation', () => {
  for (const [settings, expected] of [
    [{AUTH_TYPE:'typo'}, /AUTH_TYPE/],
    [{API_VERSION:'9.2'}, /API_VERSION/],
    [{CACHE_TTL:'30seconds'}, /CACHE_TTL/],
    [{CACHE_TTL:'-1'}, /CACHE_TTL/],
    [{CACHE_TTL:'1.5'}, /CACHE_TTL/],
    [{REQUEST_TIMEOUT_MS:'0'}, /REQUEST_TIMEOUT_MS/],
    [{MAX_READ_RETRIES:'6'}, /MAX_READ_RETRIES/],
    [{MAX_RETRY_DELAY_MS:'-1'}, /MAX_RETRY_DELAY_MS/],
  ]) assert.throws(() => validateConfig(readConfig({...online, ...settings})), expected);
});

test('URL validation does not reflect credentials or query secrets in errors', () => {
  const env = {...online, ORG_URL:'https://user:do-not-echo@crm.invalid?token=do-not-echo'};
  assert.throws(() => validateConfig(readConfig(env)), error => {
    assert.match(error.message, /ORG_URL/);
    assert.ok(!error.message.includes('do-not-echo'));
    assert.ok(!error.message.includes(online.CLIENT_SECRET));
    return true;
  });
});

test('token scope and API URL cannot silently target different organizations', () => {
  assert.throws(() => validateConfig(readConfig({
    ...online, ENVIRONMENT_URL:'https://other.crm.invalid',
  })), /same organization/);
  assert.doesNotThrow(() => validateConfig(readConfig({
    ...online, ENVIRONMENT_URL:`${online.ORG_URL}/`,
  })));
});

test('IFD rejects unsupported grants and malformed token paths', () => {
  const env = {
    AUTH_TYPE:'op_ifd', ORG_URL:'https://crm.invalid', IFD_ADFS_URL:'https://adfs.invalid',
    IFD_CLIENT_ID:'client', IFD_USERNAME:'user', IFD_PASSWORD:'password',
  };
  assert.throws(() => validateConfig(readConfig({...env, IFD_GRANT_TYPE:'client_credentials'})), /IFD_GRANT_TYPE/);
  assert.throws(() => validateConfig(readConfig({...env, IFD_TOKEN_PATH:'https://elsewhere.invalid/token'})), /IFD_TOKEN_PATH/);
});

test('CACHE_TTL_SECONDS is an alias and the existing CACHE_TTL takes precedence', () => {
  assert.equal(readConfig({...online, CACHE_TTL_SECONDS:'120'}).cacheTtl, 120);
  assert.equal(readConfig({...online, CACHE_TTL:'300', CACHE_TTL_SECONDS:'120'}).cacheTtl, 300);
});
