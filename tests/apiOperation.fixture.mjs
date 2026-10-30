import {ApiOperationService} from '../src/services/apiOperation.ts';
export const id='11111111-1111-1111-1111-111111111111';
export const env={orgUrl:'https://crm.invalid/Demo',authType:'op_ad',apiVersion:'v9.1'};
export const parameter=(name,type,extra='')=>`<Parameter Name="${name}" Type="${type}" Nullable="false" ${extra}/>`;
export const wrap=(operations,imports='',extra='')=>`<?xml version="1.0"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>
<Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="Microsoft.Dynamics.CRM" Alias="mscrm">
<EntityType Name="crmbaseentity" Abstract="true"/>
<EntityType Name="account" BaseType="mscrm.crmbaseentity"><Key><PropertyRef Name="accountid"/></Key><Property Name="accountid" Type="Edm.Guid" Nullable="false"/><Property Name="name" Type="Edm.String"/><Property Name="creditlimit" Type="Edm.Decimal"/></EntityType>
<EntityType Name="contact" BaseType="mscrm.crmbaseentity"><Key><PropertyRef Name="contactid"/></Key><Property Name="contactid" Type="Edm.Guid" Nullable="false"/><Property Name="fullname" Type="Edm.String"/></EntityType>
<ComplexType Name="Config"><Property Name="Count" Type="Edm.Int32" Nullable="false"/><Property Name="Token" Type="Edm.String"/></ComplexType>
<EnumType Name="AccessRights" IsFlags="true"><Member Name="Read" Value="1"/><Member Name="Write" Value="2"/></EnumType>
<EnumType Name="Color"><Member Name="Red" Value="1"/><Member Name="Blue" Value="2"/></EnumType>
${extra}${operations}<EntityContainer Name="DefaultContainer"><EntitySet Name="accounts" EntityType="mscrm.account"/><EntitySet Name="contacts" EntityType="mscrm.contact"/>${imports}</EntityContainer>
</Schema></edmx:DataServices></edmx:Edmx>`;
const action=(name,params='',bound=false)=>`<Action Name="${name}"${bound?' IsBound="true"':''}>${params}</Action>`;
const func=(name,params='',bound=false)=>`<Function Name="${name}"${bound?' IsBound="true"':''}>${params}<ReturnType Type="Edm.String"/></Function>`;
const ai=name=>`<ActionImport Name="${name}" Action="mscrm.${name}"/>`;
const fi=name=>`<FunctionImport Name="${name}" Function="mscrm.${name}"/>`;
export const simple=(type='Edm.String',facets='')=>wrap(func('Probe',parameter('P',type,facets)),fi('Probe'));
export const csdl=wrap([
  action('new_Run',parameter('Text','Edm.String')+'<Parameter Name="Optional" Type="Edm.String"/>'),
  action('new_Secret',parameter('Password','Edm.String')),
  func('new_Search',parameter('Text','Edm.String')+parameter('Count','Edm.Int32')),
  func('WhoAmI'),
  action('new_Bound',parameter('entity','mscrm.account')+parameter('Text','Edm.String'),true),
  action('new_Bound',parameter('entity','mscrm.contact')+parameter('Text','Edm.String'),true),
  func('new_BoundFunction',parameter('entity','mscrm.crmbaseentity')+parameter('Text','Edm.String'),true),
  action('new_Collection',parameter('entityset','Collection(mscrm.account)')+parameter('Targets','Collection(mscrm.crmbaseentity)'),true),
  action('new_Entity',parameter('Target','mscrm.crmbaseentity')),
  func('new_Ref',parameter('Target','mscrm.crmbaseentity')),
  func('new_Complex',parameter('Config','mscrm.Config')),
  action('new_Exact',parameter('Large','Edm.Int64')+parameter('Amount','Edm.Decimal','Precision="20" Scale="4"')),
  func('new_Enums',parameter('Rights','mscrm.AccessRights')+parameter('Color','mscrm.Color')),
  func('new_Overload',parameter('Value','Edm.Int32')),
  func('new_Overload',parameter('Value','Edm.Int64')),
  func('new_Optional',parameter('Required','Edm.Int32')+'<Parameter Name="Optional" Type="Edm.String"><Annotation Term="Org.OData.Core.V1.OptionalParameter"/></Parameter>'),
  action('new_Unsupported',parameter('Value','Edm.Stream')),
  func('OnlyFilter'),
].join(''),['new_Run','new_Secret','new_Entity','new_Exact','new_Unsupported'].map(ai).join('')+
  ['new_Search','WhoAmI','new_Ref','new_Complex','new_Enums','new_Overload','new_Optional'].map(fi).join(''));
export function fixture(options={}) {
  const calls=[];
  const client={async requestWithResponse(endpoint,method='GET',data,requestOptions={}){
    const call={endpoint,method,data,options:requestOptions};calls.push(call);
    if(endpoint==='/$metadata'){
      if(options.metadataError)throw options.metadataError;
      return {status:200,data:options.metadata ?? csdl,headers:{}};
    }
    if(options.error)throw options.error;
    return {status:options.status ?? 200,data:options.result === undefined?{Result:'ok'}:options.result,headers:{}};
  },async makeRequest(...args){return (await client.requestWithResponse(...args)).data;}};
  return {calls,client,service:new ApiOperationService(client,env)};
}
export const invoked=f=>f.calls.filter(c=>c.endpoint!=='/$metadata');
