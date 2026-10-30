import { aliases } from '../services/pluginStepValidation.js';

type Schema = Record<string, any>;
const text: Schema = {type:'string', minLength:1};
const id: Schema = {...text, pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'};
const stage = {enum:[10,20,40,'PreValidation','PreOperation','PostOperation'], description:'10/PreValidation, 20/PreOperation, 40/PostOperation.'};
const mode = {enum:[0,1,'Synchronous','Asynchronous'], description:'0/Synchronous or 1/Asynchronous. Async requires PostOperation.'};
const deployment = {enum:[0,1,2,'ServerOnly','OfflineOnly','Both'], description:'Deployment: 0/ServerOnly, 1/OfflineOnly, 2/Both; availability depends on the target platform.'};
const bool = {type:'boolean'};
function fields(properties: Schema): Schema {
  const result = {...properties};
  for (const [camel, snake] of Object.entries(aliases)) if (properties[snake]) {
    result[camel] = {...properties[snake], 'x-alias-for':snake,
      description:'Compatibility alias for ' + snake + '. Conflicting aliases are rejected.'};
  }
  return result;
}
const discovery = {
  plugin_type_name:{...text, description:'Exact plugin class name, such as Company.Plugins.AccountUpdate.'},
  assembly_name:{...text, description:'Exact assembly name to disambiguate a plugin class.'},
  message:{...text, description:'Exact SDK message name, for example Update.'},
  primary_entity:{...text, pattern:'^[a-zA-Z_][a-zA-Z0-9_]*$', description:'Logical table name. Omit for a global message registration.'},
};
const patchFields = fields({
  name:text, description:{type:'string'}, stage, mode, rank:{type:'integer', minimum:1, maximum:2147483647},
  supported_deployment:deployment,
  filtering_attributes:{type:'array', items:{...text, pattern:'^[a-zA-Z_][a-zA-Z0-9_]*$'}, maxItems:100,
    description:'Entity-specific Update only. Deduplicated, lowercased, checked against metadata; primary key rejected. Empty array clears filtering.'},
  impersonating_user_id:{anyOf:[id,{type:'null'}], description:'Run as this system user; null restores calling-user context.'},
  enabled:bool,
});
const mutation = {type:'object', additionalProperties:false, properties:{action:{enum:['keep','set','clear']},
  value:{type:'string', description:'Required for set. No configuration values are echoed in previews or write results.'}}, required:['action'],
  allOf:[{if:{properties:{action:{const:'set'}}}, then:{required:['value']}, else:{not:{required:['value']}}}]};
const preview = {...bool, description:'Read-only preview of the environment, resolved target and changes. Configuration values are withheld. Default false.'};
const allow = {...bool, description:'Default false. Explicitly allow an update with If-Match:* if table metadata does not confirm optimistic concurrency. Does not bypass a supplied ETag conflict.'};
const alternative = (snake: string, camel: string) => ({anyOf:[{required:[snake]},{required:[camel]}]});

export const pluginStepTools = [
  {
    name:'d365_plugin_registration_metadata',
    description:'Discover native plugin types, assemblies, SDK messages and message filters. Bounded read-only listings report limits; metadata does not prove write permission. Does not upload assemblies.',
    inputSchema:{type:'object', additionalProperties:false, properties:fields(discovery)},
    annotations:{readOnlyHint:true},
  },
  {
    name:'d365_plugin_steps_query',
    description:'Query native plugin steps with exact filters. Secure Configuration is excluded by default; explicit include_secure_configuration=true is required to read plaintext. All supplied filters, including step_id, are combined. Results are bounded by top.',
    inputSchema:{type:'object', additionalProperties:false, properties:fields({
      ...discovery, step_id:id, stage, mode, enabled:bool,
      include_unsecure_configuration:{...bool, description:'Include Unsecure Configuration in query results, default true (legacy behavior).'},
      include_secure_configuration:{...bool, description:'Explicit opt-in to read and return Secure Configuration plaintext. Default false, changed from the legacy package.'},
      top:{type:'integer', minimum:1, maximum:500, description:'Maximum results; default 50.'},
    })}, annotations:{readOnlyHint:true},
  },
  {
    name:'d365_plugin_step_register',
    description:'Register a step for an existing native plugin type. Resolves message/entity filters, validates filtering fields and detects duplicate signatures. No write is automatically replayed. Optional secure configuration is allocated separately and bound in the step create; all phases report their IDs on failure. dry_run previews without writing.',
    inputSchema:{type:'object', additionalProperties:false, properties:fields({
      plugin_type:{type:'object', additionalProperties:false, properties:fields({id, plugin_type_name:discovery.plugin_type_name, assembly_name:discovery.assembly_name}),
        anyOf:[{required:['id']},{required:['plugin_type_name']},{required:['pluginTypeName']}]},
      message:discovery.message, primary_entity:discovery.primary_entity,
      ...Object.fromEntries(Object.entries(patchFields).filter(([key]) => key !== 'enabled' && !aliases[key])),
      unsecure_configuration:{type:'string', description:'Optional unsecure configuration; never echoed by a write or preview.'},
      secure_configuration:{type:'string', description:'Optional secret; never echoed by a write or preview. Uses a new secure configuration row.'},
      conflict_policy:{enum:['error','return_existing','update_existing'], description:'Default error. Multiple duplicates remain an error. update_existing preserves omitted optional fields/configuration.'},
      dry_run:preview, allow_unprotected_update:allow,
    }), required:['message','stage','mode','rank'], allOf:[alternative('plugin_type','pluginType')]},
    annotations:{readOnlyHint:false, destructiveHint:true, idempotentHint:false},
  },
  {
    name:'d365_plugin_step_update',
    description:'Update one plugin step. Omitted fields/configuration are kept; configuration supports keep/set/clear. Uses table concurrency metadata and a specific ETag by default. Secure set creates a replacement row and binds it in the same PATCH as step changes; clear unbinds. Existing configuration rows are retained, never blindly deleted. Write/readback failures preserve phase evidence.',
    inputSchema:{type:'object', additionalProperties:false, properties:fields({
      step_id:id, if_match:{...text, description:'Specific ETag, for example W/"123". If omitted, uses the current step ETag. Never accepts wildcard.'},
      patch:{type:'object', additionalProperties:false, properties:patchFields},
      unsecure_configuration:mutation, secure_configuration:mutation,
      dry_run:preview, allow_unprotected_update:allow,
    }), allOf:[alternative('step_id','stepId')]},
    annotations:{readOnlyHint:false, destructiveHint:true, idempotentHint:false},
  },
];
