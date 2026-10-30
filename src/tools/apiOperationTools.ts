const id = {type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const text = {type:'string',minLength:1,maxLength:512};
function schema(properties:Record<string,any>,required:string[] = []) {
  const aliases:Record<string,string> = {actionName:'action_name',isFunction:'is_function',collectionName:'collection_name',signatureId:'signature_id',
    dryRun:'dry_run',expectedHash:'expected_hash',returnDetails:'return_details',includeParameterValues:'include_parameter_values'};
  const expanded = {...properties};
  for (const [alias,key] of Object.entries(aliases)) if (properties[key]) expanded[alias] = {...properties[key],'x-alias-for':key};
  return {type:'object',additionalProperties:false,properties:expanded,...(required.length ? {allOf:required.map(key => ({anyOf:[{required:[key]},
    ...Object.entries(aliases).filter(([,value]) => value === key).map(([key]) => ({required:[key]}))]}))} : {})};
}
const common = {action_name:{...text,description:'Exact case-sensitive native operation/import name or qualified name, never a URL/path.'},
  is_function:{type:'boolean',description:'Invocation defaults false (Action); discovery omits this to inspect both kinds.'},
  binding:schema({collection_name:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]*$',maxLength:256},id},['collection_name']),
  signature_id:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Advertised get_api_operation signature ID; required to disambiguate matching overloads.'}};
export const apiOperationTools = [
  {name:'get_api_operation',description:'Read current service CSDL to inspect Action/Function overloads, exact parameter types/facets, binding and import names. Optional entity-set binding narrows signatures. Returns direct input type definitions; nested types are not expanded. Read-only metadata does not prove permissions/runtime support.',
    inputSchema:schema(common,['action_name']),annotations:{readOnlyHint:true}},
  {name:'call_d365_api_action',description:'Invoke a current CSDL-defined Action/Function after typed validation. Preserves legacy defaults: Action POST and immediate execution, returning native data directly. Supports single-entity or collection binding, explicit overload IDs, primitive/enum/structural collections and safe Function parameter aliases. Optional dry_run previews without invocation and withholds parameter values by default. Optional expected_hash checks preview planHash; return_details=true returns receipt/data. No Action replay or generic business readback.',
    inputSchema:schema({...common,parameters:{type:'object',description:'Exact case-sensitive non-binding parameter names. Int64 and Decimal support exact strings; no navigation/deep-insert properties.'},
      dry_run:{type:'boolean',description:'Default false preserves immediate legacy invocation. True performs metadata reads/validation only.'},
      expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Optional current preview planHash; detects changed metadata/target/arguments, not concurrent record changes.'},
      return_details:{type:'boolean',description:'Default false returns native data directly; true wraps receipt, HTTP status and data.'},
      include_parameter_values:{type:'boolean',description:'Explicit preview opt-in to show plaintext normalized values and Function URL; default false.'}},['action_name']),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
];
