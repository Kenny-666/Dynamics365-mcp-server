import {test} from 'node:test';import assert from 'node:assert/strict';import {planFormPackage,inspectFormField,inspectFormLibrary} from '../src/services/formPackagePlan.ts';
import {executeFormPackage} from '../src/services/formPackageExecute.ts';import {fixture,ids,membership,writes} from './solution.fixture.mjs';
const form=xml=>({kind:'form',type:2,logicalName:'account',id:'11111111-1111-1111-1111-111111111111',xml:{formxml:xml}});
test('previews entire form and preserves unresolved component references',async()=>{
 let calls=[];const source=form('<form><control datafieldname="new_x"/><Library name="new_a.js"/></form>'),target=form('<form/>');
 const r=await planFormPackage(source,target,'test_solution',async a=>{calls.push(a);return {planHash:'a',dryRun:true}});
 assert.equal(calls.length,1);assert.equal(calls[0].component_type,60);assert.equal(calls[0].dry_run,true);assert.equal(r.readyToExecute,false);assert.deepEqual(r.reviewRequired.sourceOnlyFields,['new_x']);assert.deepEqual(r.reviewRequired.sourceOnlyLibraries,['new_a.js']);
});
test('rejects invalid solution and propagates native preflight failure',async()=>{
 const f=form('<form/>');await assert.rejects(planFormPackage(f,f,'bad/name',async()=>({})));await assert.rejects(planFormPackage(f,f,'ok',async()=>{throw Error('metadata unavailable')}),/metadata unavailable/);
});
test('checks selected field metadata and reports inaccessible target as unknown',async()=>{
 const a=form('<form><control datafieldname="new_x"/><control datafieldname="new_y"/></form>'),b=form('<form/>');
 const r=await planFormPackage(a,b,'ok',async()=>({dryRun:true}),async(side,table,field)=>{if(side==='target'&&field==='new_y')throw Error('denied');return {definition:{LogicalName:field,AttributeType:side==='source'?'String':'Integer',MetadataId:'id'}}});
 assert.equal(r.fieldChecks[0].comparison,'selected_properties_differ');assert.equal(r.fieldChecks[1].comparison,'unknown');assert.equal(r.fieldChecks[1].target.status,'unavailable');
});
test('stops field inspection on cancellation instead of reporting it unavailable',async()=>{
 const controller=new AbortController(),a=form('<form><control datafieldname="new_x"/></form>');
 await assert.rejects(planFormPackage(a,form('<form/>'),'ok',async()=>({}),async()=>{controller.abort();throw Error('cancelled')},controller.signal),/cancelled/);
});
test('compares library digests without marking missing content as equal',async()=>{
 const a=form('<form><Library name="new_a.js"/><Library name="new_b.js"/></form>');
 const r=await planFormPackage(a,form('<form/>'),'ok',async()=>({}),undefined,undefined,async(side,name)=>name==='new_b.js'?{status:'unavailable'}:{status:'available',contentHash:side,type:3});
 assert.equal(r.libraryChecks[0].comparison,'content_or_type_differ');assert.equal(r.libraryChecks[1].comparison,'unknown');
});
test('previews changed source components independently without treating unknown targets as missing',async()=>{
 const a=form('<form><control datafieldname="new_x"/><control datafieldname="new_y"/><Library name="new_a.js"/></form>');
 const id='11111111-1111-1111-1111-111111111111',calls=[];
 const r=await planFormPackage(a,form('<form/>'),'ok',async q=>{calls.push(q);if(q.component_type===61)throw Error('unavailable');return {dryRun:true,planHash:'a'}},async(side,_table,name)=>{if(side==='target'&&name==='new_y')throw Error('denied');return {definition:{LogicalName:name,AttributeType:side==='source'?'String':'Integer',MetadataId:id}}},undefined,async(side)=>({status:'available',id,type:3,contentHash:side}));
 assert.deepEqual(calls.map(x=>x.component_type),[60,2,2,61]);assert.equal(r.componentCandidates.length,3);assert.equal(r.componentCandidates[0].previewStatus,'available');assert.equal(r.componentCandidates[1].reason,'unknown');assert.equal(r.componentCandidates[1].requiresManualReview,true);assert.equal(r.componentCandidates[2].previewStatus,'unavailable');assert.equal(r.readyToExecute,false);
});
test('supports a 59-field form and enforces the 100-field inspection boundary',async()=>{
 const make=n=>form('<form>'+Array.from({length:n},(_,i)=>`<control datafieldname="field_${i}"/>`).join('')+'</form>');let reads=0;
 const reader=async(_side,_table,field)=>{reads++;return {definition:{LogicalName:field,SchemaName:field,AttributeType:'String',DisplayName:{LocalizedLabels:[]},Description:null,RequiredLevel:{Value:'None'},MetadataId:'11111111-1111-1111-1111-111111111111'}}};
 const r=await planFormPackage(make(59),make(59),'ok',async()=>({dryRun:true}),reader);assert.equal(r.fieldChecks.length,59);assert.equal(reads,118);assert.ok(r.fieldChecks.every(x=>x.comparison==='selected_properties_match'));
 await assert.rejects(planFormPackage(make(101),make(101),'ok',async()=>({dryRun:true}),reader),/limit is 100/);
});

test('rechecking field properties and library contents detects source or target drift',async()=>{
 let changed=false;const field=async(side,_table,name)=>({definition:{LogicalName:name,AttributeType:changed&&side==='target'?'Integer':'String',MetadataId:'11111111-1111-1111-1111-111111111111'}});
 const library=async side=>({status:'available',id:'11111111-1111-1111-1111-111111111111',type:3,contentHash:changed&&side==='source'?'new':'old'});
 const beforeField=await inspectFormField('new_x','account',field),beforeLibrary=await inspectFormLibrary('new_a.js',library);changed=true;
 assert.notDeepEqual(await inspectFormField('new_x','account',field),beforeField);assert.notDeepEqual(await inspectFormLibrary('new_a.js',library),beforeLibrary);
});

test('field label, description and supported behavior changes appear as packaging candidates',async()=>{
 const id='22222222-2222-2222-2222-222222222222';const a=form('<form><control datafieldname="new_x"/></form>');
 for(const property of ['DisplayName','Description','DateTimeBehavior','Targets','DefaultFormValue','FormatName']){
  const r=await planFormPackage(a,a,'ok',async()=>({planHash:'p'}),async(side,_table,name)=>({definition:{LogicalName:name,AttributeType:'String',MetadataId:id,[property]:['DisplayName','Description'].includes(property)?{LocalizedLabels:[{LanguageCode:1033,Label:side}]}:side==='source'?'source':'target'}}));
  assert.equal(r.fieldChecks[0].comparison,'selected_properties_differ',property);assert.equal(r.componentCandidates[0].component_id,id,property);assert.ok(r.fieldChecks[0].source.selectedProperties.includes(property));assert.deepEqual(r.fieldChecks[0].differingProperties,[property]);
 }
});

test('compares localized text by language rather than metadata ID or ordering',async()=>{
 const label=(changed=false,reversed=false)=>({LocalizedLabels:(reversed?[{LanguageCode:2052,Label:changed?'新':'名',MetadataId:'second'},{LanguageCode:1033,Label:'Name',MetadataId:'different'}]:[{LanguageCode:1033,Label:'Name',MetadataId:'first'},{LanguageCode:2052,Label:'名',MetadataId:'first'}]),UserLocalizedLabel:{Label:'ignored'}});
 let changed=false;const reader=async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'String',Description:null,RequiredLevel:{Value:'None'},DisplayName:side==='source'?label():label(changed,true)}});
 assert.equal((await inspectFormField('new_x','account',reader)).comparison,'selected_properties_match');changed=true;const different=await inspectFormField('new_x','account',reader);assert.deepEqual(different.differingProperties,['DisplayName']);
});

test('treats incomplete or ambiguous localized labels as unknown',async()=>{
 for(const labels of [{LocalizedLabels:[{LanguageCode:1033,Label:'a'},{LanguageCode:1033,Label:'b'}]},{LocalizedLabels:[], 'LocalizedLabels@odata.nextLink':'next'},{}]){const reader=async(side,_table,name)=>({definition:{LogicalName:name,AttributeType:'String',DisplayName:side==='source'?{LocalizedLabels:[]}:labels}});assert.equal((await inspectFormField('new_x','account',reader)).comparison,'unknown');}
});

test('does not declare a partial field projection equal and reports missing source identity',async()=>{
 const a=form('<form><control datafieldname="new_x"/><Library name="new_a.js"/></form>');
 const r=await planFormPackage(a,a,'ok',async()=>({planHash:'p'}),async(_side,_table,name)=>({definition:{LogicalName:name,AttributeType:'String'}}),undefined,async()=>({status:'unavailable'}));
 assert.equal(r.fieldChecks[0].comparison,'unknown');assert.deepEqual(r.fieldChecks[0].missingProperties.source,['SchemaName','DisplayName','Description','RequiredLevel']);assert.deepEqual(r.unresolvedComponents.map(x=>x.kind),['field','library']);assert.equal(r.componentCandidates.length,0);
});

test('treats a property omitted by one environment as unknown and flags the candidate for review',async()=>{
 const id='22222222-2222-2222-2222-222222222222',a=form('<form><control datafieldname="new_x"/></form>');
 const r=await planFormPackage(a,a,'ok',async()=>({planHash:'p'}),async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'String',DisplayName:{LocalizedLabels:[]},Description:null,RequiredLevel:{Value:'None'},MetadataId:id,...(side==='source'?{MaxLength:200}:{})}}));
 assert.equal(r.fieldChecks[0].comparison,'unknown');assert.deepEqual(r.fieldChecks[0].differingProperties,[]);assert.deepEqual(r.fieldChecks[0].missingProperties.target,['MaxLength']);assert.equal(r.componentCandidates[0].requiresManualReview,true);
});

test('form, field and global choice execute through native solution service with membership readback',async()=>{
 const f=fixture({type:60,edges:[],request:(call,{members})=>{
  if(call.method==='POST'&&call.path==='/AddSolutionComponent'){const body=call.data,memberId=body.ComponentType===60?ids.membership:body.ComponentType===2?ids.other:ids.container;members.push(membership({solutioncomponentid:memberId,objectid:body.ComponentId,componenttype:body.ComponentType}));return {status:200,data:{id:memberId},headers:{}};}
  if(call.path.startsWith('/EntityDefinitions(')&&call.path.includes('/Attributes('))return {status:200,data:{MetadataId:ids.required,LogicalName:'new_x',SchemaName:'new_x',EntityLogicalName:'new_sample',AttributeType:'String',IsManaged:false},headers:{}};
  if(call.path.startsWith('/GlobalOptionSetDefinitions('))return {status:200,data:{MetadataId:ids.parent,Name:'new_choice',IsGlobal:true,OptionSetType:'Picklist',IsManaged:false},headers:{}};
 }});
 const source={...form('<form><control datafieldname="new_x"/></form>'),id:ids.object,logicalName:'new_sample'},target={...source};
 const label=side=>({LocalizedLabels:[{LanguageCode:1033,Label:side}]});const readField=async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'Picklist',MetadataId:ids.required,DisplayName:label(name),Description:null,RequiredLevel:{Value:'None'},OptionSet:{OptionSetType:'Picklist',IsGlobal:true,Name:'new_choice',MetadataId:ids.parent,Options:[{Value:1,Label:label(side)}]}}});
 const add=a=>f.service.add(a),p=await planFormPackage(source,target,'TestSolution',add,readField);assert.equal(writes(f).length,0);assert.equal(p.componentCandidates.length,2);
 const selected=[{component_type:60,component_id:ids.object},{component_type:2,component_id:ids.required},{component_type:9,component_id:ids.parent}],review=await executeFormPackage(p,selected,undefined,false,add);
 const result=await executeFormPackage(p,selected,review.planHash,true,add);assert.equal(result.status,'completed');assert.deepEqual(result.steps.map(x=>x.result.readback.status),['matched','matched','matched']);assert.deepEqual(writes(f).map(x=>x.data.ComponentType),[60,2,9]);
});

test('bounds candidate dependency output while preserving truncation evidence',async()=>{
 const id='22222222-2222-2222-2222-222222222222',a=form('<form><control datafieldname="new_x"/></form>'),edges=Array.from({length:30},(_,i)=>({requiredcomponentobjectid:String(i)}));
 const r=await planFormPackage(a,a,'ok',async q=>q.component_type===60?{planHash:'form'}:{planHash:'field',requiredDependencies:{items:edges,paging:{complete:true}}},async(side,_table,name)=>({definition:{LogicalName:name,AttributeType:side==='source'?'String':'Integer',MetadataId:id}}));
 const p=r.componentCandidates[0].preview;assert.equal(p.dependencyCount,30);assert.equal(p.dependencySample.length,20);assert.equal(p.dependenciesTruncated,true);assert.equal(p.dependencyPaging.complete,true);
});
test('compares choice values and localized labels without environment-specific IDs',async()=>{
 let changed=false,reverse=false;const label=(v,id)=>({LocalizedLabels:[{LanguageCode:1033,Label:v,MetadataId:id}]});
 const reader=async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'Picklist',MetadataId:side,DisplayName:label('Field',side),Description:null,RequiredLevel:{Value:'None'},OptionSet:{OptionSetType:'Picklist',IsGlobal:false,MetadataId:side,Options:(reverse&&side==='target'?[2,1]:[1,2]).map(v=>({Value:v,MetadataId:side,Label:label(changed&&side==='target'&&v===1?'Changed':`Option ${v}`,side)}))}}});
 assert.equal((await inspectFormField('new_x','account',reader)).comparison,'selected_properties_match');changed=true;assert.deepEqual((await inspectFormField('new_x','account',reader)).differingProperties,['OptionSet']);changed=false;reverse=true;assert.equal((await inspectFormField('new_x','account',reader)).comparison,'selected_properties_differ');
});
test('incomplete choice metadata remains unknown instead of equal',async()=>{
 const reader=async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'Picklist',DisplayName:{LocalizedLabels:[]},Description:null,RequiredLevel:{Value:'None'},OptionSet:{OptionSetType:'Picklist',IsGlobal:false,Options:[],...(side==='target'?{'Options@odata.nextLink':'next'}:{})}}});
 assert.equal((await inspectFormField('new_x','account',reader)).comparison,'unknown');
});
test('checks Boolean option values and global choice identity',async()=>{
 const label={LocalizedLabels:[]},common={LogicalName:'new_x',SchemaName:'new_x',AttributeType:'Boolean',DisplayName:label,Description:null,RequiredLevel:{Value:'None'}};
 const good={OptionSetType:'Boolean',IsGlobal:false,FalseOption:{Value:0,Label:label},TrueOption:{Value:1,Label:label}};
 assert.equal((await inspectFormField('new_x','account',async()=>({definition:{...common,OptionSet:good}}))).comparison,'selected_properties_match');
 assert.equal((await inspectFormField('new_x','account',async()=>({definition:{...common,OptionSet:{...good,TrueOption:{Value:0,Label:label}}}}))).comparison,'unknown');
 assert.equal((await inspectFormField('new_x','account',async()=>({definition:{...common,OptionSet:{OptionSetType:'Picklist',IsGlobal:true,Options:[]}}}))).comparison,'unknown');
});
test('missing choice projections on both sides are unknown and remain review candidates',async()=>{
 const id='22222222-2222-2222-2222-222222222222',a=form('<form><control datafieldname="new_x"/></form>');
 for(const type of ['Boolean','Picklist','Virtual']){const r=await planFormPackage(a,a,'ok',async()=>({planHash:'p'}),async(_side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:type,DisplayName:{LocalizedLabels:[]},Description:null,RequiredLevel:{Value:'None'},MetadataId:id}}));assert.equal(r.fieldChecks[0].comparison,'unknown',type);assert.deepEqual(r.fieldChecks[0].missingProperties.source,['OptionSet'],type);assert.deepEqual(r.fieldChecks[0].missingProperties.target,['OptionSet'],type);assert.equal(r.componentCandidates[0].requiresManualReview,true,type);}
});
test('detects changes to the global choice label and parent relationship',async()=>{
 const label=v=>({LocalizedLabels:[{LanguageCode:1033,Label:v}]}),base={LogicalName:'new_x',SchemaName:'new_x',AttributeType:'Picklist',DisplayName:label('Field'),Description:null,RequiredLevel:{Value:'None'}};
 for(const property of ['DisplayName','ParentOptionSetName']){const reader=async side=>({definition:{...base,OptionSet:{OptionSetType:'Picklist',IsGlobal:true,Name:'new_choice',Options:[],[property]:property==='DisplayName'?label(side):side}}});assert.deepEqual((await inspectFormField('new_x','account',reader)).differingProperties,['OptionSet']);}
});
test('previews one shared global choice component for changed referenced fields',async()=>{
 const id='22222222-2222-2222-2222-222222222222',choice='33333333-3333-3333-3333-333333333333',a=form('<form><control datafieldname="new_x"/><control datafieldname="new_y"/></form>'),calls=[];
 const label=v=>({LocalizedLabels:[{LanguageCode:1033,Label:v}]});const result=await planFormPackage(a,a,'ok',async q=>{calls.push(q);return {planHash:'p',...(q.component_type===9?{component:{objectId:choice,source:{Name:'new_choice'}}}:{})}},async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'Picklist',MetadataId:id,DisplayName:label(name),Description:null,RequiredLevel:{Value:'None'},OptionSet:{OptionSetType:'Picklist',IsGlobal:true,Name:'new_choice',MetadataId:choice,Options:[{Value:1,Label:label(side)}]}}}));
 const choices=result.componentCandidates.filter(x=>x.component_type===9);assert.equal(choices.length,1);assert.equal(choices[0].component_id,choice);assert.deepEqual(choices[0].related_fields,['new_x','new_y']);assert.equal(calls.filter(x=>x.component_type===9).length,1);
});
test('flags a global choice candidate when its target projection is missing alongside another field difference',async()=>{
 const id='22222222-2222-2222-2222-222222222222',choice='33333333-3333-3333-3333-333333333333',a=form('<form><control datafieldname="new_x"/></form>'),label=v=>({LocalizedLabels:[{LanguageCode:1033,Label:v}]});
 const r=await planFormPackage(a,a,'ok',async q=>({planHash:'p',...(q.component_type===9?{component:{objectId:choice,source:{Name:'new_choice'}}}:{})}),async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'Picklist',MetadataId:id,DisplayName:label(side),Description:null,RequiredLevel:{Value:'None'},...(side==='source'?{OptionSet:{OptionSetType:'Picklist',IsGlobal:true,Name:'new_choice',MetadataId:choice,Options:[]}}:{})}}));
 const item=r.componentCandidates.find(x=>x.component_type===9);assert.ok(item);assert.equal(item.requiresManualReview,true);assert.ok(r.fieldChecks[0].missingProperties.target.includes('OptionSet'));
});
test('blocks global choice candidates when shared field evidence or native identity conflicts',async()=>{
 const id='22222222-2222-2222-2222-222222222222',choice='33333333-3333-3333-3333-333333333333',a=form('<form><control datafieldname="new_x"/><control datafieldname="new_y"/></form>'),label=v=>({LocalizedLabels:[{LanguageCode:1033,Label:v}]});let mismatched=false,calls=0;
 const reader=async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'Picklist',MetadataId:id,DisplayName:label(name),Description:null,RequiredLevel:{Value:'None'},OptionSet:{OptionSetType:'Picklist',IsGlobal:true,Name:'new_choice',MetadataId:choice,Options:[{Value:1,Label:label(side==='source'&&mismatched?name:side)}]}}});
 const preview=async q=>{if(q.component_type===9)calls++;return {planHash:'p',component:{objectId:choice,source:{Name:'wrong_choice'}}}};
 const identity=await planFormPackage(a,a,'ok',preview,reader);assert.equal(identity.componentCandidates.find(x=>x.component_type===9).previewStatus,'unavailable');assert.equal(calls,1);
 mismatched=true;calls=0;const conflicting=await planFormPackage(a,a,'ok',preview,reader);assert.equal(conflicting.componentCandidates.find(x=>x.component_type===9).previewStatus,'inconsistent_source');assert.equal(calls,0);
});
test('includes matching fields when rechecking a shared changed global choice',async()=>{
 const id='22222222-2222-2222-2222-222222222222',choice='33333333-3333-3333-3333-333333333333',a=form('<form><control datafieldname="new_x"/><control datafieldname="new_y"/></form>'),label=v=>({LocalizedLabels:[{LanguageCode:1033,Label:v}]});
 const r=await planFormPackage(a,a,'ok',async q=>({planHash:'p',...(q.component_type===9?{component:{objectId:choice,source:{Name:'new_choice'}}}:{})}),async(side,_table,name)=>({definition:{LogicalName:name,SchemaName:name,AttributeType:'Picklist',MetadataId:id,DisplayName:label(name),Description:null,RequiredLevel:{Value:'None'},OptionSet:{OptionSetType:'Picklist',IsGlobal:true,Name:'new_choice',MetadataId:choice,Options:[{Value:1,Label:label(side==='target'&&name==='new_x'?'changed':'same')}]}}}));
 assert.equal(r.fieldChecks.find(x=>x.name==='new_y').comparison,'selected_properties_match');assert.deepEqual(r.componentCandidates.find(x=>x.component_type===9).related_fields,['new_x','new_y']);
});
