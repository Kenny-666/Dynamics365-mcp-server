import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import { fixture,ids,env,formXml,fetchXml,layoutXml,addField,formArgs,viewArgs } from './modelUi.fixture.mjs';
import { ModelUiService } from '../src/services/modelUi.ts';
import { modelUiTools } from '../src/tools/modelUiTools.ts';
import { formSummary,uiXml,xmlHash } from '../src/services/modelUiXml.ts';
import { children } from '../src/services/queryXml.ts';
import { tools,handleToolCall } from '../src/tool_handler.ts';
import { CrmRequestError,toolErrorPayload } from '../src/errors.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { CacheService } from '../src/services/cache.ts';
import { readConfig } from '../src/config.ts';
const writes = f => f.calls.filter(call => call.method !== 'GET');
async function failure(promise) { try { await promise; assert.fail('Expected failure'); } catch (error) { assert.ok(error instanceof CrmRequestError,error.stack); return toolErrorPayload(error); } }
async function execute(f,args,k = 'form',signal) { const preview = await f.service.edit(args,k,signal); return f.service.edit({...args,expected_hash:preview.definitionHash,dry_run:false},k,signal); }
const scriptOps = [{action:'add_library',library_name:'new_/form.js'},
  {action:'bind_event',event_name:'onload',library_name:'new_/form.js',function_name:'Project.onLoad'},
  {action:'bind_event',event_name:'onchange',attribute_name:'new_reference',library_name:'new_/form.js',function_name:'Project.onChange'}];

test('unpublished form/view discovery returns target IDs/types and explicitly bounded completeness', async () => {
  const f = fixture();
  for (const kind of ['form','view']) {
    const result = await f.service.list({kind,logicalName:'new_sample'}); assert.equal(result.items.length,1); assert.equal(result.limited,false);
    assert.equal(result.items[0].kind,kind); assert.equal(result.items[0].formxml,undefined); assert.equal(result.source,'native_saved_including_unpublished');
  }
  assert.equal((await f.service.list({kind:'form',logical_name:'new_sample',top:1})).limited,true);
  assert.equal((await fixture({more:true}).service.list({kind:'form',logical_name:'new_sample'})).limited,true); assert.equal(writes(f).length,0);
});

test('name search escapes OData text and does not widen the table scope', async () => {
  const f = fixture(); await f.service.list({kind:'view',logical_name:'new_sample',nameKeyword:"O'Brien"});
  const query = new URL(f.calls.at(-1).endpoint,'https://crm.invalid').searchParams.get('$filter');
  assert.equal(query,"returnedtypecode eq 'new_sample' and contains(name,'O''Brien')");
});

test('component read provides unpublished XML, structural inventory and a stable semantic fingerprint', async () => {
  const f = fixture(),read = await f.service.getComponent({kind:'form',id:ids.form,logical_name:'new_sample'});
  assert.equal(read.etag,'W/"5"'); assert.equal(read.structure.sections[0].id,ids.section); assert.equal(read.structure.controls[0].id,'new_name');
  assert.equal(read.publication,'not_determined'); assert.match(read.definitionHash,/^[0-9a-f]{64}$/);
  const hash = read.definitionHash;
  f.form.formxml = formXml.replace('name="general" id=', 'id="{77777777-7777-7777-7777-777777777777}" name="general" placeholder=').replace(' placeholder="{77777777-7777-7777-7777-777777777777}"','');
  assert.equal((await f.service.getComponent({kind:'form',id:ids.form,logical_name:'new_sample'})).definitionHash,hash);
});

test('unsupported/forbidden unpublished retrieval never falls back to published definitions', async () => {
  for (const status of [403,404]) {
    const f = fixture({request:({endpoint}) => {if (endpoint.startsWith('/systemforms')) throw new CrmRequestError('D365_HTTP_ERROR','unavailable',{status});}});
    await failure(f.service.getComponent({kind:'form',id:ids.form,logical_name:'new_sample'}));
    assert.equal(f.calls.filter(call => call.endpoint.startsWith('/systemforms')).length,1); assert.equal(writes(f).length,0);
  }
});

test('component identity, table ownership, deleted states and malformed lists cannot become empty successful reads', async () => {
  for (const form of [{formid:ids.view},{objecttypecode:'account'},{ismanaged:null},{componentstate:2},{type:'2'}]) {
    const f = fixture({form}); assert.match((await failure(f.service.getComponent({kind:'form',id:ids.form,logical_name:'new_sample'}))).code,/D365_MODEL_(RESPONSE_INVALID|UNSUPPORTED)/);
  }
  for (const listRows of [null,[null],Array(101).fill({}),[{formid:ids.form}],[fixture().form,fixture().form]]) {
    const f = fixture({listRows,request:listRows === null ? ({endpoint}) => endpoint.includes('RetrieveUnpublishedMultiple') ? {status:200,data:{value:null}} : undefined : undefined});
    await failure(f.service.list({kind:'form',logical_name:'new_sample'})); assert.equal(writes(f).length,0);
  }
});

test('add-field preview appends a full-width row, reuses only the compatible class and preserves existing navigation', async () => {
  const f = fixture(),preview = await f.service.edit(formArgs,'form');
  assert.equal(preview.dryRun,true); assert.equal(preview.saved,false); assert.equal(writes(f).length,0);
  assert.equal(preview.request.method,'PATCH'); assert.equal(preview.request.headers['If-Match'],'W/"5"'); assert.equal(preview.concurrencyProtected,true);
  const document = uiXml(preview.request.body.formxml,'form'),controls = Array.from(document.getElementsByTagName('control'));
  assert.equal(controls.length,2); assert.equal(controls[1].getAttribute('classid'),controls[0].getAttribute('classid'));
  assert.equal(controls[1].getAttribute('datafieldname'),'new_reference'); assert.equal(controls[1].parentNode.getAttribute('colspan'),'2');
  assert.equal(document.getElementsByTagName('Navigation').length,1); assert.equal(preview.request.headers['MSCRM.SolutionUniqueName'],'TestSolution');
});

test('compatible field placement saves one guarded PATCH and verifies the saved unpublished definition without publication', async () => {
  const f = fixture(),result = await execute(f,formArgs);
  assert.equal(result.saved,true); assert.equal(result.readback.status,'matched'); assert.deepEqual(result.readback.checkedProperties,['formxml']);
  assert.equal(writes(f).length,1); assert.equal(writes(f)[0].method,'PATCH'); assert.equal(result.publication,'not_requested');
  assert.equal(result.modelDrivenUi,'not_verified'); assert.equal(formSummary(f.form.formxml).controls.length,2);
});

test('form labels escape XML characters and preserve multilingual descriptions', async () => {
  const f = fixture(),result = await execute(f,{...formArgs,operations:[{...addField,label:[{language_code:1033,text:'A < B & C'},{language_code:2052,text:'编号'}]}]});
  assert.equal(result.saved,true); assert.match(f.form.formxml,/A &lt; B &amp; C/); const labels = Array.from(uiXml(f.form.formxml,'form').getElementsByTagName('label'));
  assert.ok(labels.some(label => label.getAttribute('description') === '编号'));
});

test('field placement rejects type/format mismatch, non-form fields, Lookup and incomplete layout evidence', async () => {
  for (const options of [{fields:{new_reference:{AttributeType:'Integer'}}},{fields:{new_reference:{IsValidForForm:false}}},
    {fields:{new_reference:{FormatName:{Value:'Email'}}}},{fields:{new_reference:{AttributeType:'Lookup'}}},
    {formXml:formXml.replace('columns="11"','columns="12"')},{formXml:formXml.replace('<cell id=','<cell rowspan="2" id=')}]) {
    const f = fixture(options); assert.equal((await failure(f.service.edit(formArgs,'form'))).code,'D365_MODEL_UNSUPPORTED'); assert.equal(writes(f).length,0);
  }
});

test('parameterized, PCF, unbound or relationship templates are not copied', async () => {
  for (const source of [formXml.replace('/></cell>','><parameters><Something>value</Something></parameters></control></cell>'),
    formXml.replace('</form>',`<controlDescriptions><controlDescription forControl="${ids.control}"/></controlDescriptions></form>`),
    formXml.replace('disabled="false"','disabled="false" isunbound="1"'),formXml.replace('disabled="false"','disabled="false" relationship="new_lookup"')]) {
    const f = fixture({formXml:source}); assert.equal((await failure(f.service.edit(formArgs,'form'))).code,'D365_MODEL_UNSUPPORTED'); assert.equal(writes(f).length,0);
  }
});

test('duplicate fields/control IDs and missing/ambiguous template/section selectors prevent writes', async () => {
  const f = fixture(); await execute(f,formArgs); assert.equal((await failure(f.service.edit(formArgs,'form'))).code,'D365_MODEL_EXISTS');
  for (const operation of [{...addField,control_id:'new_name'},{...addField,template_control_id:'missing'},{...addField,section_id:ids.view}]) {
    const g = fixture(); await failure(g.service.edit({...formArgs,operations:[operation]},'form')); assert.equal(writes(g).length,0);
  }
});

test('script library and root/field event binding are separate structured operations with execution context enabled', async () => {
  const f = fixture(),result = await execute(f,{...formArgs,operations:[addField,...scriptOps]});
  assert.equal(result.saved,true); const summary = formSummary(f.form.formxml); assert.equal(summary.libraries.length,1); assert.equal(summary.events.length,2);
  assert.equal(summary.events.find(event => event.name === 'onchange').attributeName,'new_reference');
  const handlers = Array.from(uiXml(f.form.formxml,'form').getElementsByTagName('Handler'));
  assert.equal(handlers.every(handler => handler.getAttribute('passExecutionContext') === 'true'),true);
  assert.equal(f.calls.filter(call => call.endpoint.startsWith('/webresourceset/')).every(call => !call.endpoint.includes('content')),true);
  assert.equal(writes(f).length,1);
});

test('binding cannot implicitly add a library or onchange field and duplicate handlers are rejected', async () => {
  for (const operations of [[scriptOps[1]],[...scriptOps], [{action:'add_library',library_name:'new_/form.js'},scriptOps[1],scriptOps[1]]]) {
    const f = fixture(); await failure(f.service.edit({...formArgs,operations},'form')); assert.equal(writes(f).length,0);
  }
  const f = fixture(); assert.equal((await failure(f.service.edit({...formArgs,operations:[scriptOps[0],scriptOps[0]]},'form'))).code,'D365_MODEL_EXISTS');
});

test('script references require exact JavaScript resources and reject URLs, function expressions and internal events', async () => {
  for (const resource of [{name:'other.js'},{webresourcetype:1}]) {
    const f = fixture({resource}); assert.equal((await failure(f.service.edit({...formArgs,operations:[scriptOps[0]]},'form'))).code,'D365_MODEL_INVALID');
  }
  for (const operation of [{...scriptOps[0],library_name:'https://evil.invalid/a.js'},{...scriptOps[0],library_name:'../evil.js'},
    {...scriptOps[1],function_name:'Project.run();attack()'},{...scriptOps[1],event_name:'onclick'}]) {
    const f = fixture(); await failure(f.service.edit({...formArgs,operations:[scriptOps[0],operation]},'form')); assert.equal(writes(f).length,0);
  }
  const f = fixture({formXml:formXml.replace('</form>','<events><event name="onload" application="1"><Handlers/></event></events></form>')});
  assert.equal((await failure(f.service.edit({...formArgs,operations:[scriptOps[0],scriptOps[1]]},'form'))).code,'D365_MODEL_UNSUPPORTED');
});

test('script dependencies retain native resource IDs and do not claim resource publication as part of a form save', async () => {
  const f = fixture(),result = await execute(f,{...formArgs,operations:[scriptOps[0],scriptOps[1]]});
  assert.equal(result.saved,true);
  for (const change of result.changes) { assert.equal(change.webResourceId,ids.resource); assert.equal(change.webResourcePublication,'not_verified'); }
  assert.equal(f.calls.some(call => call.endpoint === '/PublishXml'),false); assert.equal(writes(f).length,1);
});

test('runtime arguments reject malformed IDs, conflicting aliases and arbitrary XML; explicit false context flags survive', async () => {
  for (const extra of [{id:'bad'},{logicalName:'account'},{if_match:'*'},{expected_hash:'bad'},{formxml:'<form/>'},{dry_run:'false'},
    {operations:[{...addField,sectionId:ids.view}]},{operations:[scriptOps[0],{...scriptOps[1],pass_execution_context:'false'}]}]) {
    const f = fixture(); assert.equal((await failure(f.service.edit({...formArgs,...extra},'form'))).code,'D365_MODEL_INVALID'); assert.equal(writes(f).length,0);
  }
  const f = fixture(),result = await execute(f,{...formArgs,operations:[scriptOps[0],{...scriptOps[1],passExecutionContext:false}]});
  assert.equal(result.saved,true); assert.equal(uiXml(f.form.formxml,'form').getElementsByTagName('Handler')[0].getAttribute('passExecutionContext'),'false');
});

test('main-form/public-view scope and managed property failures are explicit', async () => {
  for (const [options,args,kind] of [[{form:{type:7}},formArgs,'form'],[{view:{querytype:4}},viewArgs,'view'],
    [{form:{iscustomizable:{Value:false}}},formArgs,'form'],[{table:{IsCustomizable:{Value:false}}},viewArgs,'view']]) {
    const f = fixture(options); assert.match((await failure(f.service.edit(args,kind))).code,/D365_MODEL_(UNSUPPORTED|MANAGED_PROPERTY)/); assert.equal(writes(f).length,0);
  }
});

test('view add-column updates FetchXML and LayoutXML together while preserving filters, joins and existing attributes', async () => {
  const f = fixture(),result = await execute(f,viewArgs,'view'); assert.equal(result.saved,true); assert.equal(writes(f).length,1);
  const fetch = uiXml(f.view.fetchxml,'fetch'),grid = uiXml(f.view.layoutxml,'grid');
  assert.equal(fetch.getElementsByTagName('filter').length,2); assert.equal(fetch.getElementsByTagName('link-entity').length,1);
  assert.equal(Array.from(fetch.getElementsByTagName('condition')).some(condition => condition.getAttribute('value') === '%statecode & test%'),true);
  assert.ok(Array.from(fetch.getElementsByTagName('attribute')).some(attribute => attribute.getAttribute('name') === 'new_reference'));
  assert.equal(Array.from(grid.getElementsByTagName('cell')).find(cell => cell.getAttribute('name') === 'new_reference').getAttribute('width'),'180');
  assert.deepEqual(result.readback.checkedProperties,['fetchxml','layoutxml']);
});

test('remove-column preserves FetchXML dependency attributes and rejects primary/jump/last column removal', async () => {
  const f = fixture(),result = await execute(f,{...viewArgs,operations:[{action:'remove_column',attribute_name:'new_old'}]},'view');
  assert.equal(result.saved,true); assert.match(f.view.fetchxml,/attribute name="new_old"/); assert.doesNotMatch(f.view.layoutxml,/cell name="new_old"/);
  for (const attribute_name of ['new_sampleid','new_name']) {
    const g = fixture(); assert.equal((await failure(g.service.edit({...viewArgs,operations:[{action:'remove_column',attribute_name}]},'view'))).code,'D365_MODEL_INVALID');
  }
});

test('view resize and root ordering preserve linked attributes without rewriting query state', async () => {
  const f = fixture(),result = await execute(f,{...viewArgs,operations:[{action:'set_width',attribute_name:'new_old',width:250},
    {action:'set_order',order:[{attributeName:'new_old',descending:true},{attribute_name:'new_name'}]}]},'view');
  assert.equal(result.saved,true); const fetch = uiXml(f.view.fetchxml,'fetch'),entity = children(fetch.documentElement,'entity')[0];
  assert.deepEqual(children(entity,'order').map(order => [order.getAttribute('attribute'),order.getAttribute('descending')]),[['new_old','true'],['new_name','false']]);
  assert.match(f.view.layoutxml,/contact.emailaddress1/); assert.match(f.view.fetchxml,/value="1"/);
});

test('all-attributes stays intact and missing primary projection is added explicitly', async () => {
  const f = fixture({fetchXml:fetchXml.replace('<attribute name="new_name"/>','<all-attributes/>')}),preview = await f.service.edit(viewArgs,'view');
  assert.equal(preview.request.body.fetchxml.includes('<attribute name="new_reference"'),false);
  const g = fixture({fetchXml:fetchXml.replace('<attribute name="new_sampleid"/>','')}),result = await execute(g,viewArgs,'view');
  assert.ok(result.changes.some(change => change.action === 'ensure_primary_id')); assert.match(g.view.fetchxml,/new_sampleid/);
});

test('aggregate/distinct views, wrong root/layout identity, duplicate columns and linked sorts stop before a write', async () => {
  for (const options of [{fetchXml:fetchXml.replace('<fetch ','<fetch aggregate="true" ')},{fetchXml:fetchXml.replace('<fetch ','<fetch distinct="1" ')},
    {fetchXml:fetchXml.replace('entity name="new_sample"','entity name="account"')},{layoutXml:layoutXml.replace('object="10001"','object="1"')},
    {layoutXml:layoutXml.replace('id="new_sampleid"','id="accountid"')},{layoutXml:layoutXml.replace('name="new_old"','name="new_name"')},
    {fetchXml:fetchXml.replace('<order attribute=','<order entityname="contact" attribute=')}]) {
    const f = fixture(options),args = options.fetchXml?.includes('entityname="contact"') ? {...viewArgs,operations:[{action:'set_order',order:[{attribute_name:'new_name'}]}]} : viewArgs;
    assert.match((await failure(f.service.edit(args,'view'))).code,/D365_MODEL_(UI_XML|UNSUPPORTED)/); assert.equal(writes(f).length,0);
  }
});

test('view field validation, duplicate columns/sorts, bad widths and unknown operations fail before mutation', async () => {
  const unreadable = fixture({fields:{new_reference:{IsValidForRead:false}}}); assert.equal((await failure(unreadable.service.edit(viewArgs,'view'))).code,'D365_MODEL_UNSUPPORTED');
  for (const operation of [{action:'add_column',attribute_name:'new_name'},{action:'add_column',attribute_name:'new_reference',width:1},
    {action:'set_width',attribute_name:'new_name'},{action:'set_width',attribute_name:'new_name',width:2001},
    {action:'set_order',order:[{attribute_name:'new_name'},{attribute_name:'NEW_NAME'}]},{action:'set_filter',filter:'bad'},
    {action:'add_column',attribute_name:'contact.emailaddress1'}]) {
    const f = fixture(); await failure(f.service.edit({...viewArgs,operations:[operation]},'view')); assert.equal(writes(f).length,0);
  }
});

test('XML injection, malformed structure, namespaces, oversized/deep input and empty operations are bounded', async () => {
  for (const source of ['<!DOCTYPE form [<!ENTITY x SYSTEM "file:///secret">]><form>&x;</form>','<form><tabs></form>',
    '<form xmlns="urn:unsupported"/>','<form>' + '<x>'.repeat(70) + '</x>'.repeat(70) + '</form>','<form>' + 'x'.repeat(1000001) + '</form>']) {
    const f = fixture({formXml:source}); assert.match((await failure(f.service.getComponent({kind:'form',id:ids.form,logical_name:'new_sample'}))).code,/D365_MODEL_(UI_XML|UNSUPPORTED)/);
  }
  for (const operations of [[],Array(51).fill(addField),['bad']]) {
    const f = fixture(); assert.equal((await failure(f.service.edit({...formArgs,operations},'form'))).code,'D365_MODEL_INVALID'); assert.equal(writes(f).length,0);
  }
});

test('stale preview fingerprints and explicit ETag mismatches are never overridden by fallback flags', async () => {
  const f = fixture(),preview = await f.service.edit(formArgs,'form'); f.form.name = 'Changed externally';
  assert.equal((await failure(f.service.edit({...formArgs,expected_hash:preview.definitionHash,dry_run:false,allow_unprotected_write:true},'form'))).code,'D365_MODEL_CONFLICT');
  const g = fixture(),before = await g.service.edit(formArgs,'form');
  assert.equal((await failure(g.service.edit({...formArgs,expected_hash:before.definitionHash,dry_run:false,if_match:'W/"old"',allow_unprotected_write:true},'form'))).code,'D365_MODEL_CONFLICT');
  assert.equal(writes(f).length + writes(g).length,0);
});

test('metadata-gated concurrency refuses unsupported or missing ETags unless explicit fallback is allowed', async () => {
  for (const options of [{concurrency:false},{noEtag:true}]) {
    const f = fixture(options),preview = await f.service.edit(formArgs,'form'); assert.ok(preview.blockedBy);
    assert.match((await failure(f.service.edit({...formArgs,expected_hash:preview.definitionHash,dry_run:false},'form'))).code,/D365_MODEL_UI_(CONCURRENCY_UNSUPPORTED|ETAG_REQUIRED)/);
    assert.equal(writes(f).length,0);
  }
  const f = fixture({concurrency:false}),result = await execute(f,{...formArgs,allowUnprotectedWrite:true});
  assert.equal(result.concurrencyProtected,false); assert.equal(writes(f)[0].options.headers['If-Match'],'*');
  const g = fixture({concurrency:false}),preview = await g.service.edit(formArgs,'form');
  assert.equal((await failure(g.service.edit({...formArgs,expected_hash:preview.definitionHash,dry_run:false,if_match:'W/"5"',allow_unprotected_write:true},'form'))).code,'D365_MODEL_UI_CONCURRENCY_UNSUPPORTED');
});

test('execution requires an explicit current fingerprint and no-change operations do not issue PATCH', async () => {
  const f = fixture(); assert.equal((await failure(f.service.edit({...formArgs,dry_run:false},'form'))).code,'D365_MODEL_PREVIEW_REQUIRED');
  const g = fixture(),args = {...viewArgs,operations:[{action:'set_width',attribute_name:'new_old',width:100}]};
  const result = await execute(g,args,'view'); assert.equal(result.noChange,true); assert.equal(result.saved,false); assert.equal(writes(g).length,0);
});

test('server concurrency rejection and unknown write outcome preserve distinct evidence without retries', async () => {
  for (const [status,outcome,saved] of [[412,'rejected',false],[504,'unknown',null]]) {
    const f = fixture({request:({method}) => {if (method === 'PATCH') throw new CrmRequestError('D365_HTTP_ERROR','hidden-secret',{status,outcome});}});
    const error = await failure(execute(f,formArgs)); assert.equal(error.code,'D365_MODEL_WRITE_FAILED'); assert.equal(error.data.saved,saved);
    assert.equal(error.data.issue.status,status); assert.equal(writes(f).length,1); assert.doesNotMatch(JSON.stringify(error),/hidden-secret/);
  }
});

test('acknowledged save with missing/different readback retains saved=true and does not repeat PATCH', async () => {
  for (const mode of ['missing','mismatch']) {
    const f = fixture({request:({endpoint,method,calls}) => {
      if (method === 'GET' && endpoint.startsWith('/systemforms(') && calls.some(call => call.method === 'PATCH')) {
        if (mode === 'missing') throw new CrmRequestError('D365_HTTP_ERROR','forbidden',{status:403});
        return {status:200,data:{...fixture().form,'@odata.etag':'W/"6"'}};
      }
    }});
    const error = await failure(execute(f,formArgs)); assert.equal(error.data.saved,true); assert.match(error.code,/D365_MODEL_READBACK_(FAILED|MISMATCH)/); assert.equal(writes(f).length,1);
  }
});

test('cancellation propagates and cannot erase confirmed save evidence', async () => {
  const before = new AbortController(); before.abort(); const f = fixture();
  assert.equal((await failure(f.service.getComponent({kind:'form',id:ids.form,logical_name:'new_sample'},before.signal))).code,'D365_REQUEST_ABORTED'); assert.equal(f.calls.length,0);
  const controller = new AbortController(),g = fixture({request:({method}) => {if (method === 'PATCH') controller.abort();}});
  const error = await failure(execute(g,formArgs,'form',controller.signal)); assert.equal(error.data.saved,true);
  assert.equal(g.calls.every(call => call.options.signal === controller.signal),true); assert.equal(writes(g).length,1);
});

test('simulated end-to-end field creation, form placement, script binding, view update, separate publication and reread', async () => {
  const f = fixture({newFieldMissing:true});
  const created = await f.model.create({logical_name:'new_sample',schema_name:'new_reference',type:'String',max_length:100,
    display_name:[{language_code:1033,text:'Reference'}],solution_unique_name:'TestSolution',dry_run:false},'column');
  assert.equal(created.saved,true);
  assert.equal((await execute(f,{...formArgs,operations:[addField,...scriptOps]})).saved,true);
  assert.equal((await execute(f,viewArgs,'view')).saved,true);
  const beforePublish = writes(f).length; assert.equal(f.calls.some(call => call.endpoint === '/PublishXml'),false);
  assert.equal((await f.model.publish({logical_name:'new_sample',dry_run:false})).publication,'published');
  assert.equal(writes(f).length,beforePublish + 1);
  const read = await f.service.getComponent({kind:'form',id:ids.form,logical_name:'new_sample'}); assert.equal(read.structure.controls.length,2);
  assert.equal(read.publication,'not_determined'); assert.equal(formSummary(read.xml.formxml).events.length,2);
});

test('strict schemas compile, accept aliases and expose every new tool exactly once', () => {
  const ajv = new Ajv({strict:false,useDefaults:true}),samples = {list_model_ui_components:{kind:'form',logicalName:'new_sample'},
    get_model_ui_component:{kind:'view',id:ids.view,logical_name:'new_sample'},edit_model_form:{...formArgs,operations:[{...addField,section_id:undefined,sectionId:ids.section}]},edit_model_view:viewArgs};
  for (const tool of modelUiTools) {
    const validate = ajv.compile(tool.inputSchema); assert.equal(validate(samples[tool.name]),true,JSON.stringify(validate.errors));
    assert.equal(validate({unknown:true}),false); assert.equal(tools.filter(item => item.name === tool.name).length,1);
  }
});

test('MCP routes all four tools through the shared client with cancellation and read-only previews', async t => {
  const f = fixture(),settings = {AUTH_TYPE:'online',ORG_URL:env.orgUrl,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]])); Object.assign(process.env,settings);
  t.mock.method(D365AuthService.prototype,'requestWithResponse',(...args) => f.client.requestWithResponse(...args)); const live = new AbortController();
  try {
    for (const [name,args] of Object.entries({list_model_ui_components:{kind:'form',logical_name:'new_sample'},get_model_ui_component:{kind:'form',id:ids.form,logical_name:'new_sample'},edit_model_form:formArgs,edit_model_view:viewArgs})) assert.ok((await handleToolCall(name,args,{signal:live.signal})).environment);
    assert.equal(f.calls.every(call => call.options.signal === live.signal),true); assert.equal(writes(f).length,0);
  } finally { for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('Online/NTLM/IFD actual request layer preserves unpublished functions, guarded PATCH and solution association header', async t => {
  t.mock.method(axios,'post',async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const authType of ['online','op_ad','op_ifd']) {
    CacheService.flushExisting();
    const config = readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
      AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
    const client = new D365AuthService(config),f = fixture();
    client.getAxiosInstance().defaults.adapter = async config => {
      const url = new URL(config.url),endpoint = url.pathname.replace('/Demo/api/data/v9.1','') + url.search;
      const response = await f.client.requestWithResponse(endpoint,config.method.toUpperCase(),config.data ? JSON.parse(config.data) : undefined,{headers:Object.fromEntries(config.headers)});
      return {config,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};
    };
    const service = new ModelUiService(client,{...env,authType}),preview = await service.edit(formArgs,'form');
    assert.equal((await service.edit({...formArgs,expected_hash:preview.definitionHash,dry_run:false},'form')).saved,true);
    assert.equal(writes(f).length,1); assert.equal(writes(f)[0].options.headers['MSCRM.SolutionUniqueName'],'TestSolution');
  }
});

test('XML semantic comparison ignores formatting/attribute order while preserving significant literal whitespace', () => {
  assert.equal(xmlHash('<form a="1" b="2"><tabs/></form>','form'),xmlHash('<form b="2" a="1">\n<tabs/>\n</form>','form'));
  assert.notEqual(xmlHash('<fetch><entity><filter><condition><value> </value></condition></filter></entity></fetch>','fetch'),
    xmlHash('<fetch><entity><filter><condition><value></value></condition></filter></entity></fetch>','fetch'));
});
