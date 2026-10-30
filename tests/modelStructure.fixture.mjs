import { CrmRequestError } from '../src/errors.ts';
import { ModelStructureService } from '../src/services/modelStructure.ts';

export const id = '11111111-1111-1111-1111-111111111111';
export const jobId = '22222222-2222-2222-2222-222222222222';
export const env = {orgUrl:'https://crm.invalid/Demo',authType:'online',apiVersion:'v9.1'};
export const text = value => [{language_code:1033,text:value}];
export const nativeLabel = value => ({LocalizedLabels:[{LanguageCode:1033,Label:value}]});
export const one = {type:'one_to_many',schema_name:'new_account_sample',referenced_entity:'account',referencing_entity:'new_sample',
  lookup:{schema_name:'new_AccountId',display_name:text('Account')},solution_unique_name:'TestSolution'};
export const many = {type:'many_to_many',schema_name:'new_account_contact',entity_1:'account',entity_2:'contact',solution_unique_name:'TestSolution'};
export const key = {logical_name:'new_sample',schema_name:'new_ReferenceKey',key_attributes:['new_reference'],display_name:text('Reference key'),solution_unique_name:'TestSolution'};
export const nativeKey = {MetadataId:id,SchemaName:'new_ReferenceKey',LogicalName:'new_referencekey',EntityLogicalName:'new_sample',
  DisplayName:nativeLabel('Reference key'),KeyAttributes:['new_reference'],IsCustomizable:{Value:true},IsManaged:false,
  EntityKeyIndexStatus:'Active',AsyncJob:jobId};
export const nativeRelation = {MetadataId:id,SchemaName:'new_account_sample',RelationshipType:'OneToManyRelationship',
  ReferencedEntity:'account',ReferencedAttribute:'accountid',ReferencingEntity:'new_sample',ReferencingAttribute:'new_accountid',
  CascadeConfiguration:{Assign:'NoCascade',Delete:'Restrict',Merge:'NoCascade',Reparent:'NoCascade',Share:'NoCascade',Unshare:'NoCascade'},
  AssociatedMenuConfiguration:{Behavior:'UseCollectionName',Group:'Details',Order:10000}};
export const isMutation = call => call.method !== 'GET' && !['/CanBeReferenced','/CanBeReferencing','/CanManyToMany'].includes(call.endpoint);

export function fixture(options = {}) {
  const calls = []; let relationship = options.existingRelation ? structuredClone(nativeRelation) : null;
  let keys = structuredClone(options.keys ?? []),lookup = null;
  const client = {
    async requestWithResponse(endpoint,method = 'GET',body,requestOptions = {}) {
      calls.push({endpoint,method,body,options:requestOptions});
      if (requestOptions.signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled',{outcome:'not_sent'});
      const custom = await options.request?.({endpoint,method,body,options:requestOptions,calls});
      if (custom !== undefined) return custom;
      const success = data => ({data:structuredClone(data),status:200,headers:{}});
      if (['/CanBeReferenced','/CanBeReferencing','/CanManyToMany'].includes(endpoint)) {
        if (method !== 'POST') throw new Error('Native eligibility must be POST');
        return success({[endpoint.slice(1)]:options.eligible ?? true});
      }
      if (isMutation({endpoint,method})) {
        if (method !== 'POST') throw new Error('Unexpected mutation ' + method);
        if (endpoint === '/RelationshipDefinitions') {
          relationship = {...structuredClone(body),MetadataId:id,
            RelationshipType:body.Lookup ? 'OneToManyRelationship' : 'ManyToManyRelationship',
            ...(body.Lookup ? {ReferencingAttribute:body.Lookup.SchemaName.toLowerCase()} : {})};
          if (body.Lookup) lookup = {...structuredClone(body.Lookup),LogicalName:body.Lookup.SchemaName.toLowerCase(),MetadataId:id,Targets:[body.ReferencedEntity]};
        } else if (endpoint.endsWith('/Keys')) {
          keys.push({...structuredClone(body),MetadataId:id,EntityLogicalName:'new_sample',LogicalName:body.SchemaName.toLowerCase(),
            EntityKeyIndexStatus:options.indexState ?? 'Pending',AsyncJob:jobId});
        } else throw new Error('Unexpected write ' + endpoint);
        return {data:null,status:204,headers:{'odata-entityid':env.orgUrl + '/api/data/v9.1/RelationshipDefinitions(' + id + ')'}};
      }
      if (endpoint.startsWith('/solutions?')) return success({value:[{solutionid:id,uniquename:'TestSolution',ismanaged:false,
        publisherid:{publisherid:id,customizationprefix:'new'},...options.solution}]});
      if (endpoint.startsWith('/RelationshipDefinitions?')) return success({value:relationship ? [relationship] : []});
      if (endpoint.startsWith('/RelationshipDefinitions(')) return success({...relationship,...options.relationship});
      if (endpoint.endsWith('/Keys')) return success({value:keys});
      if (endpoint.startsWith('/asyncoperations(')) return success({asyncoperationid:jobId,statecode:3,statuscode:30,errorcode:0,
        createdon:'2026-10-27T01:00:00Z',completedon:'2026-10-27T01:01:00Z',message:'hidden-message',data:'hidden-data',...options.job});
      if (endpoint.includes('/Attributes?')) return success({value:options.lookupExists ? [{MetadataId:id,LogicalName:'new_accountid'}] : []});
      if (endpoint.includes('/Attributes(')) {
        const field = /Attributes\(LogicalName='([^']+)'\)/.exec(endpoint)[1];
        return success({...((field === 'new_accountid' && lookup) ? lookup : {MetadataId:id,LogicalName:field,SchemaName:field,AttributeType:'String',IsSecured:false}),
          ...(options.columns?.[field] ?? {}),...options.column});
      }
      if (endpoint.startsWith('/EntityDefinitions?')) return success({value:options.intersectExists ? [{MetadataId:id,LogicalName:'new_account_contact'}] : []});
      if (endpoint.startsWith('/EntityDefinitions(')) {
        const table = /LogicalName='([^']+)'/.exec(endpoint)[1];
        return success({MetadataId:id,LogicalName:table,PrimaryIdAttribute:table + 'id',IsCustomizable:{Value:true},
          CanBePrimaryEntityInRelationship:{Value:true},CanBeRelatedEntityInRelationship:{Value:true},CanCreateAttributes:{Value:true},
          CanBeInManyToMany:{Value:true},DataProviderId:null,...options.table,...(options.tables?.[table] ?? {})});
      }
      throw new Error('Unexpected read ' + endpoint);
    },
    async makeRequest(...args) { return (await client.requestWithResponse(...args)).data; },
  };
  return {client,calls,service:new ModelStructureService(client,env)};
}
