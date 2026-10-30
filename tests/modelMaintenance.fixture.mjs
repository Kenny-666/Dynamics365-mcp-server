import {CrmRequestError} from '../src/errors.ts';
import {ModelMaintenanceService} from '../src/services/modelMaintenance.ts';
export const ids={table:'11111111-1111-1111-1111-111111111111',field:'22222222-2222-2222-2222-222222222222',
  relation:'33333333-3333-3333-3333-333333333333',key:'44444444-4444-4444-4444-444444444444',
  job:'55555555-5555-5555-5555-555555555555',newJob:'66666666-6666-6666-6666-666666666666'};
export const env={orgUrl:'https://crm.invalid/Demo',authType:'op_ad',apiVersion:'v9.1'};
export const label=(english='Title')=>({LocalizedLabels:[{LanguageCode:1033,Label:english,MetadataId:ids.field},{LanguageCode:2052,Label:'中文'}],UserLocalizedLabel:{Label:'drop-me',LanguageCode:1033}});
const property=(Value=true)=>({Value,CanBeChanged:true,ManagedPropertyLogicalName:'keep-native-name'});
export const fieldArgs={logical_name:'new_sample',attribute_name:'new_title',solution_unique_name:'TestSolution',patch:{max_length:200}};
export const relationshipArgs={schema_name:'new_account_sample',solution_unique_name:'TestSolution',patch:{menu:{order:200}}};
export const keyArgs={logical_name:'new_sample',schema_name:'new_ReferenceKey',solution_unique_name:'TestSolution'};
const menu=()=>({Behavior:'UseLabel',Group:'Details',Order:100,IsCustomizable:true,Label:label('Related'),ViewId:ids.table,MenuId:'keep-menu-id'});
export function fixture(options={}) {
  const kind=options.kind || 'String';let wrote=false;
  const choices=kind==='Boolean'?{OptionSetType:'Boolean',TrueOption:{Value:1,Label:label('Yes')},FalseOption:{Value:0,Label:label('No')}}
    : {OptionSetType:'Picklist',IsGlobal:false,Name:'new_title',MetadataId:ids.field,Options:[{Value:1,Label:label('One')},{Value:2,Label:label('Two')}]};
  const column={MetadataId:ids.field,LogicalName:'new_title',SchemaName:'new_Title',EntityLogicalName:'new_sample',
    AttributeType:kind==='MultiSelectPicklist'?'Virtual':kind,AttributeTypeName:{Value:kind+'Type'},IsCustomAttribute:true,
    IsManaged:false,IsPrimaryId:false,IsPrimaryName:false,IsLogical:false,SourceType:0,AttributeOf:null,AutoNumberFormat:null,
    IsCustomizable:property(),CanModifyAdditionalSettings:property(),RequiredLevel:property('None'),
    IsAuditEnabled:property(false),IsValidForAdvancedFind:property(),DisplayName:label(),Description:label('Description'),
    MaxLength:kind==='Memo'?1000:100,MinValue:0,MaxValue:100,Precision:2,PrecisionSource:0,
    Format:kind==='DateTime'?'DateAndTime':'None',DateTimeBehavior:{Value:'UserLocal'},
    ...(['Boolean','Picklist','MultiSelectPicklist'].includes(kind)?{OptionSet:choices}:{}),
    DefaultValue:false,DefaultFormValue:1,CustomUnknownProperty:{keep:'this'},HasChanged:null,'@odata.context':'ignored',...options.column};
  const relation={MetadataId:ids.relation,SchemaName:'new_account_sample',RelationshipType:options.many?'ManyToManyRelationship':'OneToManyRelationship',
    IsManaged:false,IsCustomRelationship:true,IsCustomizable:property(),ReferencedEntity:'account',ReferencedAttribute:'accountid',
    ReferencingEntity:'new_sample',ReferencingAttribute:'new_accountid',
    ...(options.many ? {Entity1LogicalName:'account',Entity2LogicalName:'new_sample',IntersectEntityName:'new_intersect',Entity1AssociatedMenuConfiguration:menu(),Entity2AssociatedMenuConfiguration:menu()}
      : {AssociatedMenuConfiguration:menu(),CascadeConfiguration:{Assign:'NoCascade',Delete:'Restrict',Merge:'NoCascade',Reparent:'NoCascade',Share:'NoCascade',Unshare:'NoCascade',RollupView:'NoCascade'}}),
    UnknownNativeFlag:'preserve',...options.relationship};
  const key={MetadataId:ids.key,SchemaName:'new_ReferenceKey',LogicalName:'new_referencekey',EntityLogicalName:'new_sample',
    KeyAttributes:['new_reference'],IsManaged:false,IsCustomizable:property(),EntityKeyIndexStatus:'Failed',AsyncJob:ids.job,...options.key};
  const calls=[];
  const client={async requestWithResponse(endpoint,method='GET',body,requestOptions={}){
    const call={endpoint,method,body,options:requestOptions};calls.push(call);
    if(requestOptions.signal?.aborted)throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled',{outcome:'not_sent'});
    const custom=await options.request?.(call,{column,relation,key,wrote});if(custom!==undefined)return custom;
    const ok=data=>({data:structuredClone(data),status:200,headers:{}});
    if(method!=='GET'){
      if(options.writeError)throw options.writeError;
      if(method==='PUT' && endpoint.includes('/Attributes('))Object.assign(column,structuredClone(body));
      else if(method==='PUT' && endpoint.startsWith('/RelationshipDefinitions('))Object.assign(relation,structuredClone(body));
      else if(method==='POST' && endpoint==='/ReactivateEntityKey'){
        if(!options.delay){key.EntityKeyIndexStatus=options.indexAfter ?? 'Pending';key.AsyncJob=options.jobAfter ?? ids.newJob;}
      }else throw new Error('Unexpected mutation '+method+' '+endpoint);
      wrote=true;options.afterWrite?.({column,relation,key});return {data:null,status:204,headers:{}};
    }
    if(wrote && options.readbackError)throw options.readbackError;
    if(endpoint.startsWith('/solutions?'))return ok({value:[{solutionid:ids.table,uniquename:'TestSolution',ismanaged:false,
      publisherid:{publisherid:ids.table,customizationprefix:'new'},...options.solution}]});
    if(endpoint.startsWith('/RelationshipDefinitions?'))return ok({value:[relation]});
    if(endpoint.startsWith('/RelationshipDefinitions('))return ok(relation);
    if(endpoint.endsWith('/Keys'))return ok({value:[key],...(options.keyNext?{'@odata.nextLink':'https://evil.invalid'}:{})});
    if(endpoint.includes('/Attributes('))return ok(column);
    if(endpoint.startsWith('/EntityDefinitions(')){
      const table=/LogicalName='([^']+)'/.exec(endpoint)[1];
      return ok({MetadataId:ids.table,LogicalName:table,SchemaName:table,IsCustomizable:property(),DataProviderId:null,...options.table});
    }
    throw new Error('Unexpected read '+endpoint);
  },async makeRequest(...args){return (await client.requestWithResponse(...args)).data;}};
  return {calls,client,column,relation,key,service:new ModelMaintenanceService(client,env)};
}
export const writes=f=>f.calls.filter(call=>call.method!=='GET');
export async function execute(f,args,method,signal){const preview=await f.service[method](args,signal);
  return f.service[method]({...args,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true},signal);}
