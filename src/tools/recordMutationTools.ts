import { mutationAliases } from '../services/recordMutationInput.js';

type Schema = Record<string,any>;
const identifier = {type:'string',pattern:'^[a-zA-Z_][a-zA-Z0-9_]*$'};
const id = {type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'};
function fields(properties:Schema):Schema {
  const result = {...properties};
  for (const [camel,snake] of Object.entries(mutationAliases)) if (properties[snake]) result[camel] = {
    ...properties[snake],'x-alias-for':snake,description:'Compatibility alias for ' + snake + '. Conflicting aliases are rejected.'};
  return result;
}
const alternative = (name:string) => ({anyOf:[{required:[name]},{required:[Object.keys(mutationAliases).find(key => mutationAliases[key] === name)!]}]});
const shared = {
  collection_name:{...identifier,description:'Native EntitySetName, such as accounts. Validated against table metadata.'},
  dry_run:{type:'boolean',description:'Read-only preview of environment, target, changes and write blockers. Default false; sensitive fields are masked.'},
};
const condition = {
  if_match:{type:'string',description:'Specific ETag from a prior read/preview. Without it, reads the current record ETag when the table supports concurrency.'},
  allow_unprotected_write:{type:'boolean',description:'Default false. Explicitly allow an unprotected write if table concurrency is unconfirmed, or for collection relationship membership. Does not bypass a supplied ETag conflict.'},
};
const data = {type:'object',minProperties:1,description:'Native JSON attribute data. Related bindings must stay inside the configured organization API. Local JSON limit 10 MiB.'};
function schema(properties:Schema,required:string[],aliasesRequired:string[] = ['collection_name']) {
  return {type:'object',additionalProperties:false,properties:fields(properties),required,
    allOf:aliasesRequired.map(alternative)};
}
const create = schema({...shared,data},['data']);
const update = schema({...shared,...condition,id,data},['id','data']);
const remove = schema({...shared,...condition,id},['id']);
const upsert = schema({...shared,...condition,data,
  alternate_key:{type:'object',minProperties:1,maxProperties:16,additionalProperties:{type:['string','number']},
    description:'Exact values for one declared active alternate key. Native metadata determines string/integer/choice/decimal/UTC datetime/lookup encoding. No null values.'},
  mode:{enum:['upsert','create_only','update_only'],description:'Default upsert. Uses native conditional PATCH: create-only if absent, guarded update if present. No automatic retry on races.'},
},['data'],['collection_name','alternate_key']);
const association = schema({...shared,...condition,id,
  navigation_property:{...identifier,description:'Native navigation property, resolved from relationship metadata to the specified related table.'},
  related_collection_name:identifier,related_id:id,
},['id'],['collection_name','navigation_property','related_collection_name','related_id']);
const annotation = {readOnlyHint:false,destructiveHint:true,idempotentHint:false};
const operationSchemas:Schema = {create,update,delete:remove,upsert,associate:association,disassociate:association};
const operations = {type:'array',minItems:1,maxItems:100,items:{oneOf:Object.entries(operationSchemas).map(([kind,args]) => ({
  type:'object',additionalProperties:false,properties:{operation:{const:kind},arguments:args},required:['operation','arguments'],
}))}};

export const recordMutationTools = [
  {name:'create_new_record',description:'Create a native record. Accepts returned entity/ID headers or a supplied primary key, reports confirmed save separately from ID availability. dry_run previews without writing.',inputSchema:create,annotations:annotation},
  {name:'update_existing_record',description:'Update a native record with row-version protection where supported. Defaults to a fresh ETag; unsupported concurrency stops writes unless unprotected operation is explicit. Does not upsert a missing GUID.',inputSchema:update,annotations:annotation},
  {name:'delete_record_by_id',description:'Delete a native record with validated GUID and concurrency conditions. dry_run identifies the target without deleting. A specific supplied ETag is never downgraded.',inputSchema:remove,annotations:annotation},
  {name:'upsert_record_by_key',description:'Use one active native alternate key with conditional PATCH. Validates key metadata/types and never silently changes key values. Races return errors; writes are never automatically repeated.',inputSchema:upsert,annotations:annotation},
  {name:'associate_records',description:'Associate records using a validated native navigation property. Single-valued lookup uses conditional PATCH; collection membership uses $ref and requires explicit allow_unprotected_write because parent ETags do not guarantee membership concurrency.',inputSchema:association,annotations:annotation},
  {name:'disassociate_records',description:'Remove a native association. A single lookup is cleared only if it currently points to the supplied target; collection membership uses DELETE on the specific $ref. No related record is deleted.',inputSchema:association,annotations:annotation},
  {name:'execute_record_batch',description:'Execute up to 100 validated record mutations in native $batch chunks. Each operation has its own change set, so a later failure does not roll back earlier operations. Preflights all operations before dispatch, reports per-item outcomes, stops after unknown results and respects request cancellation.',
    inputSchema:{type:'object',additionalProperties:false,properties:fields({operations,
      dry_run:shared.dry_run,chunk_size:{type:'integer',minimum:1,maximum:100,description:'Default 25. Every chunk must fit the 10 MiB wire-body limit.'},
      continue_on_error:{type:'boolean',description:'Default false. Continue after known per-item rejection; unknown results always stop future chunks. Native support is not assumed when responses are incomplete.'},
    }),required:['operations']},annotations:annotation},
  {name:'execute_record_transaction',description:'Execute up to 100 validated mutations in ONE native $batch change set, without chunking or fallback to individual writes. Reports committed false for confirmed rejection and unknown for transport/server ambiguity. Preflight reads are outside the transaction; arbitrary HTTP and Content-ID dependencies are not accepted.',
    inputSchema:{type:'object',additionalProperties:false,properties:fields({operations,dry_run:shared.dry_run}),required:['operations']},annotations:annotation},
];
