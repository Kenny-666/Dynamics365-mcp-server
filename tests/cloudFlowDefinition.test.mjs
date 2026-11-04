import {test} from 'node:test';import assert from 'node:assert/strict';import {prepareCloudFlow} from '../src/services/cloudFlowDefinition.ts';
test('builds manual flow with explicit ordered dependencies and no external connections',()=>{const r=prepareCloudFlow({name:'Demo',trigger:{kind:'manual'},actions:[{name:'First',kind:'compose',value:'hello'},{name:'Second',kind:'compose',value:42,after:['First']}]});assert.deepEqual(r.definition.properties.definition.actions.Second.runAfter,{First:['Succeeded']});assert.deepEqual(r.connectionsRequired,[]);assert.equal(r.created,false);});
test('builds scheduled flow and rejects forward references, expressions and duplicate names',()=>{const t={kind:'recurrence',frequency:'Hour',interval:2};assert.equal(prepareCloudFlow({name:'Demo',trigger:t,actions:[{name:'One',kind:'compose',value:true}]}).trigger,'recurrence');for(const actions of [[{name:'A',kind:'compose',value:'@triggerBody()'}],[{name:'A',kind:'compose',value:1,after:['B']}],[{name:'A',kind:'compose',value:1},{name:'a',kind:'compose',value:2}]])assert.throws(()=>prepareCloudFlow({name:'Demo',trigger:t,actions}));});
test('generates variable, conditional branches and a sequential foreach',()=>{
 const r=prepareCloudFlow({name:'Flow',trigger:{kind:'manual'},actions:[{name:'Init',kind:'initialize_variable',variable_name:'Count',value:2},{name:'Check',kind:'condition',variable_name:'Count',value:2,then_value:'yes',else_value:'no',after:['Init']},{name:'List',kind:'initialize_variable',variable_name:'Items',value:['a','b']},{name:'Loop',kind:'for_each',variable_name:'Items',after:['List']}]});
 const a=r.definition.properties.definition.actions;assert.equal(a.Init.type,'InitializeVariable');assert.deepEqual(a.Check.expression,{and:[{equals:["@variables('Count')",2]}]});assert.equal(a.Loop.foreach,"@variables('Items')");assert.equal(a.Loop.operationOptions,'Sequential');assert.equal(a.Loop.actions.Loop_Item.inputs,'@item()');
});
test('rejects variable use without dependency and duplicate branch action names',()=>{
 const t={kind:'manual'},init={name:'Init',kind:'initialize_variable',variable_name:'X',value:1};assert.throws(()=>prepareCloudFlow({name:'F',trigger:t,actions:[init,{name:'C',kind:'condition',variable_name:'X',value:1,then_value:'a',else_value:'b'}]}));assert.throws(()=>prepareCloudFlow({name:'F',trigger:t,actions:[init,{name:'C',kind:'condition',variable_name:'X',value:1,then_value:'a',else_value:'b',after:['Init']},{name:'C_True',kind:'compose',value:1}]}));
});
test('builds bounded Dataverse operations and requires reference binding',()=>{
 const x=prepareCloudFlow({name:'CRM',dataverse_connection:'new_ref',trigger:{kind:'manual'},actions:[{name:'List',kind:'dataverse_list',entity_set:'accounts',top:10},{name:'Create',kind:'dataverse_create',entity_set:'accounts',fields:{name:'Example'},after:['List']},{name:'Update',kind:'dataverse_update',entity_set:'accounts',record_id:'11111111-1111-1111-1111-111111111111',fields:{name:'Changed'},after:['Create']}]});
 const a=x.definition.properties.definition.actions;assert.equal(a.List.inputs.host.operationId,'ListRecords');assert.equal(a.Create.inputs.parameters['item/name'],'Example');assert.equal(a.Update.inputs.host.operationId,'UpdateOnlyRecord');assert.deepEqual(x.connectionsRequired,['new_ref']);assert.equal(x.bindingResolved,false);
 assert.throws(()=>prepareCloudFlow({name:'F',trigger:{kind:'manual'},actions:[{name:'A',kind:'dataverse_list',entity_set:'accounts'}]}));
});
test('builds Dataverse webhook trigger and requires a connection even without connector actions',()=>{
 const r=prepareCloudFlow({name:'CRM',dataverse_connection:'new_ref',trigger:{kind:'dataverse_event',entity_name:'account',message:3,scope:4,filtering_attributes:['name','emailaddress1']},actions:[{name:'A',kind:'compose',value:'ok'}]});
 const t=r.definition.properties.definition.triggers.trigger;assert.equal(t.type,'OpenApiConnectionWebhook');assert.equal(t.inputs.host.operationId,'SubscribeWebhookTrigger');assert.equal(t.inputs.parameters['subscriptionRequest/message'],3);assert.equal(t.inputs.parameters['subscriptionRequest/filteringattributes'],'name,emailaddress1');assert.deepEqual(r.connectionsRequired,['new_ref']);
 assert.throws(()=>prepareCloudFlow({name:'CRM',trigger:{kind:'dataverse_event',entity_name:'account',message:3,scope:4},actions:[{name:'A',kind:'compose',value:'ok'}]}));
});
test('binds trigger fields and initialized variables using generated bounded expressions',()=>{
 const x=prepareCloudFlow({name:'CRM',dataverse_connection:'new_ref',trigger:{kind:'dataverse_event',entity_name:'account',message:3,scope:4},actions:[{name:'Init',kind:'initialize_variable',variable_name:'Title',value:'demo'},{name:'Update',kind:'dataverse_update',entity_set:'accounts',record_id_from_trigger:'accountid',fields:{name:{source:'trigger',name:'name'},description:{source:'variable',name:'Title'}},after:['Init']}]});
 const p=x.definition.properties.definition.actions.Update.inputs.parameters;assert.equal(p.recordId,"@triggerOutputs()?['body/accountid']");assert.equal(p['item/name'],"@triggerOutputs()?['body/name']");assert.equal(p['item/description'],"@variables('Title')");
});
test('rejects unsafe or unavailable dynamic values',()=>{
 const base={name:'CRM',dataverse_connection:'new_ref',trigger:{kind:'manual'}};assert.throws(()=>prepareCloudFlow({...base,actions:[{name:'A',kind:'dataverse_create',entity_set:'accounts',fields:{name:{source:'trigger',name:'x'}}}]}));
 assert.throws(()=>prepareCloudFlow({...base,actions:[{name:'A',kind:'dataverse_create',entity_set:'accounts',fields:{name:{source:'trigger',name:"x']"}}}]}));
 assert.throws(()=>prepareCloudFlow({...base,actions:[{name:'A',kind:'dataverse_create',entity_set:'accounts',fields:{name:{source:'variable',name:'missing'}}}]}));
});
test('allows a Dataverse write output as a later action field and record ID',()=>{
 const r=prepareCloudFlow({name:'F',dataverse_connection:'new_ref',trigger:{kind:'manual'},actions:[{name:'Create',kind:'dataverse_create',entity_set:'accounts',fields:{name:'A'}},{name:'Update',kind:'dataverse_update',entity_set:'accounts',record_id_from_output:{action:'Create',name:'accountid'},fields:{name:{source:'action',action:'Create',name:'name'}},after:['Create']}]});
 const p=r.definition.properties.definition.actions.Update.inputs.parameters;assert.equal(p.recordId,"@outputs('Create')?['body/accountid']");assert.equal(p['item/name'],"@outputs('Create')?['body/name']");
});
test('rejects output references without a matching direct action dependency',()=>{
 const a={name:'F',dataverse_connection:'new_ref',trigger:{kind:'manual'},actions:[{name:'Create',kind:'dataverse_create',entity_set:'accounts',fields:{name:'A'}},{name:'Update',kind:'dataverse_update',entity_set:'accounts',record_id_from_output:{action:'Create',name:'accountid'},fields:{name:'B'}}]};assert.throws(()=>prepareCloudFlow(a),/direct dependency/);
});
test('builds get-row action and passes its output to a dependent write',()=>{
 const base={name:'F',dataverse_connection:'new_ref',trigger:{kind:'manual'}},get={name:'Get',kind:'dataverse_get',entity_set:'accounts',record_id:'11111111-1111-1111-1111-111111111111'};
 const update={name:'Update',kind:'dataverse_update',entity_set:'accounts',record_id_from_output:{action:'Get',name:'accountid'},fields:{name:{source:'action',action:'Get',name:'name'}},after:['Get']};
 const r=prepareCloudFlow({...base,actions:[get,update]}),a=r.definition.properties.definition.actions;assert.equal(a.Get.inputs.host.operationId,'GetItem');assert.equal(a.Get.inputs.parameters.recordId,get.record_id);assert.equal(a.Update.inputs.parameters['item/name'],"@outputs('Get')?['body/name']");assert.deepEqual(r.connectionsRequired,['new_ref']);
 assert.throws(()=>prepareCloudFlow({...base,actions:[{...get,record_id:'bad'}]}));assert.throws(()=>prepareCloudFlow({...base,actions:[{...get,record_id_from_trigger:'accountid'}]}));assert.throws(()=>prepareCloudFlow({...base,actions:[get,{...update,after:[]}]}),/direct dependency/);
});
test('builds a bounded structured Dataverse list query with escaped OData literals',()=>{
 const r=prepareCloudFlow({name:'F',dataverse_connection:'new_ref',trigger:{kind:'manual'},actions:[{name:'List',kind:'dataverse_list',entity_set:'accounts',top:25,select:['accountid','name','_ownerid_value'],order_by:[{field:'name',direction:'asc'},{field:'createdon',direction:'desc'}],filter:{conditions:[{field:'name',operator:'eq',value:"O'Brien"},{field:'statecode',operator:'eq',value:0}]}}]});
 const p=r.definition.properties.definition.actions.List.inputs.parameters;assert.deepEqual(p, {entityName:'accounts','$top':25,'$select':'accountid,name,_ownerid_value','$orderby':'name asc,createdon desc','$filter':"name eq 'O''Brien' and statecode eq 0"});
});
test('rejects unsafe or ambiguous Dataverse list query inputs',()=>{
 const base={name:'F',dataverse_connection:'new_ref',trigger:{kind:'manual'}};
 for(const action of [
  {name:'L',kind:'dataverse_list',entity_set:'accounts',filter:{conditions:[{field:'name',operator:'eq',value:'@triggerBody()'}]}},
  {name:'L',kind:'dataverse_list',entity_set:'accounts',select:['name','Name']},
  {name:'L',kind:'dataverse_list',entity_set:'accounts',order_by:[{field:'name',direction:'up'}]},
  {name:'L',kind:'dataverse_list',entity_set:'accounts',filter:{conditions:[{field:'name or statecode',operator:'eq',value:'x'}]}}
 ])assert.throws(()=>prepareCloudFlow({...base,actions:[action]}));
});
