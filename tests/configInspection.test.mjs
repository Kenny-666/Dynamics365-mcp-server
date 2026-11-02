import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigInspectionService } from '../src/services/configInspection.ts';
const label = x => ({LocalizedLabels:[{Label:x}]});
test('resolve exact identifiers before localized labels and report duplicates', async () => {
  const crm = {makeRequest: async () => ({value:[
    {LogicalName:'account',EntitySetName:'accounts',DisplayName:label('客户')},
    {LogicalName:'new_customer',DisplayName:label('客户')},
  ]})};
  const service = new ConfigInspectionService(crm);
  assert.equal((await service.resolve({name:'客户'})).status,'ambiguous');
  assert.equal((await service.resolve({name:'accounts'})).candidates[0].logical_name,'account');
  assert.equal((await service.resolve({name:'未知'})).status,'not_found');
});
test('reject incomplete metadata and invalid identifiers before constructing a request', async () => {
  let calls = 0;
  const service = new ConfigInspectionService({makeRequest:async () => {calls++; return {value:[], '@odata.nextLink':'more'};}});
  await assert.rejects(service.resolve({name:'名称'}), /incomplete or paginated/);
  await assert.rejects(service.resolve({name:'名称',entity_logical_name:"x')"}), /logical identifier/);
  assert.equal(calls,1);
});
test('configuration check reports missing components without claiming certainty', async () => {
  const service = new ConfigInspectionService({makeRequest:async path => path.startsWith('/EntityDefinitions(') && !path.includes('/Attributes?') ? {LogicalName:'account'} : {value:[]}});
  const result = await service.check({entity_logical_name:'account'});
  assert.deepEqual(result.findings.map(x => x.code),['NO_MAIN_FORM','NO_ACTIVE_PUBLIC_VIEW']);
  assert.match(result.limitations[0],/not proof/);
});

test('inspects form required fields and view field consistency safely', async () => {
  const client={makeRequest:async path => {
    if (path.includes('/Attributes?')) return {value:[{LogicalName:'name',RequiredLevel:{Value:'ApplicationRequired'},IsValidForCreate:true},{LogicalName:'accountnumber'}]};
    if (path.startsWith('/EntityDefinitions(')) return {LogicalName:'account'};
    if (path.startsWith('/systemforms')) return {value:[{name:'Main',formxml:'<form><control datafieldname="missing"/></form>'}]};
    return {value:[{name:'View',fetchxml:'<fetch><entity name="account"><attribute name="name"/></entity></fetch>',layoutxml:'<grid><row><cell name="accountnumber"/></row></grid>'}]};
  }};
  const result=await new ConfigInspectionService(client).check({entity_logical_name:'account'});
  assert.deepEqual(result.findings.map(x=>x.code),['FORM_FIELD_NOT_FOUND','REQUIRED_FIELD_NOT_ON_FORM','VIEW_LAYOUT_FIELD_NOT_SELECTED']);
  assert.match(result.limitations[1],/defaults/);
});
test('invalid XML is reported without attempting to interpret it', async () => {
  const client={makeRequest:async path => {
    if(path.includes('/Attributes?'))return {value:[]};
    if(path.startsWith('/EntityDefinitions('))return {LogicalName:'account'};
    if(path.startsWith('/systemforms'))return {value:[{name:'Main',formxml:'<!DOCTYPE form><form/>'}]};
    return {value:[{name:'View',fetchxml:'<fetch/>',layoutxml:'broken'}]};
  }};
  const result=await new ConfigInspectionService(client).check({entity_logical_name:'account'});
  assert.deepEqual(result.findings.map(x=>x.code),['FORM_XML_INVALID','VIEW_XML_INVALID']);
});
