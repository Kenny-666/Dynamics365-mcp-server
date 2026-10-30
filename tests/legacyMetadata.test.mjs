import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EntitySchemaService} from '../src/services/entitySchema.ts';
import {MetadataService} from '../src/services/metadata.ts';
import {OptionSetService} from '../src/services/optionSet.ts';
import {RelationshipService} from '../src/services/relationship.ts';
import {sleep,waitFor} from '../src/services/requestPolicy.ts';
function fixture(Service,responses){const calls=[],values=new Map();return {calls,values,service:new Service({async makeRequest(...args){calls.push(args);const value=responses.shift();if(value instanceof Error) throw value;return value;}},{get:key=>values.get(key),set:(key,value)=>values.set(key,value)})};}
const label=text=>({UserLocalizedLabel:{Label:text}});
test('legacy entity summary filters system fields, orders custom fields, maps labels and caches',async()=>{
  const f=fixture(EntitySchemaService,[{LogicalName:'account',SchemaName:'Account',PrimaryIdAttribute:'accountid'},{value:[
    {LogicalName:'createdon'},{LogicalName:'name',SchemaName:'Name',AttributeType:'String',DisplayName:label('Name')},
    {LogicalName:'new_z',IsCustomAttribute:true,DisplayName:{Label:'Z'}},{LogicalName:'new_a',IsCustomAttribute:true},
    {LogicalName:'accountid',AttributeType:'Uniqueidentifier'}]}]);
  const result=await f.service.getEntityMetadataSummary('account');assert.equal(result.primaryKey,'accountid');
  assert.deepEqual(result.attributes.map(x=>x.logicalName),['new_a','new_z','accountid','name']);assert.equal(result.attributes[1].displayName,'Z');
  assert.deepEqual(await f.service.getEntityMetadataSummary('account'),result);assert.equal(f.calls.length,2);
});
test('legacy detailed field metadata and entity inventory cache successful reads',async()=>{
  const f=fixture(EntitySchemaService,[{LogicalName:'name'}]);assert.deepEqual(await f.service.getDetailedFieldMetadata('account','name'),{LogicalName:'name'});
  await f.service.getDetailedFieldMetadata('account','name');assert.equal(f.calls.length,1);
  const m=fixture(MetadataService,[{value:[{LogicalName:'account'}]},{UserId:'offline'}]);
  assert.equal((await m.service.getAllEntityDefinitions()).value[0].LogicalName,'account');await m.service.getAllEntityDefinitions();assert.equal(m.calls.length,1);
  assert.equal((await m.service.getCurrentUserContext()).UserId,'offline');assert.deepEqual(m.calls[1],['/WhoAmI','GET']);
});
test('legacy missing metadata and request failures are not cached',async()=>{
  const f=fixture(EntitySchemaService,[null,new Error('offline unavailable')]);await assert.rejects(f.service.getEntityMetadataSummary('missing'),/Entity not found/);
  await assert.rejects(f.service.getEntityMetadataSummary('missing'),/offline unavailable/);assert.equal(f.values.size,0);
  const empty=fixture(EntitySchemaService,[{LogicalName:'account',PrimaryIdAttribute:'accountid'},{}]);assert.deepEqual((await empty.service.getEntityMetadataSummary('account')).attributes,[]);
});
for(const type of ['Picklist','State','Status']) for(const global of [false,true]) test(`legacy ${type} ${global?'global':'local'} options map, sort and cache`,async()=>{
  const metadata={LogicalName:'statuscode',DisplayName:{Label:'Status'},[global?'GlobalOptionSet':'OptionSet']:{Options:[{Value:2,Label:{Label:'Two'}},{Value:0},{Value:1,Label:label('One')}]}};
  const f=fixture(OptionSetService,[{AttributeType:type},{value:[metadata]}]);const result=await f.service.getFieldOptionSetValues('account','statuscode');
  assert.deepEqual(result.options,[{value:0,label:''},{value:1,label:'One'},{value:2,label:'Two'}]);assert.match(f.calls[1][0],new RegExp(type+'AttributeMetadata'));
  await f.service.getFieldOptionSetValues('account','statuscode');assert.equal(f.calls.length,2);
});
test('legacy Boolean choices return FalseOption and TrueOption with preserved values',async()=>{
  const f=fixture(OptionSetService,[{AttributeType:'Boolean'},{value:[{LogicalName:'new_flag',DisplayName:label('Enabled'),OptionSet:{FalseOption:{Value:0,Label:label('No')},TrueOption:{Value:1,Label:label('Yes')}}}]}]);
  assert.deepEqual((await f.service.getFieldOptionSetValues('account','new_flag')).options,[{value:0,label:'No'},{value:1,label:'Yes'}]);
});
test('legacy unsupported and missing option metadata reject instead of caching errors',async()=>{
  for(const responses of [[null],[{}],[{AttributeType:'String'}],[{AttributeType:'Picklist'},{value:[]}]] ){
    const f=fixture(OptionSetService,responses);await assert.rejects(f.service.getFieldOptionSetValues('account','missing'));assert.equal(f.values.size,0);
  }
  const f=fixture(OptionSetService,[{AttributeType:'Picklist'},{value:[{LogicalName:'new_empty'}]}]);assert.deepEqual((await f.service.getFieldOptionSetValues('account','new_empty')).options,[]);
});
test('legacy relationships map all cardinalities and isolate filtered caches',async()=>{
  const meta={LogicalName:'account',OneToManyRelationships:[{ReferencingEntity:'contact',ReferencedEntity:'account',ReferencingAttribute:'parentcustomerid',ReferencedEntityNavigationPropertyName:'account_contacts'}],
    ManyToOneRelationships:[{ReferencingEntity:'account',ReferencedEntity:'systemuser',ReferencingEntityNavigationPropertyName:'ownerid'}],
    ManyToManyRelationships:[{Entity1LogicalName:'account',Entity2LogicalName:'contact',IntersectEntityName:'account_contact',Entity1NavigationPropertyName:'contacts',Entity2NavigationPropertyName:'accounts'}]};
  const f=fixture(RelationshipService,[meta,meta,meta,meta]);const all=await f.service.getEntityNavigationRelationships('account');assert.equal(all.oneToMany[0].referencingAttribute,'parentcustomerid');assert.equal(all.manyToOne[0].referencingEntityNavigationPropertyName,'ownerid');assert.equal(all.manyToMany[0].intersectEntityName,'account_contact');
  await f.service.getEntityNavigationRelationships('account');assert.equal(f.calls.length,1);
  const filtered=await f.service.getEntityNavigationRelationships('account','contact');assert.equal(filtered.oneToMany.length,1);assert.equal(filtered.manyToOne.length,0);assert.equal(filtered.manyToMany.length,1);
  const absent=await f.service.getEntityNavigationRelationships('account','lead');assert.deepEqual([absent.oneToMany.length,absent.manyToOne.length,absent.manyToMany.length],[0,0,0]);
  const reversed=await f.service.getEntityNavigationRelationships('account','account');assert.equal(reversed.oneToMany.length,1);assert.equal(reversed.manyToOne.length,1);assert.equal(reversed.manyToMany.length,1);
});
test('legacy relationship missing collections are empty; missing entities reject',async()=>{
  const f=fixture(RelationshipService,[{LogicalName:'account'},null]);const result=await f.service.getEntityNavigationRelationships('account');assert.deepEqual(result,{logicalName:'account',oneToMany:[],manyToOne:[],manyToMany:[]});await assert.rejects(f.service.getEntityNavigationRelationships('missing'),/Entity not found/);
});
test('legacy metadata identifiers reject OData interpolation before requests',async()=>{
  for(const invalid of [undefined,null,'',"account')?$expand=Attributes&x=('",'account/name','account name']){
    for(const [Service,method,args] of [[EntitySchemaService,'getEntityMetadataSummary',[invalid]],[EntitySchemaService,'getDetailedFieldMetadata',['account',invalid]],[OptionSetService,'getFieldOptionSetValues',['account',invalid]],[RelationshipService,'getEntityNavigationRelationships',[invalid]],[RelationshipService,'getEntityNavigationRelationships',['account',invalid]]]){
      if(invalid===undefined && Service===RelationshipService && args[0]==='account') continue;
      const f=fixture(Service,[]);await assert.rejects(f.service[method](...args),{code:'D365_QUERY_INVALID'});assert.equal(f.calls.length,0);
    }
  }
});
test('abortable delay resolves normally and cancels promptly',async()=>{
  await sleep(1);const controller=new AbortController();const pending=sleep(10000,controller.signal);controller.abort();await assert.rejects(pending,{code:'D365_REQUEST_ABORTED'});
  await assert.rejects(sleep(1,controller.signal),{code:'D365_REQUEST_ABORTED'});assert.equal(await waitFor(Promise.resolve(42),new AbortController().signal),42);
});
