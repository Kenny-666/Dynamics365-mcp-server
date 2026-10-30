import { dry,identifier,label,schema,solution } from './modelMetadataTools.js';
const id = {type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const target = {id,logical_name:identifier},kind = {type:'string',enum:['form','view']};
const condition = {expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},if_match:{type:'string'},allow_unprotected_write:{type:'boolean'}};
const library = {type:'string',maxLength:250,description:'Exact native JavaScript Web Resource name, e.g. new_/project.js. No URL or local path.'};
const width = {type:'integer',minimum:25,maximum:2000};
const formOperations = {type:'array',minItems:1,maxItems:50,items:{oneOf:[
  schema({action:{const:'add_field'},attribute_name:identifier,section_id:id,template_control_id:identifier,control_id:identifier,label},['action','attribute_name','section_id','template_control_id','label']),
  schema({action:{const:'add_library'},library_name:library},['action','library_name']),
  schema({action:{const:'bind_event'},event_name:{type:'string',enum:['onload','onsave','onchange']},attribute_name:identifier,library_name:library,
    function_name:{type:'string',maxLength:200},pass_execution_context:{type:'boolean'}},['action','event_name','library_name','function_name'])]}};
const viewOperations = {type:'array',minItems:1,maxItems:50,items:{oneOf:[
  schema({action:{const:'add_column'},attribute_name:identifier,width},['action','attribute_name']),
  schema({action:{const:'remove_column'},attribute_name:identifier},['action','attribute_name']),
  schema({action:{const:'set_width'},attribute_name:identifier,width},['action','attribute_name','width']),
  schema({action:{const:'set_order'},order:{type:'array',minItems:1,maxItems:10,items:schema({attribute_name:identifier,descending:{type:'boolean'}},['attribute_name'])}},['action','order'])]}};
const write = {readOnlyHint:false,destructiveHint:true,idempotentHint:false};
export const modelUiTools = [
  {name:'list_model_ui_components',description:'List bounded native saved/unpublished system forms or views for one table. Returns IDs and types, with explicit list limits; no XML or automatic published-version fallback.',
    inputSchema:schema({kind,logical_name:identifier,top:{type:'integer',minimum:1,maximum:100},name_keyword:{type:'string',maxLength:100}},['kind','logical_name']),annotations:{readOnlyHint:true}},
  {name:'get_model_ui_component',description:'Read a native unpublished system form/view definition, structural inventory, SHA-256 preview fingerprint and native ETag when available. Publication state is not inferred.',
    inputSchema:schema({...target,kind},['id','logical_name','kind']),annotations:{readOnlyHint:true}},
  {name:'edit_model_form',description:'Structurally edit a Main form: append a scalar field using an explicit compatible existing control template, add a verified JavaScript library, or bind onload/onsave/onchange. No arbitrary XML, PCF/Lookup template copying or code execution. Default preview. Execute with current expected_hash; native ETag support is checked, otherwise explicit allow_unprotected_write is required. No automatic publication.',
    inputSchema:schema({...target,...solution,...dry,...condition,operations:formOperations},['id','logical_name','solution_unique_name','operations']),annotations:write},
  {name:'edit_model_view',description:'Structurally edit a public system view: add/remove root display columns, set widths or replace simple root-field ordering. Preserves filters, joins and FetchXML attributes needed by other dependencies. Rejects aggregate/distinct query rewrites. Default preview, fingerprint and metadata-gated ETag/fallback checks, saved readback, no automatic publish.',
    inputSchema:schema({...target,...solution,...dry,...condition,operations:viewOperations},['id','logical_name','solution_unique_name','operations']),annotations:write},
];
