import './fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import axios,{AxiosHeaders} from 'axios';
import { fixture,id,fieldId,env,text,choices,createArgs,changeArgs,columnArgs } from './modelChoices.fixture.mjs';
import { ModelChoiceService } from '../src/services/modelChoices.ts';
import { ModelMetadataService } from '../src/services/modelMetadata.ts';
import { modelChoiceTools } from '../src/tools/modelChoiceTools.ts';
import { modelMetadataTools } from '../src/tools/modelMetadataTools.ts';
import { tools,handleToolCall } from '../src/tool_handler.ts';
import { CrmRequestError,toolErrorPayload } from '../src/errors.ts';
import { D365AuthService } from '../src/services/d365Auth.ts';
import { CacheService } from '../src/services/cache.ts';
import { readConfig } from '../src/config.ts';
const writes = f => f.calls.filter(call => call.method !== 'GET');
const local = {logical_name:'new_sample',attribute_name:'new_choice'};
async function failure(promise) {
  try { await promise; assert.fail('Expected failure'); } catch (error) { assert.ok(error instanceof CrmRequestError,error.stack); return toolErrorPayload(error); }
}
async function executeChange(f,args = changeArgs) {
  const preview = await f.service.changeValue(args);
  return f.service.changeValue({...args,expected_hash:preview.definitionHash,allow_unprotected_write:true,dry_run:false});
}

test('global and local choices return bounded native multilingual definitions, scope and stable hashes', async () => {
  const f = fixture(),global = await f.service.getChoices({globalChoiceName:'new_colors'}),own = await f.service.getChoices(local);
  assert.equal(global.scope,'global'); assert.equal(own.scope,'local'); assert.equal(own.definition.IsGlobal,false);
  assert.equal(global.definition.Options[0].Label.LocalizedLabels.length,2); assert.match(global.definitionHash,/^[a-f0-9]{64}$/);
  assert.equal(global.definitionHash,(await f.service.getChoices({global_choice_name:'new_colors'})).definitionHash);
  assert.equal(writes(f).length,0); assert.equal(f.calls.every(call => call.options.headers.Consistency === 'Strong'),true);
});

test('global creation preview requests platform allocation with null values and an explicit solution header', async () => {
  const f = fixture({missing:true}),preview = await f.service.createChoices(createArgs);
  assert.equal(preview.dryRun,true); assert.equal(preview.saved,false); assert.equal(writes(f).length,0);
  assert.equal(preview.request.body.Options[0].Value,null); assert.equal(preview.request.body.Options[1].Value,200);
  assert.equal(preview.request.headers['MSCRM.SolutionUniqueName'],'TestSolution'); assert.equal(preview.publication,'not_requested');
});

test('global save verifies returned explicit and publisher-allocated values without relying on option order', async () => {
  const f = fixture({missing:true}),result = await f.service.createChoices({...createArgs,dryRun:false});
  assert.equal(result.saved,true); assert.equal(result.readback.status,'matched');
  assert.deepEqual(result.readback.options.map(row => row.value),[500,200]); assert.equal(writes(f).length,1);
  assert.equal(f.calls.some(call => call.endpoint === '/PublishXml'),false);
});

test('existing, inaccessible or unsupported global metadata never becomes a successful create/upsert', async () => {
  assert.equal((await failure(fixture().service.createChoices(createArgs))).code,'D365_MODEL_EXISTS');
  for (const status of [401,403,500]) {
    const f = fixture({request:({endpoint}) => {if (endpoint.startsWith('/GlobalOptionSetDefinitions(')) throw new CrmRequestError('D365_HTTP_ERROR','secret',{status});}});
    await failure(f.service.createChoices({...createArgs,dry_run:false})); assert.equal(writes(f).length,0);
  }
  const f = fixture({global:{OptionSetType:'Boolean'}}); assert.equal((await failure(f.service.createChoices(createArgs))).code,'D365_MODEL_UNSUPPORTED'); assert.equal(writes(f).length,0);
});

test('option inputs reject repeated codes/label sets, oversized lists, unknown fields and invalid LCIDs', async () => {
  for (const options of [[],Array(1001).fill({label:text('A')}),[{value:-1,label:text('A')}],[{value:2147483648,label:text('A')}],
    [{value:1,label:text('A')},{value:1,label:text('B')}],[{label:text('A')},{label:text('A')}],
    [{label:[{language_code:0,text:'A'}]}],[{label:text('A'),unknown:true}],[{value:null,label:text('A')}],
    [{label:text('A')},{value:200,label:[...text('A'),{language_code:2052,text:'中文'}]}]]) {
    const f = fixture({missing:true}); assert.equal((await failure(f.service.createChoices({...createArgs,options}))).code,'D365_MODEL_INVALID'); assert.equal(writes(f).length,0);
  }
  const f = fixture({missing:true}); assert.equal((await failure(f.service.createChoices({...createArgs,schema_name:'other_colors'}))).code,'D365_MODEL_PREFIX');
});

test('native duplicate/invalid option values, partial choices and identity mismatches stop before edits', async () => {
  for (const readGlobal of [{MetadataId:'bad'},{Name:'other'},{IsGlobal:false},{Options:[choices.Options[0],choices.Options[0]]},
    {Options:[{Value:null}]},{Options:[],'Options@odata.nextLink':'https://evil.invalid'},{Options:42}]) {
    const f = fixture({readGlobal}); assert.equal((await failure(f.service.getChoices({global_choice_name:'new_colors'}))).code,'D365_MODEL_RESPONSE_INVALID'); assert.equal(writes(f).length,0);
  }
});

test('choice mutation preview sends no action and execution requires a current fingerprint and explicit unprotected acknowledgement', async () => {
  const f = fixture(),preview = await f.service.changeValue(changeArgs); assert.equal(writes(f).length,0);
  assert.equal(preview.request.path,'/UpdateOptionValue'); assert.equal(preview.request.body.MergeLabels,true);
  assert.equal(preview.request.body.SolutionUniqueName,'TestSolution');
  for (const extra of [{},{expected_hash:preview.definitionHash},{allow_unprotected_write:true},{expected_hash:'0'.repeat(64),allow_unprotected_write:true}]) {
    assert.match((await failure(f.service.changeValue({...changeArgs,...extra,dry_run:false}))).code,/D365_MODEL_(CONCURRENCY|CONFLICT)/);
  }
  assert.equal(writes(f).length,0);
});

test('native option update merges labels and preserves languages not included by the caller', async () => {
  const f = fixture(),result = await executeChange(f);
  assert.equal(result.saved,true); assert.equal(result.value,100); assert.equal(result.readback.status,'matched');
  assert.deepEqual(result.readback.option.Label.LocalizedLabels,[{LanguageCode:1033,Label:'Crimson'},{LanguageCode:2052,Label:'中文'}]);
  assert.equal(writes(f).length,1); assert.equal(writes(f)[0].body.OptionSetName,'new_colors');
});

test('local option action uses entity/attribute parameters and supports description-only updates', async () => {
  const f = fixture(),args = {...changeArgs,...local,global_choice_name:undefined,label:undefined,description:text('New description')};
  const result = await executeChange(f,args); assert.equal(result.saved,true);
  assert.equal(writes(f)[0].body.EntityLogicalName,'new_sample'); assert.equal(writes(f)[0].body.AttributeLogicalName,'new_choice');
  assert.equal(writes(f)[0].body.OptionSetName,undefined); assert.equal(writes(f)[0].body.MergeLabels,true);
});

test('insert reads native NewOptionValue and does not guess an automatically allocated value', async () => {
  for (const value of [undefined,300]) {
    const f = fixture(),result = await executeChange(f,{...changeArgs,operation:'insert',value,label:text('Green')});
    assert.equal(result.saved,true); assert.equal(result.value,value ?? 500); assert.equal(writes(f)[0].endpoint,'/InsertOptionValue');
    assert.equal(writes(f)[0].body.Value,value ?? null); assert.equal(writes(f)[0].body.MergeLabels,undefined);
  }
});

test('an allocated-value response missing or inconsistent after acknowledged save retains saved=true', async () => {
  const f = fixture({request:({endpoint,method}) => endpoint === '/InsertOptionValue' && method === 'POST' ? {status:200,data:{}} : undefined});
  const error = await failure(executeChange(f,{...changeArgs,operation:'insert',value:undefined,label:text('Green')}));
  assert.equal(error.data.saved,true); assert.equal(error.code,'D365_MODEL_READBACK_FAILED'); assert.equal(writes(f).length,1);
  const g = fixture({request:({endpoint,method}) => endpoint === '/InsertOptionValue' && method === 'POST' ? {status:200,data:{NewOptionValue:301}} : undefined});
  const mismatch = await failure(executeChange(g,{...changeArgs,operation:'insert',value:300,label:text('Green')}));
  assert.equal(mismatch.data.saved,true); assert.equal(mismatch.code,'D365_MODEL_READBACK_MISMATCH'); assert.equal(writes(g).length,1);
});

test('global creation with failed/mismatched readback preserves the confirmed save without replay', async () => {
  for (const mode of ['missing','labels','options']) {
    const f = fixture({missing:true,request:({endpoint,method,calls}) => {
      if (!endpoint.startsWith('/GlobalOptionSetDefinitions(') || method !== 'GET' || !calls.some(call => call.method === 'POST')) return;
      if (mode === 'missing') throw new CrmRequestError('D365_HTTP_ERROR','hidden-secret',{status:403});
      return {status:200,data:{...choices,...(mode === 'labels' ? {DisplayName:{LocalizedLabels:[]}} : {Options:[]})}};
    }});
    const error = await failure(f.service.createChoices({...createArgs,dry_run:false})); assert.equal(error.data.saved,true);
    assert.match(error.code,/D365_MODEL_READBACK_(FAILED|MISMATCH)/); assert.equal(writes(f).length,1); assert.doesNotMatch(JSON.stringify(error),/hidden-secret/);
  }
});

test('choice replacement during an unprotected action cannot be reported as matching the original identity', async () => {
  const f = fixture({request:({endpoint,method,calls}) => endpoint.startsWith('/GlobalOptionSetDefinitions(') && method === 'GET' && calls.some(call => call.method === 'POST')
    ? {status:200,data:{...choices,MetadataId:fieldId,Options:[{Value:100,Label:{LocalizedLabels:[{LanguageCode:1033,Label:'Crimson'},{LanguageCode:2052,Label:'中文'}]}}]}} : undefined});
  const error = await failure(executeChange(f)); assert.equal(error.data.saved,true); assert.equal(error.code,'D365_MODEL_READBACK_MISMATCH'); assert.equal(writes(f).length,1);
});

test('oversized option input is bounded before native creation', async () => {
  const options = Array.from({length:1000},(_,i) => ({value:i,label:text(String(i)),description:[{language_code:1033,text:'x'.repeat(2000)},{language_code:2052,text:'x'.repeat(2000)}]}));
  const f = fixture({missing:true}); assert.equal((await failure(f.service.createChoices({...createArgs,options}))).code,'D365_MODEL_INVALID'); assert.equal(writes(f).length,0);
});

test('local global-reference reads report shared scope and writes require explicit global targeting', async () => {
  const f = fixture({shared:true}),read = await f.service.getChoices(local); assert.equal(read.scope,'global_reference'); assert.equal(read.sharedAcrossColumns,true);
  const error = await failure(f.service.changeValue({...changeArgs,...local,global_choice_name:undefined}));
  assert.equal(error.code,'D365_MODEL_SHARED_CHOICE'); assert.equal(writes(f).length,0);
});

test('managed/unknown ownership or blocked choices are rejected instead of attempting publisher upgrades', async () => {
  for (const global of [{IsManaged:true},{IsManaged:null},{IsCustomizable:{Value:false}},
    {Options:[{...choices.Options[0],IsManaged:true},choices.Options[1]]}]) {
    const f = fixture({global}); assert.match((await failure(f.service.changeValue(changeArgs))).code,/D365_MODEL_(MANAGED_CHOICE|MANAGED_PROPERTY)/); assert.equal(writes(f).length,0);
  }
});

test('Boolean local choices retain exactly 0/1, allow label update and reject insertion', async () => {
  const optionSet = {MetadataId:fieldId,IsGlobal:false,IsManaged:false,IsCustomizable:{Value:true},OptionSetType:'Boolean',
    FalseOption:{Value:0,Label:{LocalizedLabels:[{LanguageCode:1033,Label:'No'}]}},TrueOption:{Value:1,Label:{LocalizedLabels:[{LanguageCode:1033,Label:'Yes'}]}}};
  const f = fixture({field:{AttributeType:'Boolean',AttributeTypeName:{Value:'BooleanType'},OptionSet:optionSet}});
  const result = await executeChange(f,{...changeArgs,...local,global_choice_name:undefined,value:0,label:text('Off')}); assert.equal(result.value,0);
  assert.equal((await failure(f.service.changeValue({...changeArgs,...local,global_choice_name:undefined,operation:'insert',value:2}))).code,'D365_MODEL_UNSUPPORTED');
});

test('state/status and incompatible targets, missing options and unknown arguments are rejected', async () => {
  for (const field of [{AttributeType:'State'},{AttributeType:'Status'},{AttributeType:'String'},{OptionSet:undefined}]) {
    const f = fixture({field}); assert.match((await failure(f.service.getChoices(local))).code,/D365_MODEL_(UNSUPPORTED|RESPONSE_INVALID)/);
  }
  for (const extra of [{global_choice_name:undefined},{...local},{operation:'delete'},{value:undefined},{value:999},{label:undefined},
    {expected_hash:'bad'},{globalChoiceName:'other'},{unknown:true}]) {
    const f = fixture(); assert.match((await failure(f.service.changeValue({...changeArgs,...extra}))).code,/D365_MODEL_(INVALID|NOT_FOUND)/); assert.equal(writes(f).length,0);
  }
  const f = fixture(); assert.equal((await failure(f.service.changeValue({...changeArgs,operation:'insert'}))).code,'D365_MODEL_EXISTS');
});

test('post-save altered/missing labels and loss of other languages produce saved=true errors', async () => {
  for (const malformed of [{Options:[]},{Options:[{Value:100,Label:{LocalizedLabels:[{LanguageCode:1033,Label:'Crimson'}]}}]}]) {
    const f = fixture({request:({endpoint,method,calls}) => endpoint.startsWith('/GlobalOptionSetDefinitions(') && method === 'GET' && calls.some(call => call.method === 'POST') ? {status:200,data:{...choices,...malformed}} : undefined});
    const error = await failure(executeChange(f)); assert.equal(error.data.saved,true); assert.equal(error.code,'D365_MODEL_READBACK_MISMATCH'); assert.equal(writes(f).length,1);
  }
});

test('unknown action outcomes never retry a value or automatically publish and keep transport messages out of phase errors', async () => {
  const f = fixture({request:({method}) => {if (method === 'POST') throw new CrmRequestError('D365_TIMEOUT','hidden-secret',{outcome:'unknown'});}});
  const error = await failure(executeChange(f)); assert.equal(error.data.saved,null); assert.equal(error.outcome,'unknown');
  assert.equal(writes(f).length,1); assert.doesNotMatch(JSON.stringify(error),/hidden-secret/);
});

test('global publication is independently scoped and distinguishes rejected from unknown outcomes', async () => {
  const f = fixture(),preview = await f.service.publishChoices({globalChoiceName:'new_colors'}); assert.equal(writes(f).length,0);
  assert.equal(preview.request.body.ParameterXml,'<importexportxml><optionsets><optionset>new_colors</optionset></optionsets></importexportxml>');
  assert.match(preview.scope,/other_pending_changes/); assert.equal((await f.service.publishChoices({global_choice_name:'new_colors',dry_run:false})).publication,'published');
  for (const outcome of ['rejected','unknown']) {
    const bad = fixture({request:({method}) => {if (method === 'POST') throw new CrmRequestError('D365_HTTP_ERROR','failed',{outcome});}});
    const error = await failure(bad.service.publishChoices({global_choice_name:'new_colors',dry_run:false})); assert.equal(error.code,'D365_MODEL_PUBLISH_FAILED');
    assert.equal(error.data.publication,outcome === 'unknown' ? 'unknown' : 'failed'); assert.equal(writes(bad).length,1);
  }
});

for (const [type,extra,check] of [['Money',{precision:3,min_value:-10,max_value:100},{Precision:3,PrecisionSource:0}],
  ['DateTime',{format:'DateOnly',dateTimeBehavior:'DateOnly'},{Format:'DateOnly',DateTimeBehavior:{Value:'DateOnly'}}],
  ['Boolean',{trueLabel:text('Yes'),falseLabel:text('No'),defaultValue:false},{DefaultValue:false}],
  ['Picklist',{options:[{label:text('A')},{value:100,label:text('B')}]},{AttributeType:'Picklist'}],
  ['MultiSelectPicklist',{options:[{value:100,label:text('A')}]},{AttributeType:'Virtual',AttributeTypeName:{Value:'MultiSelectPicklistType'}}]]) {
  test(type + ': native derived column creation and complete readback preserve type-specific settings', async () => {
    const f = fixture(),args = {...columnArgs,options:undefined,type,...extra,dry_run:false};
    const result = await f.model.create(args,'column'); assert.equal(result.saved,true); assert.equal(result.readback.status,'matched'); assert.equal(writes(f).length,1);
    const body = writes(f)[0].body; for (const [key,value] of Object.entries(check)) assert.deepEqual(body[key],value);
    assert.equal(body['@odata.type'],'Microsoft.Dynamics.CRM.' + type + 'AttributeMetadata');
    if (type === 'Picklist') assert.deepEqual(result.readback.choices.map(row => row.value),[500,100]);
    if (type === 'MultiSelectPicklist') assert.equal(f.calls.some(call => call.endpoint.includes('/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?')),true);
  });
}

test('global Picklist and MultiSelect bindings resolve native identity and verify it without copying options', async () => {
  for (const type of ['Picklist','MultiSelectPicklist']) {
    const f = fixture(),result = await f.model.create({...columnArgs,type,options:undefined,globalChoiceName:'new_colors',dry_run:false},'column');
    assert.equal(result.saved,true); assert.equal(writes(f)[0].body['GlobalOptionSet@odata.bind'],`/GlobalOptionSetDefinitions(${id})`);
    assert.equal(writes(f)[0].body.OptionSet,undefined); assert.ok(result.readback.checkedProperties.includes('GlobalOptionSet'));
  }
});

test('choice defaults must be explicit existing single-select values; a MultiSelect default is rejected', async () => {
  const f = fixture(),result = await f.model.create({...columnArgs,default_value:100,dry_run:false},'column'); assert.equal(result.saved,true);
  for (const extra of [{default_value:999},{type:'MultiSelectPicklist',default_value:100},{options:undefined,global_choice_name:'new_colors',default_value:999}]) {
    const bad = fixture(); assert.equal((await failure(bad.model.create({...columnArgs,...extra},'column'))).code,'D365_MODEL_INVALID'); assert.equal(writes(bad).length,0);
  }
});

test('new field settings reject mixed types, incompatible dates and invalid Boolean/choice payloads', async () => {
  for (const extra of [{type:'Money',precision:5},{type:'Money',true_label:text('Yes')},{type:'DateTime',date_time_behavior:'DateOnly'},
    {type:'DateTime',format:'bad'},{type:'DateTime',precision:1},{type:'Boolean'},{type:'Boolean',true_label:text('Yes'),false_label:text('No'),default_value:0},
    {type:'Picklist',options:undefined},{global_choice_name:'new_colors',options:columnArgs.options},{type:'MultiSelectPicklist',max_length:10}]) {
    const f = fixture(); assert.equal((await failure(f.model.create({...columnArgs,options:undefined,...extra},'column'))).code,'D365_MODEL_INVALID'); assert.equal(writes(f).length,0);
  }
});

test('field label PUT keeps option values and type-specific settings instead of using it to edit option labels', async () => {
  const f = fixture(),args = {...local,solution_unique_name:'TestSolution',display_name:text('Renamed field')};
  const preview = await f.model.updateLabels(args);
  const result = await f.model.updateLabels({...args,expected_hash:preview.definitionHash,allow_unprotected_write:true,dry_run:false});
  assert.equal(result.saved,true); assert.equal(writes(f).length,1); assert.equal(writes(f)[0].method,'PUT');
  assert.equal(writes(f)[0].body.OptionSet.Options[0].Label.LocalizedLabels[0].Label,'Red');
});

test('a mismatched global binding in native readback retains the successful field save', async () => {
  const f = fixture({readField:{OptionSet:{...choices,MetadataId:fieldId}}});
  const error = await failure(f.model.create({...columnArgs,options:undefined,global_choice_name:'new_colors',dry_run:false},'column'));
  assert.equal(error.code,'D365_MODEL_READBACK_MISMATCH'); assert.equal(error.data.saved,true);
});

test('cancellation before preflight sends nothing and cancellation after action preserves saved evidence', async () => {
  const before = new AbortController(); before.abort(); const f = fixture();
  assert.equal((await failure(f.service.getChoices({global_choice_name:'new_colors'},before.signal))).code,'D365_REQUEST_ABORTED'); assert.equal(f.calls.length,0);
  const controller = new AbortController(),g = fixture({request:({method}) => {if (method === 'POST') controller.abort();}});
  const preview = await g.service.changeValue(changeArgs,controller.signal);
  const error = await failure(g.service.changeValue({...changeArgs,expected_hash:preview.definitionHash,allow_unprotected_write:true,dry_run:false},controller.signal));
  assert.equal(error.data.saved,true); assert.equal(writes(g).length,1); assert.equal(g.calls.every(call => call.options.signal === controller.signal),true);
});

test('choice schemas compile with aliases/defaults enabled and selectors are mutually exclusive', () => {
  const ajv = new Ajv({strict:false,useDefaults:true}),examples = {get_model_choices:{globalChoiceName:'new_colors'},create_model_choices:createArgs,
    change_model_choice_value:changeArgs,publish_model_choices:{globalChoiceName:'new_colors',dryRun:false}};
  for (const tool of modelChoiceTools) {
    const validate = ajv.compile(tool.inputSchema); assert.equal(validate(examples[tool.name]),true,JSON.stringify(validate.errors));
    assert.equal(validate({unknown:true}),false); assert.equal(tools.filter(item => item.name === tool.name).length,1);
    if (tool.name === 'get_model_choices') { assert.equal(validate(local),true); assert.equal(validate({...local,global_choice_name:'new_colors'}),false); }
  }
  const column = ajv.compile(modelMetadataTools.find(tool => tool.name === 'create_model_column').inputSchema);
  assert.equal(column({...columnArgs,type:'Boolean',options:undefined,trueLabel:text('Yes'),falseLabel:text('No'),defaultValue:false}),true,JSON.stringify(column.errors));
});

test('all four MCP routes share request services and pass the call cancellation signal', async t => {
  let active = fixture(); const made = fixture({missing:true}),settings = {AUTH_TYPE:'online',ORG_URL:env.orgUrl,TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline'};
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key,process.env[key]])); Object.assign(process.env,settings);
  t.mock.method(D365AuthService.prototype,'requestWithResponse',(...args) => active.client.requestWithResponse(...args));
  const live = new AbortController(),first = active;
  try {
    assert.equal((await handleToolCall('get_model_choices',{global_choice_name:'new_colors'},{signal:live.signal})).scope,'global');
    assert.equal((await handleToolCall('change_model_choice_value',changeArgs,{signal:live.signal})).dryRun,true);
    assert.equal((await handleToolCall('publish_model_choices',{global_choice_name:'new_colors'},{signal:live.signal})).dryRun,true);
    active = made; assert.equal((await handleToolCall('create_model_choices',createArgs,{signal:live.signal})).dryRun,true);
    assert.equal([...first.calls,...made.calls].every(call => call.options.signal === live.signal),true); assert.equal(writes(first).length + writes(made).length,0);
  } finally { for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('Online/NTLM/IFD actual native request layer preserves option action parameters, MergeLabels and derived field binds', async t => {
  t.mock.method(axios,'post',async () => ({data:{access_token:'offline-token',expires_in:3600}}));
  for (const authType of ['online','op_ad','op_ifd']) {
    CacheService.flushExisting();
    const config = readConfig({AUTH_TYPE:authType,ORG_URL:env.orgUrl,API_VERSION:'v9.1',TENANT_ID:'offline',CLIENT_ID:'offline',CLIENT_SECRET:'offline',
      AD_DOMAIN:'OFFLINE',AD_USERNAME:'offline',AD_PASSWORD:'offline',IFD_ADFS_URL:'https://adfs.invalid',IFD_CLIENT_ID:'offline',IFD_USERNAME:'offline',IFD_PASSWORD:'offline'});
    const client = new D365AuthService(config),f = fixture();
    client.getAxiosInstance().defaults.adapter = async config => {
      const url = new URL(config.url),endpoint = url.pathname.replace('/Demo/api/data/v9.1','') + url.search;
      const response = await f.client.requestWithResponse(endpoint,config.method.toUpperCase(),config.data ? JSON.parse(config.data) : undefined,{headers:config.headers});
      return {config,status:response.status,statusText:'OK',data:response.data,headers:new AxiosHeaders(response.headers)};
    };
    const service = new ModelChoiceService(client,{...env,authType}),preview = await service.changeValue(changeArgs);
    assert.equal((await service.changeValue({...changeArgs,expected_hash:preview.definitionHash,allow_unprotected_write:true,dry_run:false})).saved,true);
    const model = new ModelMetadataService(client,{...env,authType});
    assert.equal((await model.create({...columnArgs,options:undefined,global_choice_name:'new_colors',dry_run:false},'column')).saved,true);
    assert.equal(writes(f)[0].body.MergeLabels,true); assert.equal(writes(f)[0].body.SolutionUniqueName,'TestSolution'); assert.equal(writes(f).length,2);
  }
});
