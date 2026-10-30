const identifier = {type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_.-]{0,239}$'};
const label = {type:'array',minItems:1,maxItems:32,items:{type:'object',additionalProperties:false,required:['language_code','text'],properties:{language_code:{type:'integer',minimum:1,maximum:65535},text:{type:'string',minLength:1,maxLength:512}}}};
const parameter = {type:'object',additionalProperties:false,required:['type','value'],properties:{type:{enum:['crm','string','bool','int']},value:{type:['string','number','boolean']}}};
const common = {logical_name:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,99}$'}};
const input = {file_path:{type:'string',minLength:1,maxLength:4096,description:'Absolute local solution ZIP path; no network/device paths.'},content_base64:{type:'string',minLength:1,maxLength:44739244,description:'Canonical base64 ZIP <=32 MiB. Supply exactly one input source.'}};
function schema(properties:Record<string,any>,required:string[] = [],source = false) {
  const aliases:Record<string,string> = {filePath:'file_path',contentBase64:'content_base64',logicalName:'logical_name',outputPath:'output_path',dryRun:'dry_run',expectedHash:'expected_hash',includeXml:'include_xml',locationFilter:'location_filter'};
  const expanded = {...properties};for (const [alias,key] of Object.entries(aliases)) if (properties[key]) expanded[alias] = {...properties[key],'x-alias-for':key};
  const present = (key:string) => ({anyOf:[{required:[key]},...Object.entries(aliases).filter(([,value]) => value === key).map(([key]) => ({required:[key]}))]});
  const allOf:any[] = required.map(present);if (source) allOf.push({oneOf:[{allOf:[present('file_path'),{not:present('content_base64')}]},{allOf:[present('content_base64'),{not:present('file_path')}]}]});
  return {type:'object',additionalProperties:false,properties:expanded,...(allOf.length ? {allOf} : {})};
}
const change = {oneOf:[
  {type:'object',additionalProperties:false,required:['operation','button_id','command_id','custom_action_id','location','labels','library','function_name','image_16','image_32'],properties:{operation:{const:'add_button'},button_id:identifier,command_id:identifier,custom_action_id:identifier,location:identifier,
    sequence:{type:'integer',minimum:1,maximum:2147483647},labels:label,library:{type:'string',maxLength:250},function_name:{type:'string',maxLength:256},parameters:{type:'array',maxItems:16,items:parameter},image_16:{type:'string',maxLength:250},image_32:{type:'string',maxLength:250}}},
  {type:'object',additionalProperties:false,required:['operation','button_id'],anyOf:[{required:['labels']},{required:['sequence']}],properties:{operation:{const:'update_button'},button_id:identifier,labels:label,sequence:{type:'integer',minimum:1,maximum:2147483647}}},
  {type:'object',additionalProperties:false,required:['operation','button_id','visible'],properties:{operation:{const:'set_visibility'},button_id:identifier,visible:{type:'boolean'}}},
]};
export const ribbonChangeSchema = change;
export const ribbonTools = [
  {name:'get_ribbon_definition',description:'Read native effective classic entity Ribbon through current CSDL-validated RetrieveEntityRibbon, with typed enum/alias encoding. Validate/decompress the bounded ZIP RibbonXml.xml part without extraction/execution. Summarize buttons, commands, rule references and candidate insertion locations; full XML is opt-in. Does not evaluate user visibility/security, execute JavaScript, edit merged definitions or support modern commanding.',
    inputSchema:schema({...common,location_filter:{enum:['All','Form','HomepageGrid','SubGrid']},include_xml:{type:'boolean'},top:{type:'integer',minimum:1,maximum:500}},['logical_name']),annotations:{readOnlyHint:true}},
  {name:'inspect_ribbon_solution',description:'Inspect one entity classic RibbonDiffXml from a local solution ZIP without CRM configuration. Returns package identity and bounded button/command summaries, optional selected diff XML. Native merged definitions and solution diffs are different representations; a package is not target/runtime evidence.',
    inputSchema:schema({...input,...common,include_xml:{type:'boolean'},top:{type:'integer',minimum:1,maximum:500}},['logical_name'],true),annotations:{readOnlyHint:true}},
  {name:'edit_ribbon_solution',description:'Preview by default; edit only one entity classic RibbonDiffXml in an ordinary unmanaged local ZIP. Add standalone custom JS buttons with publisher-scoped IDs, explicit current-table insertion location, ordered parameters, multilingual labels and packaged JS/raster icons; update labels/sequence; hide/unhide via a dedicated contradictory client display rule on an unshared custom command. Preserve other languages/rules/handlers, all other archive payloads and outside-Ribbon XML semantics. Execute with current planHash to write an exclusive NEW ZIP; never overwrite input, import, publish or run code. Built-in replacements, arbitrary rules, handler updates, modern commands and deployment remain separate workflows.',
    inputSchema:schema({...input,...common,changes:{type:'array',minItems:1,maxItems:20,items:change},output_path:{type:'string',maxLength:4096,description:'Absolute new .zip destination, required for preview and execution.'},dry_run:{type:'boolean',description:'Default true; preview writes no file.'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}},['logical_name','changes','output_path'],true),
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
];
