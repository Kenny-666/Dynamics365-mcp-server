import { dry,identifier,label,labels,schema,solution } from './modelMetadataTools.js';

const write = {readOnlyHint:false,destructiveHint:true,idempotentHint:false};
export const modelStructureTools = [
  {name:'get_model_relationship',description:'Read a native relationship definition by schema name, cast to 1:N or N:N metadata. Does not infer publication or UI placement.',
    inputSchema:schema({schema_name:identifier},['schema_name']),annotations:{readOnlyHint:true}},
  {name:'create_model_relationship',description:'Create native 1:N (with a new Lookup) or N:N relationship. Default preview runs metadata reads and read-only POST eligibility checks, then exposes cascade rules and native create body. Checks publisher, managed properties and duplicate names. No implicit publish, form editing or update of existing relationships.',
    inputSchema:{...schema({type:{type:'string',enum:['one_to_many','many_to_many']},schema_name:identifier,...solution,...dry,
      referenced_entity:identifier,referencing_entity:identifier,
      lookup:schema({schema_name:identifier,...labels,required_level:{type:'string',enum:['None','Recommended','ApplicationRequired']}},['schema_name','display_name']),
      cascade:{type:'object',additionalProperties:false,properties:Object.fromEntries(['assign','delete','merge','reparent','share','unshare'].map(key => [key,
        {type:'string',enum:key === 'delete' ? ['Restrict','RemoveLink','Cascade'] : ['NoCascade','Cascade']}]))},
      entity_1:identifier,entity_2:identifier,intersect_entity_name:identifier},['type','schema_name','solution_unique_name']),
      oneOf:[{properties:{type:{const:'one_to_many'}},allOf:schema({},['referenced_entity','referencing_entity','lookup']).allOf},
        {properties:{type:{const:'many_to_many'}},allOf:schema({},['entity_1','entity_2']).allOf}]},annotations:write},
  {name:'get_model_key',description:'Read one native alternate-key definition and Pending/InProgress/Active/Failed index state. Optional linked job projection excludes free-text messages/data. A saved key is usable for alternate-key operations only after its native index is Active; no automatic reactivation.',
    inputSchema:schema({logical_name:identifier,schema_name:identifier,include_job:{type:'boolean'}},['logical_name','schema_name']),annotations:{readOnlyHint:true}},
  {name:'create_model_key',description:'Create a native alternate-key definition on 1–16 columns with solution/publisher, type, field-security and duplicate checks. Default preview; server validates index size and existing uniqueness asynchronously. Pending/unknown is not Active. No record scan, index reactivation, save replay or implicit publication.',
    inputSchema:schema({logical_name:identifier,schema_name:identifier,key_attributes:{type:'array',minItems:1,maxItems:16,uniqueItems:true,items:identifier},
      display_name:label,...solution,...dry},['logical_name','schema_name','key_attributes','display_name','solution_unique_name']),annotations:write},
];
