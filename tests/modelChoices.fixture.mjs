import { CrmRequestError } from '../src/errors.ts';
import { ModelMetadataService } from '../src/services/modelMetadata.ts';
import { ModelChoiceService } from '../src/services/modelChoices.ts';
export const id = '11111111-1111-1111-1111-111111111111';
export const fieldId = '22222222-2222-2222-2222-222222222222';
export const env = {orgUrl:'https://crm.invalid/Demo',authType:'online',apiVersion:'v9.1'};
export const text = value => [{language_code:1033,text:value}];
export const nativeLabel = value => ({LocalizedLabels:[{LanguageCode:1033,Label:value},{LanguageCode:2052,Label:'中文'}]});
export const choices = {MetadataId:id,Name:'new_colors',IsGlobal:true,IsManaged:false,IsCustomizable:{Value:true},OptionSetType:'Picklist',
  DisplayName:nativeLabel('Colors'),Options:[{Value:100,Label:nativeLabel('Red')},{Value:200,Label:nativeLabel('Blue')}]};
export const createArgs = {schema_name:'new_colors',display_name:text('Colors'),options:[{label:text('Red')},{value:200,label:text('Blue')}],solution_unique_name:'TestSolution'};
export const changeArgs = {global_choice_name:'new_colors',operation:'update',value:100,label:text('Crimson'),solution_unique_name:'TestSolution'};
export const columnArgs = {logical_name:'new_sample',schema_name:'new_Choice',display_name:text('Choice'),type:'Picklist',options:[{value:100,label:text('Red')},{value:200,label:text('Blue')}],solution_unique_name:'TestSolution'};

export function fixture(options = {}) {
  const calls = []; let exists = !options.missing,allocated = 500,global = structuredClone({...choices,...options.global});
  const local = structuredClone({...choices,MetadataId:fieldId,IsGlobal:false,Name:'new_sample_new_choice',...options.local});
  let field = {MetadataId:fieldId,LogicalName:'new_choice',SchemaName:'new_Choice',AttributeType:'Picklist',AttributeTypeName:{Value:'PicklistType'},
    IsCustomizable:{Value:true},IsManaged:false,DisplayName:nativeLabel('Choice'),RequiredLevel:{Value:'None'},
    OptionSet:options.shared ? global : local,...options.field};
  const merge = (before,after) => ({...before,...after,LocalizedLabels:[...(after?.LocalizedLabels ?? []),...(before?.LocalizedLabels ?? [])]
    .filter((row,index,list) => list.findIndex(item => item.LanguageCode === row.LanguageCode) === index)});
  const allocate = entries => entries.map(row => ({...structuredClone(row),Value:row.Value === null ? allocated++ : row.Value}));
  const client = {
    async requestWithResponse(endpoint,method = 'GET',body,requestOptions = {}) {
      const call = {endpoint,method,body,options:requestOptions}; calls.push(call);
      if (requestOptions.signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','cancelled',{outcome:'not_sent'});
      const custom = await options.request?.({...call,calls}); if (custom !== undefined) return custom;
      const result = (data,status = 200) => ({data:structuredClone(data),status,headers:{}});
      if (method !== 'GET') {
        if (endpoint === '/GlobalOptionSetDefinitions') { exists = true; global = {...global,...structuredClone(body),Options:allocate(body.Options)}; }
        else if (endpoint.endsWith('/Attributes')) {
          field = {...field,...structuredClone(body),LogicalName:body.SchemaName.toLowerCase()};
          if (body['GlobalOptionSet@odata.bind']) field.OptionSet = structuredClone(global);
          else if (body.OptionSet) {
            field.OptionSet = {...local,...structuredClone(body.OptionSet),IsGlobal:false};
            if (body.OptionSet.Options) field.OptionSet.Options = allocate(body.OptionSet.Options);
            if (body.AttributeType === 'Boolean') delete field.OptionSet.Options;
          }
        } else if (endpoint === '/InsertOptionValue' || endpoint === '/UpdateOptionValue') {
          const target = body.OptionSetName ? global : field.OptionSet;
          const entries = target.OptionSetType === 'Boolean' ? [target.FalseOption,target.TrueOption] : target.Options;
          const value = body.Value ?? allocated++;
          if (endpoint === '/InsertOptionValue') {
            entries.push({Value:value,Label:structuredClone(body.Label),...(body.Description ? {Description:structuredClone(body.Description)} : {})});
            return result({NewOptionValue:value});
          }
          const option = entries.find(option => option.Value === value); if (!option) throw new Error('Missing fixture option');
          if (body.Label) option.Label = body.MergeLabels ? merge(option.Label,body.Label) : structuredClone(body.Label);
          if (body.Description) option.Description = body.MergeLabels ? merge(option.Description,body.Description) : structuredClone(body.Description);
        } else if (method === 'PUT' && endpoint.includes('/Attributes(')) {
          for (const key of ['DisplayName','Description']) if (body[key]) field[key] = merge(field[key],body[key]);
        } else if (endpoint !== '/PublishXml') throw new Error('Unexpected write ' + endpoint);
        return result(null,204);
      }
      if (endpoint.startsWith('/solutions?')) return result({value:[{solutionid:id,uniquename:'TestSolution',ismanaged:false,
        publisherid:{publisherid:id,customizationprefix:'new'},...options.solution}]});
      if (endpoint.startsWith('/GlobalOptionSetDefinitions(')) {
        if (!exists) throw new CrmRequestError('D365_HTTP_ERROR','not found',{status:404,outcome:'rejected'});
        return result({...global,...options.readGlobal});
      }
      if (endpoint.includes('/Attributes?')) return result({value:options.columnExists ? [{LogicalName:'new_choice',MetadataId:fieldId}] : []});
      if (endpoint.includes('/Attributes(')) return result({...field,...options.readField});
      if (endpoint.startsWith('/EntityDefinitions(')) return result({MetadataId:id,LogicalName:'new_sample',IsCustomizable:{Value:true},CanCreateAttributes:{Value:true},...options.table});
      throw new Error('Unexpected read ' + endpoint);
    },
    async makeRequest(...args) { return (await client.requestWithResponse(...args)).data; },
  };
  return {calls,client,service:new ModelChoiceService(client,env),model:new ModelMetadataService(client,env)};
}
