import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { readConfig } from '../src/config.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { RecordService } from '../src/services/record.ts';
import { FetchXmlService } from '../src/services/fetchXml.ts';
import { clearQueryContinuations } from '../src/services/queryPaging.ts';
import { rootStateInOData } from '../src/services/queryState.ts';

const base = 'https://crm.invalid/api/data/v9.2/';
const configuration = readConfig({AUTH_TYPE:'op_ad', ORG_URL:'https://crm.invalid',
  AD_USERNAME:'offline', AD_PASSWORD:'offline-password', AD_DOMAIN:'OFFLINE'});
const validator = new D365AuthService(configuration);
const parse = source => new DOMParser().parseFromString(source, 'application/xml');
const nodes = (element, name) => Array.from(element.childNodes).filter(node => node.nodeType === 1 && node.tagName === name);
const fetchDoc = endpoint => parse(new URL(endpoint, base).searchParams.get('fetchXml'));
const row = id => ({id});
const cookieAnnotation = raw => '<cookie pagenumber="1" pagingcookie="' + encodeURIComponent(encodeURIComponent(raw)) + '" />';

function fixture(data = () => ({value:[]}), settings = {}) {
  const calls = [];
  const records = [];
  const client = {
    validateEndpoint:endpoint => validator.validateEndpoint(endpoint),
    async makeRequest(endpoint, method = 'GET', body, options) {
      calls.push({endpoint, method, body, options});
      const url = new URL(endpoint, base);
      if (url.pathname.includes('/EntityDefinitions')) {
        const entity = {LogicalName:'account', EntitySetName:'accounts', PrimaryIdAttribute:'accountid', ...settings.entity};
        if (url.pathname.includes('/Microsoft.Dynamics.CRM.StateAttributeMetadata')) {
          return {OptionSet:{Options:(settings.states || [0,1]).map(Value => ({Value}))}};
        }
        if (url.pathname.includes('/Attributes')) return {value:settings.hasState === false ? [] : [{LogicalName:'statecode', AttributeType:'State'}]};
        return url.pathname.endsWith('/EntityDefinitions') ? {value:[entity]} : entity;
      }
      records.push({endpoint, method, body, options});
      return data(endpoint, records.length, options);
    },
  };
  return {client, calls, records, odata:new RecordService(client), fetch:new FetchXmlService(client)};
}

test('OData lexing distinguishes actual root state conditions from literals, navigation and lambdas', () => {
  const cases = [
    ["name eq 'statecode'", false], ["name eq 'O''statecode'", false],
    ['statecode eq 1', true], ['$it/statecode eq 1', true],
    ['parentaccountid/statecode eq 1', false],
    ['contacts/any(c:c/statecode eq 1)', false],
    ['contacts/any(c:statecode eq 1)', 'ambiguous'],
    ["Microsoft.Dynamics.CRM.In(PropertyName='statecode',PropertyValues=['1'])", true],
    ["contains(name,'PropertyName=statecode')", false],
  ];
  for (const [filter, expected] of cases) assert.equal(rootStateInOData(filter), expected, filter);
});

test('legacy OData adds state=0 around the existing filter and sorts by a unique tie-breaker', async () => {
  const f = fixture(() => ({value:[{id:1,'name@OData.Community.Display.V1.FormattedValue':'label'}]}));
  const result = await f.odata.searchRecords('accounts', 'name', "name eq 'statecode'", undefined,
    {orderby:'name desc', formatted_values:true, expand:'primarycontactid($select=fullname)'});
  const params = new URL(f.records[0].endpoint, base).searchParams;
  assert.equal(params.get('$filter'), "(name eq 'statecode') and (statecode eq 0)");
  assert.equal(params.get('$orderby'), 'name desc,accountid');
  assert.equal(params.get('$expand'), 'primarycontactid($select=fullname)');
  assert.match(f.records[0].options.headers.Prefer, /maxpagesize=500/);
  assert.match(f.records[0].options.headers.Prefer, /FormattedValue/);
  assert.equal(result.value[0]['name@OData.Community.Display.V1.FormattedValue'], 'label');
  assert.equal(result.query.state.disposition, 'injected');
});

test('explicit root state is preserved while a child state condition does not suppress root filtering', async () => {
  for (const [filter, expected] of [['statecode eq 1', 'preserved_explicit_filter'],
    ['contacts/any(c:c/statecode eq 1)', 'injected']]) {
    const f = fixture();
    const result = await f.odata.searchRecords('accounts', undefined, filter);
    assert.equal(result.query.state.disposition, expected);
    const actual = new URL(f.records[0].endpoint, base).searchParams.get('$filter');
    if (expected === 'preserved_explicit_filter') assert.equal(actual, filter);
    else assert.equal(actual, '(' + filter + ') and (statecode eq 0)');
  }
});

test('all mode adds no filter and does not read state options', async () => {
  const f = fixture();
  const result = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {state_mode:'all'});
  assert.equal(new URL(f.records[0].endpoint, base).searchParams.has('$filter'), false);
  assert.equal(f.calls.filter(call => call.endpoint.includes('/Attributes')).length, 0);
  assert.equal(result.query.state.disposition, 'no_implicit_filter');
});

test('tables without statecode or without state 0 skip the legacy default explicitly', async () => {
  for (const [settings, reason] of [[{hasState:false}, 'skipped_missing_statecode'],
    [{states:[1,2]}, 'skipped_missing_zero_state']]) {
    const f = fixture(undefined, settings);
    const result = await f.odata.searchRecords('accounts');
    assert.equal(result.query.state.disposition, reason);
    assert.equal(new URL(f.records[0].endpoint, base).searchParams.has('$filter'), false);
  }
});

test('explicit state values are validated and conflicting filters are rejected before data queries', async () => {
  const valid = fixture(undefined, {states:[1,2]});
  const result = await valid.odata.searchRecords('accounts', undefined, undefined, undefined, {state_mode:'values', state_values:[2]});
  assert.equal(result.query.filter, 'statecode eq 2');
  for (const [settings, filter, options] of [
    [{hasState:false}, undefined, {state_mode:'values', state_values:[0]}],
    [{states:[1,2]}, undefined, {state_mode:'values', state_values:[0]}],
    [{}, 'statecode eq 1', {state_mode:'values', state_values:[0]}],
  ]) {
    const f = fixture(undefined, settings);
    await assert.rejects(f.odata.searchRecords('accounts', undefined, filter, undefined, options), {code:'D365_QUERY_INVALID'});
    assert.equal(f.records.length, 0);
  }
});

test('OData default reads one page; continuation resumes without repeating metadata or changing filters', async () => {
  const next = base + 'accounts?$skiptoken=a%2Bb%2520&$select=name';
  const f = fixture(endpoint => endpoint === next ? {value:[row(3)]} : {value:[row(1),row(2)], '@odata.nextLink':next});
  const first = await f.odata.searchRecords('accounts');
  assert.deepEqual(first.value.map(item => item.id), [1,2]);
  assert.equal(first.paging.hasMore, true);
  const count = f.calls.length;
  const last = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {continuation:first.paging.continuation});
  assert.equal(f.calls.length - count, 1);
  assert.equal(f.records[1].endpoint, next);
  assert.deepEqual(last.value, [row(3)]);
  assert.equal(last.paging.complete, true);
  assert.equal(last.paging.continuation, null);
});

test('hard caps in the middle of a page buffer rows and never skip them on resume', async () => {
  const next = base + 'accounts?$skiptoken=two';
  const third = base + 'accounts?$skiptoken=three';
  const f = fixture(endpoint => endpoint === next ? {value:[row(3),row(4)], '@odata.nextLink':third} :
    endpoint === third ? {value:[row(5)]} : {value:[row(1),row(2)], '@odata.nextLink':next});
  const first = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {fetch_all:true, max_records:3});
  assert.deepEqual(first.value, [row(1),row(2),row(3)]);
  assert.equal(first['@odata.nextLink'], undefined);
  const second = await f.odata.searchRecords('accounts', undefined, undefined, undefined,
    {continuation:first.paging.continuation, fetch_all:true, max_records:2});
  assert.deepEqual(second.value, [row(4),row(5)]);
  assert.equal(second.paging.complete, true);
  assert.equal(f.records.length, 3);
});

test('a server page larger than the call cap can be drained without replaying the request', async () => {
  const f = fixture(() => ({value:[row(1),row(2),row(3)]}));
  let result = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {max_records:1});
  const ids = result.value.map(item => item.id);
  while (result.paging.continuation) {
    result = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {continuation:result.paging.continuation, max_records:1});
    ids.push(...result.value.map(item => item.id));
  }
  assert.deepEqual(ids, [1,2,3]);
  assert.equal(f.records.length, 1);
});

test('native top is not combined with maxpagesize and still supports per-call buffering', async () => {
  const f = fixture(() => ({value:[row(1),row(2),row(3)]}));
  const first = await f.odata.searchRecords('accounts', undefined, undefined, 3, {max_records:2});
  assert.equal(f.records[0].options.headers.Prefer, undefined);
  assert.equal(new URL(f.records[0].endpoint, base).searchParams.get('$top'), '3');
  const last = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {continuation:first.paging.continuation});
  assert.deepEqual(last.value, [row(3)]);
  await assert.rejects(f.odata.searchRecords('accounts', undefined, undefined, 3, {page_size:1}), /cannot be combined/);
});

test('max_pages bounds automatic traversal and returns a usable continuation', async () => {
  const next = base + 'accounts?$skiptoken=next';
  const f = fixture((_endpoint, count) => count === 1 ? {value:[row(1)], '@odata.nextLink':next} : {value:[row(2)]});
  const first = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {fetch_all:true, max_pages:1});
  assert.equal(first.paging.stoppedBecause, 'max_pages');
  const last = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {continuation:first.paging.continuation});
  assert.deepEqual(last.value, [row(2)]);
});

test('continuations reject query changes, other collections/connections and cache clearing', async () => {
  const f = fixture(() => ({value:[row(1),row(2)]}));
  const first = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {max_records:1});
  const cursor = first.paging.continuation;
  await assert.rejects(f.odata.searchRecords('accounts', undefined, 'name eq 1', undefined, {continuation:cursor}), /saved query/);
  await assert.rejects(f.odata.searchRecords('contacts', undefined, undefined, undefined, {continuation:cursor}), /does not match/);
  await assert.rejects(fixture().odata.searchRecords('accounts', undefined, undefined, undefined, {continuation:cursor}), {code:'D365_QUERY_CONTINUATION_EXPIRED'});
  clearQueryContinuations(f.client);
  await assert.rejects(f.odata.searchRecords('accounts', undefined, undefined, undefined, {continuation:cursor}), {code:'D365_QUERY_CONTINUATION_EXPIRED'});
});

test('continuations expire after five minutes', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const f = fixture(() => ({value:[row(1),row(2)]}));
  const first = await f.odata.searchRecords('accounts', undefined, undefined, undefined, {max_records:1});
  now += 300001;
  await assert.rejects(f.odata.searchRecords('accounts', undefined, undefined, undefined,
    {continuation:first.paging.continuation}), {code:'D365_QUERY_CONTINUATION_EXPIRED'});
});

test('failed and concurrent resumes preserve the original cursor for a later retry', async () => {
  const next = base + 'accounts?$skiptoken=next';
  let rejectRead;
  let failOnce = true;
  const f = fixture((_endpoint, count) => count === 1 ? {value:[row(1)], '@odata.nextLink':next} :
    failOnce ? new Promise((_resolve, reject) => { rejectRead = reject; }) : {value:[row(2)]});
  const first = await f.odata.searchRecords('accounts');
  const opts = {continuation:first.paging.continuation};
  const pending = f.odata.searchRecords('accounts', undefined, undefined, undefined, opts);
  const rejected = assert.rejects(pending, /temporary read failure/);
  await assert.rejects(f.odata.searchRecords('accounts', undefined, undefined, undefined, opts), {code:'D365_QUERY_CONTINUATION_BUSY'});
  failOnce = false;
  rejectRead(new Error('temporary read failure'));
  await rejected;
  assert.deepEqual((await f.odata.searchRecords('accounts', undefined, undefined, undefined, opts)).value, [row(2)]);
  await assert.rejects(f.odata.searchRecords('accounts', undefined, undefined, undefined, opts), {code:'D365_QUERY_CONTINUATION_EXPIRED'});
});

test('external and repeating OData links fail before another authenticated request', async () => {
  const external = fixture(() => ({value:[row(1)], '@odata.nextLink':'https://other.invalid/api/data/v9.2/accounts'}));
  await assert.rejects(external.odata.searchRecords('accounts', undefined, undefined, undefined, {fetch_all:true}), {code:'D365_ENDPOINT_INVALID'});
  assert.equal(external.records.length, 1);
  const cycle = fixture(endpoint => ({value:[row(1)], '@odata.nextLink':validator.validateEndpoint(endpoint)}));
  await assert.rejects(cycle.odata.searchRecords('accounts', undefined, undefined, undefined, {fetch_all:true}), {code:'D365_QUERY_RESPONSE_INVALID'});
  assert.equal(cycle.records.length, 1);
});

test('invalid query options fail before metadata or data is requested', async () => {
  for (const options of [{max_records:0}, {fetch_all:'yes'}, {page_size:1.5}, {state_values:[0]}, {state_mode:'values', state_values:[]}]) {
    const f = fixture();
    await assert.rejects(f.odata.searchRecords('accounts', undefined, undefined, undefined, options), {code:'D365_QUERY_INVALID'});
    assert.equal(f.calls.length, 0);
  }
});

test('FetchXML handles self-closing entities, reordered attributes and state selection structurally', async () => {
  const f = fixture();
  const result = await f.fetch.query('<fetch><entity alias="a" name="account"><attribute name="statecode"/></entity></fetch>');
  const document = fetchDoc(f.records[0].endpoint);
  const entity = document.getElementsByTagName('entity')[0];
  assert.equal(entity.getElementsByTagName('condition')[0].getAttribute('attribute'), 'statecode');
  assert.equal(entity.getElementsByTagName('order')[0].getAttribute('attribute'), 'accountid');
  assert.equal(result.query.state.disposition, 'injected');
  assert.equal(document.documentElement.getAttribute('count'), '500');
  assert.equal(document.documentElement.getAttribute('page'), '1');
  await fixture().fetch.query('<fetch><entity name="account"/></fetch>');
});

test('FetchXML preserves root OR semantics and child filters when adding a root state condition', async () => {
  const f = fixture();
  await f.fetch.query('<fetch><entity name="account"><filter type="or"><condition attribute="name" operator="eq" value="A"/><condition attribute="name" operator="eq" value="statecode"/></filter><link-entity name="contact" alias="c"><filter><condition attribute="statecode" operator="eq" value="1"/></filter></link-entity></entity></fetch>');
  const entity = fetchDoc(f.records[0].endpoint).getElementsByTagName('entity')[0];
  const rootFilter = nodes(entity, 'filter')[0];
  assert.equal(rootFilter.getAttribute('type'), 'and');
  assert.equal(nodes(rootFilter, 'filter')[0].getAttribute('type'), 'or');
  assert.equal(nodes(rootFilter, 'filter')[0].getElementsByTagName('condition').length, 2);
  const link = nodes(entity, 'link-entity')[0];
  assert.equal(link.getElementsByTagName('condition').length, 1);
  assert.equal(link.getElementsByTagName('condition')[0].getAttribute('value'), '1');
});

test('FetchXML root aliases are distinguished from child entity conditions', async () => {
  for (const [qualifier, expected] of [['a','preserved_explicit_filter'], ['c','injected']]) {
    const f = fixture();
    const result = await f.fetch.query('<fetch><entity name="account" alias="a"><filter><condition entityname="' + qualifier + '" attribute="statecode" operator="eq" value="1"/></filter><link-entity name="contact" alias="c"/></entity></fetch>');
    assert.equal(result.query.state.disposition, expected);
  }
});

test('malformed XML, duplicate roots and DTDs never reach CRM', async () => {
  for (const source of ['<fetch><entity name="account"></fetch>',
    '<fetch><entity name="account"/><entity name="contact"/></fetch>',
    '<!DOCTYPE fetch [<!ENTITY x "y">]><fetch><entity name="account"/></fetch>']) {
    const f = fixture();
    await assert.rejects(f.fetch.query(source), {code:'D365_QUERY_INVALID'});
    assert.equal(f.calls.length, 0);
  }
});

test('native double-encoded cookies are decoded twice and XML-escaped exactly once', async () => {
  const raw = '<cookie page="1"><name last="中文 &amp; A" first="B"/></cookie>';
  const f = fixture((_endpoint, count) => count === 1 ? {value:[row(1),row(2)],
    '@Microsoft.Dynamics.CRM.morerecords':true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie':cookieAnnotation(raw)} : {value:[row(3)]});
  const result = await f.fetch.query('<fetch count="2"><entity name="account"/></fetch>', {fetch_all:true});
  assert.deepEqual(result.value, [row(1),row(2),row(3)]);
  const second = fetchDoc(f.records[1].endpoint).documentElement;
  assert.equal(second.getAttribute('page'), '2');
  assert.equal(second.getAttribute('paging-cookie'), raw);
  assert.equal(parse(second.getAttribute('paging-cookie')).getElementsByTagName('name')[0].getAttribute('last'), '中文 & A');
  assert.match(f.records[0].options.headers.Prefer, /fetchxmlpagingcookie/);
  assert.equal(result.paging.complete, true);
});

test('FetchXML simple paging increments page when the server supplies no cookie', async () => {
  const f = fixture((_endpoint, count) => count === 1 ? {value:[row(1)], '@Microsoft.Dynamics.CRM.morerecords':true} : {value:[]});
  const result = await f.fetch.query('<fetch count="1"><entity name="account"/></fetch>', {fetch_all:true});
  assert.equal(fetchDoc(f.records[1].endpoint).documentElement.getAttribute('page'), '2');
  assert.ok(result.query.warnings.some(warning => warning.includes('simple paging')));
  assert.equal(result.paging.complete, true);
});

test('simple paging stops at the native 50000-row boundary without claiming completion', async () => {
  const f = fixture(() => ({value:[row(1)], '@Microsoft.Dynamics.CRM.morerecords':true}));
  const result = await f.fetch.query('<fetch page="100" count="500"><entity name="account"/></fetch>', {fetch_all:true});
  assert.equal(result.paging.hasMore, true);
  assert.equal(result.paging.continuation, null);
  assert.equal(result.paging.stoppedBecause, 'simple_paging_limit');
  assert.equal(f.records.length, 1);
});

test('FetchXML resumes cookies and buffered records without requiring the original XML', async () => {
  const f = fixture((_endpoint, count) => count === 1 ? {value:[row(1),row(2)],
    '@Microsoft.Dynamics.CRM.morerecords':true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie':cookieAnnotation('<cookie page="1"/>')} : {value:[row(3)]});
  const first = await f.fetch.query('<fetch count="2"><entity name="account"/></fetch>', {max_records:1});
  const second = await f.fetch.query(undefined, {continuation:first.paging.continuation, fetch_all:true});
  assert.deepEqual(second.value, [row(2),row(3)]);
  assert.equal(fetchDoc(f.records[1].endpoint).documentElement.getAttribute('page'), '2');
  assert.equal(second.paging.complete, true);
});

test('FetchXML top is preserved and cannot be combined with paging attributes', async () => {
  const f = fixture(() => ({value:[row(1),row(2)]}));
  const first = await f.fetch.query('<fetch top="2"><entity name="account"/></fetch>', {max_records:1});
  const fetch = fetchDoc(f.records[0].endpoint).documentElement;
  assert.equal(fetch.getAttribute('top'), '2');
  assert.equal(fetch.hasAttribute('count'), false);
  assert.equal(fetch.hasAttribute('page'), false);
  assert.deepEqual((await f.fetch.query(undefined, {continuation:first.paging.continuation})).value, [row(2)]);
  const invalid = fixture();
  await assert.rejects(invalid.fetch.query('<fetch top="2" count="1"><entity name="account"/></fetch>'), /cannot be combined/);
  assert.equal(invalid.calls.length, 0);
});

test('distinct/aggregate queries preserve columns and require explicit order to auto-page', async () => {
  const source = '<fetch distinct="true"><entity name="account"><attribute name="name"/></entity></fetch>';
  const f = fixture(() => ({value:[{name:'A'}], '@Microsoft.Dynamics.CRM.morerecords':true}));
  await assert.rejects(f.fetch.query(source, {fetch_all:true, state_mode:'all'}), /explicit root order/);
  assert.equal(f.records.length, 0);
  const first = await f.fetch.query(source, {state_mode:'all'});
  assert.equal(first.paging.complete, false);
  assert.equal(first.paging.stoppedBecause, 'explicit_order_required');
  assert.equal(first.paging.continuation, null);
  const entity = fetchDoc(f.records[0].endpoint).getElementsByTagName('entity')[0];
  assert.equal(entity.getElementsByTagName('attribute').length, 1);
  assert.equal(entity.getElementsByTagName('order').length, 0);
  const aggregate = fixture();
  await aggregate.fetch.query('<fetch aggregate="true"><entity name="account"><attribute name="name" groupby="true" alias="label"/><attribute name="accountid" aggregate="count" alias="total"/><order alias="label"/></entity></fetch>', {fetch_all:true, state_mode:'all'});
  assert.equal(fetchDoc(aggregate.records[0].endpoint).getElementsByTagName('order').length, 1);
});

test('bad server paging annotations fail explicitly instead of corrupting a query', async () => {
  for (const extra of [{
    '@Microsoft.Dynamics.CRM.morerecords':true,
    '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie':'<cookie pagingcookie="bad-encoding%"/>',
  }, {'@Microsoft.Dynamics.CRM.morerecords':42}]) {
    const f = fixture(() => ({value:[row(1)], ...extra}));
    await assert.rejects(f.fetch.query('<fetch><entity name="account"/></fetch>'), {code:'D365_QUERY_RESPONSE_INVALID'});
  }
});

test('preview shares the exact filter/ordering path and keeps the original result envelope', async () => {
  const f = fixture(() => ({value:[row(1),row(2)]}));
  const source = '<fetch><entity name="account"/></fetch>';
  const preview = await f.fetch.previewFetchXmlData(source);
  const query = await f.fetch.query(source);
  assert.equal(preview.isSuccess, true);
  assert.deepEqual(preview.sampleData, row(1));
  assert.equal(preview.query.fetchXml, query.query.fetchXml);
  assert.equal(preview.paging.hasMore, true);
  const bad = await f.fetch.previewFetchXmlData('<fetch>');
  assert.equal(bad.isSuccess, false);
  assert.equal(bad.error.code, 'D365_QUERY_INVALID');
});
