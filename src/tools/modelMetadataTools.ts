export const identifier = {type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_]*$',maxLength:100};
export const label = {type:'array',minItems:1,maxItems:50,items:{type:'object',additionalProperties:false,
  properties:{language_code:{type:'integer',minimum:1,maximum:65535},text:{type:'string',minLength:1,maxLength:2000}},required:['language_code','text']}};
const names = {logical_name:identifier,attribute_name:identifier};
export const labels = {display_name:label,description:label};
export const solution = {solution_unique_name:{...identifier,description:'Existing unmanaged solution; its publisher prefix is validated for new schemas.'}};
export const dry = {dry_run:{type:'boolean',description:'Default true performs reads/eligibility checks and returns a native request preview. Set false to execute.'}};
const aliasNames:Record<string,string> = {logicalName:'logical_name',attributeName:'attribute_name',schemaName:'schema_name',
  solutionUniqueName:'solution_unique_name',displayName:'display_name',displayCollectionName:'display_collection_name',
  primaryName:'primary_name',ownershipType:'ownership_type',maxLength:'max_length',minValue:'min_value',maxValue:'max_value',
  requiredLevel:'required_level',dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write',
  referencedEntity:'referenced_entity',referencingEntity:'referencing_entity',entity1:'entity_1',entity2:'entity_2',
  intersectEntityName:'intersect_entity_name',keyAttributes:'key_attributes',includeJob:'include_job',
  globalChoiceName:'global_choice_name',dateTimeBehavior:'date_time_behavior',trueLabel:'true_label',falseLabel:'false_label',defaultValue:'default_value',
  ifMatch:'if_match',nameKeyword:'name_keyword',sectionId:'section_id',templateControlId:'template_control_id',controlId:'control_id',
  libraryName:'library_name',functionName:'function_name',eventName:'event_name',passExecutionContext:'pass_execution_context'};
export function schema(properties:Record<string,any>,required:string[]) {
  const expanded = {...properties};
  for (const [alias,key] of Object.entries(aliasNames)) if (properties[key]) expanded[alias] = {...properties[key],'x-alias-for':key};
  return {type:'object',additionalProperties:false,properties:expanded,
    ...(required.length ? {allOf:required.map(key => ({anyOf:[{required:[key]},...Object.entries(aliasNames).filter(([,target]) => target === key).map(([alias]) => ({required:[alias]}))]}))} : {})};
}
const write = {readOnlyHint:false,destructiveHint:true,idempotentHint:false};
export const modelMetadataTools = [
  {name:'get_model_definition',description:'Retrieve a complete table or supported column definition and SHA-256 fingerprint using strong consistency. Supports nine basic/choice column types, including expanded choices. Publication state remains unknown; fingerprint is not a platform lock.',
    inputSchema:schema(names,['logical_name']),annotations:{readOnlyHint:true}},
  {name:'create_model_table',description:'Create an ordinary custom table with a primary text name column using native EntityDefinitions. Requires an existing unmanaged solution and matching publisher prefixes. Default preview; does not place fields on forms or request publication.',
    inputSchema:schema({schema_name:identifier,...labels,...solution,...dry,display_collection_name:label,
      ownership_type:{type:'string',enum:['UserOwned','OrganizationOwned']},
      primary_name:schema({schema_name:identifier,...labels,max_length:{type:'integer',minimum:1,maximum:4000}},['schema_name','display_name'])},
      ['schema_name','display_name','display_collection_name','primary_name','solution_unique_name']),annotations:write},
  {name:'create_model_column',description:'Create native String, Memo, Integer, Decimal, Money, DateTime, Boolean, Picklist or MultiSelectPicklist column. Choice columns use local options or a validated global choice binding. Checks parent managed properties, publisher prefix and duplicate logical name. Default preview; save and publication remain separate.',
    inputSchema:schema({logical_name:identifier,schema_name:identifier,...labels,...solution,...dry,
      type:{type:'string',enum:['String','Memo','Integer','Decimal','Money','DateTime','Boolean','Picklist','MultiSelectPicklist']},max_length:{type:'integer',minimum:1,maximum:1048576},
      min_value:{type:'number'},max_value:{type:'number'},precision:{type:'integer',minimum:0,maximum:10},
      required_level:{type:'string',enum:['None','Recommended','ApplicationRequired']},
      format:{type:'string',enum:['DateOnly','DateAndTime']},date_time_behavior:{type:'string',enum:['UserLocal','DateOnly','TimeZoneIndependent']},
      true_label:label,false_label:label,default_value:{type:['boolean','integer'],minimum:0,maximum:2147483647},global_choice_name:identifier,
      options:{type:'array',minItems:1,maxItems:1000,items:{type:'object',additionalProperties:false,properties:{value:{type:'integer',minimum:0,maximum:2147483647},label,description:label},required:['label']}}},
      ['logical_name','schema_name','display_name','solution_unique_name','type']),annotations:write},
  {name:'update_model_labels',description:'Update table/column labels by native full-definition PUT with MSCRM.MergeLabels=true. Preserves other retrieved properties, including choice definitions. Does not update option values: use change_model_choice_value. Execution requires current expected_hash and allow_unprotected_write=true; a concurrency race remains. Default preview.',
    inputSchema:schema({...names,...labels,...solution,...dry,display_collection_name:label,
      expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},allow_unprotected_write:{type:'boolean'}},['logical_name','solution_unique_name']),annotations:write},
  {name:'publish_model_table',description:'PublishXml for one entire table, including OTHER pending fields, forms, views and ribbon customizations. Default preview exposes scope; publication is separate from save. No automatic save replay on publication failure.',
    inputSchema:schema({logical_name:identifier,...dry},['logical_name']),annotations:write},
];
