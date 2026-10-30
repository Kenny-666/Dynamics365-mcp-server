import { CrmRequestError } from '../src/errors.ts';
import { ModelUiService } from '../src/services/modelUi.ts';
import { ModelMetadataService } from '../src/services/modelMetadata.ts';
export const ids = {form:'11111111-1111-1111-1111-111111111111',view:'22222222-2222-2222-2222-222222222222',
  section:'33333333-3333-3333-3333-333333333333',table:'44444444-4444-4444-4444-444444444444',resource:'55555555-5555-5555-5555-555555555555',control:'66666666-6666-6666-6666-666666666666'};
export const env = {orgUrl:'https://crm.invalid/Demo',authType:'online',apiVersion:'v9.1'};
export const formXml = `<form><tabs><tab name="general" id="{77777777-7777-7777-7777-777777777777}"><columns><column width="100%"><sections>
<section id="{${ids.section}}" name="general" columns="11"><labels><label description="General" languagecode="1033"/></labels><rows><row><cell id="{88888888-8888-8888-8888-888888888888}"><labels><label description="Name" languagecode="1033"/></labels><control id="new_name" classid="{4273EDBD-AC1D-40D3-9FB2-095C621B552D}" uniqueid="{${ids.control}}" datafieldname="new_name" disabled="false"/></cell></row></rows></section>
</sections></column></columns></tab></tabs><Navigation><NavBar/></Navigation></form>`;
export const fetchXml = `<fetch version="1.0" mapping="logical"><entity name="new_sample"><attribute name="new_name"/><attribute name="new_old"/><attribute name="new_sampleid"/>
<filter type="and"><condition attribute="statecode" operator="eq" value="0"/><condition attribute="new_name" operator="like" value="%statecode &amp; test%"/></filter>
<link-entity name="contact" from="contactid" to="new_contactid" alias="contact"><attribute name="emailaddress1"/><filter><condition attribute="statecode" operator="eq" value="1"/></filter></link-entity>
<order attribute="new_name" descending="false"/></entity></fetch>`;
export const layoutXml = '<grid name="resultset" object="10001" jump="new_name" select="1" icon="1"><row name="result" id="new_sampleid"><cell name="new_name" width="150"/><cell name="new_old" width="100"/><cell name="contact.emailaddress1" width="200" disableSorting="1"/></row></grid>';
export const addField = {action:'add_field',attribute_name:'new_reference',section_id:ids.section,template_control_id:'new_name',label:[{language_code:1033,text:'Reference'}]};
export const formArgs = {id:ids.form,logical_name:'new_sample',solution_unique_name:'TestSolution',operations:[addField]};
export const viewArgs = {id:ids.view,logical_name:'new_sample',solution_unique_name:'TestSolution',operations:[{action:'add_column',attribute_name:'new_reference',width:180}]};
export function fixture(options = {}) {
  const calls = []; let version = 5;
  const form = {formid:ids.form,name:'Main form',objecttypecode:'new_sample',type:2,iscustomizable:{Value:true},ismanaged:false,componentstate:1,formxml:options.formXml ?? formXml,...options.form};
  const view = {savedqueryid:ids.view,name:'Public view',returnedtypecode:'new_sample',querytype:0,iscustomizable:{Value:true},ismanaged:false,componentstate:1,
    fetchxml:options.fetchXml ?? fetchXml,layoutxml:options.layoutXml ?? layoutXml,...options.view};
  const fields = new Map();
  for (const field of ['new_name','new_reference','new_old','new_sampleid','statecode']) {
    if (field === 'new_reference' && options.newFieldMissing) continue;
    fields.set(field,{MetadataId:ids.resource,LogicalName:field,SchemaName:field,AttributeType:'String',AttributeTypeName:{Value:'StringType'},
      DisplayName:{LocalizedLabels:[{LanguageCode:1033,Label:'Reference'}]},RequiredLevel:{Value:'None'},FormatName:{Value:'Text'},MaxLength:100,
      IsCustomizable:{Value:true},IsValidForForm:true,IsValidForRead:true,...options.field,...(options.fields?.[field] ?? {})});
  }
  const client = {
    async requestWithResponse(endpoint,method = 'GET',body,requestOptions = {}) {
      const call = {endpoint,method,body,options:requestOptions}; calls.push(call);
      if (requestOptions.signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled',{outcome:'not_sent'});
      const custom = await options.request?.({...call,calls}); if (custom !== undefined) return custom;
      const result = (data,status = 200,headers = {}) => ({data:structuredClone(data),status,headers});
      if (method === 'PATCH') {
        if (requestOptions.headers['If-Match'] !== '*' && requestOptions.headers['If-Match'] !== `W/"${version}"`) throw new CrmRequestError('D365_HTTP_ERROR','conflict',{status:412,outcome:'rejected'});
        Object.assign(endpoint.startsWith('/systemforms') ? form : view,structuredClone(body)); version++; return result(null,204);
      }
      if (method === 'POST' && endpoint.endsWith('/Attributes')) {
        fields.set(body.SchemaName.toLowerCase(),{MetadataId:ids.resource,...structuredClone(body),LogicalName:body.SchemaName.toLowerCase(),IsValidForForm:true,IsValidForRead:true,IsCustomizable:{Value:true}});
        return result(null,204);
      }
      if (method === 'POST' && endpoint === '/PublishXml') return result(null,204);
      if (method !== 'GET') throw new Error('Unexpected mutation ' + endpoint);
      if (endpoint.startsWith('/solutions?')) return result({value:[{solutionid:ids.table,uniquename:'TestSolution',ismanaged:false,publisherid:{publisherid:ids.table,customizationprefix:'new'},...options.solution}]});
      if (endpoint.includes('/Attributes?')) {
        const query = new URL(endpoint,'https://crm.invalid').searchParams.get('$filter'),field = /LogicalName eq '([^']+)'/.exec(query)[1];
        return result({value:fields.has(field) ? [fields.get(field)] : []});
      }
      if (endpoint.includes('/Attributes(')) {
        const field = /Attributes\(LogicalName='([^']+)'\)/.exec(endpoint)[1];
        if (!fields.has(field)) throw new CrmRequestError('D365_HTTP_ERROR','missing',{status:404,outcome:'rejected'});
        return result(fields.get(field));
      }
      if (endpoint.startsWith('/EntityDefinitions(')) {
        const table = /LogicalName='([^']+)'/.exec(endpoint)[1];
        return result({MetadataId:ids.table,LogicalName:table,PrimaryIdAttribute:'new_sampleid',ObjectTypeCode:10001,
          IsCustomizable:{Value:true},CanCreateAttributes:{Value:true},IsOptimisticConcurrencyEnabled:options.concurrency ?? true,...options.table});
      }
      if (endpoint.startsWith('/webresourceset/')) return result({value:[{webresourceid:ids.resource,name:'new_/form.js',webresourcetype:3,...options.resource}]});
      if (!endpoint.includes('RetrieveUnpublished')) throw new Error('A published UI read is forbidden in this fixture');
      const native = endpoint.startsWith('/systemforms') ? form : view;
      if (endpoint.includes('RetrieveUnpublishedMultiple')) return result({value:options.listRows ?? [native],...(options.more ? {'@odata.nextLink':'https://crm.invalid/Demo/api/data/v9.1/more'} : {})});
      return result({...native,...(options.noEtag ? {} : {'@odata.etag':`W/"${version}"`})});
    },
    async makeRequest(...args) { return (await client.requestWithResponse(...args)).data; },
  };
  return {client,calls,form,view,fields,service:new ModelUiService(client,env),model:new ModelMetadataService(client,env)};
}
