import {identifier,label,solution,dry} from './modelMetadataTools.js';
const aliases:Record<string,string> = {logicalName:'logical_name',attributeName:'attribute_name',schemaName:'schema_name',solutionUniqueName:'solution_unique_name',
  dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write',maxLength:'max_length',minValue:'min_value',maxValue:'max_value',
  requiredLevel:'required_level',defaultValue:'default_value',isAuditEnabled:'is_audit_enabled',isValidForAdvancedFind:'is_valid_for_advanced_find',entity1Menu:'entity_1_menu',entity2Menu:'entity_2_menu'};
function schema(properties:Record<string,any>,required:string[] = []) {
  const expanded = {...properties};
  for (const [alias,key] of Object.entries(aliases)) if (properties[key]) expanded[alias] = {...properties[key],'x-alias-for':key};
  return {type:'object',additionalProperties:false,properties:expanded,...(required.length ? {allOf:required.map(key => ({anyOf:[{required:[key]},
    ...Object.entries(aliases).filter(([,value]) => value === key).map(([key]) => ({required:[key]}))]}))} : {})};
}
const review = {...solution,...dry,expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Current preview planHash (binds target, patch and environment), required for execution.'},
  allow_unprotected_write:{type:'boolean',description:'Explicitly permit the native PUT/Action without atomic concurrency protection. A preview fingerprint is still required.'}};
const menu = schema({behavior:{enum:['UseCollectionName','UseLabel','DoNotDisplay']},group:{enum:['Details','Sales','Service','Marketing']},
  order:{type:'integer',minimum:0,maximum:2147483647},label});
const cascade = schema({assign:{enum:['NoCascade','Cascade']},delete:{enum:['Restrict','RemoveLink','Cascade']},merge:{enum:['NoCascade','Cascade']},
  reparent:{enum:['NoCascade','Cascade']},share:{enum:['NoCascade','Cascade']},unshare:{enum:['NoCascade','Cascade']}});
const write = {readOnlyHint:false,destructiveHint:true,idempotentHint:false};
export const modelMaintenanceTools = [
  {name:'update_model_column_settings',description:'Default preview of existing ordinary unmanaged custom column settings; nine supported base types. Allows length/range/precision expansion, requirement level, auditing/search managed values, Boolean/existing Picklist defaults and DateTime display format. Preserves full definition, labels, choices and date behavior. Rejects narrowing, primary/derived/calculated/rollup/autonumber columns and type/schema changes. Execute with preview planHash as expected_hash plus allow_unprotected_write=true; full native PUT then readback, no automatic publication.',
    inputSchema:schema({logical_name:identifier,attribute_name:identifier,...review,patch:schema({max_length:{type:'integer',minimum:1,maximum:1048576},
      min_value:{type:'number'},max_value:{type:'number'},precision:{type:'integer',minimum:0,maximum:10},required_level:{enum:['None','Recommended','ApplicationRequired']},
      default_value:{type:['boolean','integer'],minimum:0,maximum:2147483647},format:{enum:['DateOnly','DateAndTime']},
      is_audit_enabled:{type:'boolean'},is_valid_for_advanced_find:{type:'boolean'}})},['logical_name','attribute_name','solution_unique_name','patch']),annotations:write},
  {name:'update_model_relationship',description:'Preview/update an existing unmanaged custom 1:N menu/cascade or N:N per-side menus by full native PUT with language merging. Preserves table/column/intersect identity and omitted settings. Menu must be confirmed customizable. Cascade changes can affect future related-record deletion, ownership and access; native cross-relationship rules remain platform-validated. Requires planHash and explicit unprotected write; saves and reads back separately from publication.',
    inputSchema:schema({schema_name:identifier,...review,patch:schema({menu,entity_1_menu:menu,entity_2_menu:menu,cascade})},['schema_name','solution_unique_name','patch']),annotations:write},
  {name:'reactivate_model_key',description:'Preview/submit the native ReactivateEntityKey Action only for an existing unmanaged Failed key index after its cause has been corrected. Uses actual key LogicalName, preserves key columns and never recreates/deletes the key. Requires planHash and explicit unprotected Action. Acceptance is separate from a new job link and Active state; performs one metadata readback, never polls/replays the submission. Inspect later with get_model_key.',
    inputSchema:schema({logical_name:identifier,schema_name:identifier,...review},['logical_name','schema_name','solution_unique_name']),annotations:write},
];
