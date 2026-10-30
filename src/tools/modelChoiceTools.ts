import { dry,identifier,label,labels,schema,solution } from './modelMetadataTools.js';
const target = {global_choice_name:identifier,logical_name:identifier,attribute_name:identifier};
const targeting = {oneOf:[{allOf:schema({},['global_choice_name']).allOf,not:{anyOf:['logical_name','logicalName','attribute_name','attributeName'].map(key => ({required:[key]}))}},
  {allOf:schema({},['logical_name','attribute_name']).allOf,not:{anyOf:[{required:['global_choice_name']},{required:['globalChoiceName']}]}}]};
const options = {type:'array',minItems:1,maxItems:1000,items:{type:'object',additionalProperties:false,
  properties:{value:{type:'integer',minimum:0,maximum:2147483647},label,description:label},required:['label']}};
const write = {readOnlyHint:false,destructiveHint:true,idempotentHint:false};
export const modelChoiceTools = [
  {name:'get_model_choices',description:'Read bounded native global or local Boolean/Picklist/MultiSelectPicklist options with multilingual labels and a fingerprint. Explicit global_choice_name OR a table/column pair. Reports shared global references without silently retargeting a later write.',
    inputSchema:{...schema(target,[]),...targeting},annotations:{readOnlyHint:true}},
  {name:'create_model_choices',description:'Create a global Picklist choice with an existing unmanaged solution and publisher prefix. Default preview. Omit option value to request native publisher-based allocation; supplied numeric values and label sets must be unique. Verifies saved labels and allocated values; no automatic publication.',
    inputSchema:schema({schema_name:identifier,...labels,...solution,...dry,options},['schema_name','display_name','solution_unique_name','options']),annotations:write},
  {name:'change_model_choice_value',description:'Insert a numeric choice option or update existing option labels/description through native InsertOptionValue/UpdateOptionValue (MergeLabels=true). Unmanaged choices only. Explicitly address a global choice to change shared values. Default preview; execution needs current expected_hash and allow_unprotected_write=true. No delete, renumber, state/status mutation or automatic publish.',
    inputSchema:{...schema({...target,...solution,...dry,operation:{type:'string',enum:['insert','update']},value:{type:'integer',minimum:0,maximum:2147483647},label,description:label,
      expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},allow_unprotected_write:{type:'boolean'}},['operation','solution_unique_name']),...targeting},annotations:write},
  {name:'publish_model_choices',description:'Publish one entire shared global choice by native PublishXml; includes other pending changes to this global choice. Default preview. Local choices use the separate whole-table publish_model_table tool. Publication never replays a save and does not verify UI behavior.',
    inputSchema:schema({global_choice_name:identifier,...dry},['global_choice_name']),annotations:write},
];
