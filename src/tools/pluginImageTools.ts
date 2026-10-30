const id = {type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const text = {type:'string',minLength:1,maxLength:256};
const imageFields = {name:text,description:{type:'string',maxLength:256},entity_alias:text,
  image_type:{enum:[0,1,2,'PreImage','PostImage','Both']},
  attributes:{type:'array',minItems:1,maxItems:100,items:{type:'string',pattern:'^[a-zA-Z_][a-zA-Z0-9_]*$'}}};
const mutation = {dry_run:{type:'boolean',description:'Default true. Preview first, then use false with expected_fingerprint.'},
  expected_fingerprint:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Fingerprint from the same operation preview, required for actual writes.'}};
const concurrency = {if_match:{type:'string',description:'Specific image ETag; wildcard rejected. Defaults to the current ETag when concurrency is supported.'},
  allow_unprotected_update:{type:'boolean',description:'Explicit opt-in to If-Match:* only when concurrency metadata is false/unknown and no specific ETag was supplied.'}};
function schema(properties:Record<string,unknown>,required:string[]) {
  const aliases:Record<string,string> = {stepId:'step_id',imageId:'image_id',entityAlias:'entity_alias',imageType:'image_type',
    dryRun:'dry_run',expectedFingerprint:'expected_fingerprint',ifMatch:'if_match',allowUnprotectedUpdate:'allow_unprotected_update'};
  const expanded = {...properties};
  for (const [alias,key] of Object.entries(aliases)) if (properties[key]) expanded[alias] = {...properties[key] as object,'x-alias-for':key};
  return {type:'object',additionalProperties:false,properties:expanded,...(required.length ? {allOf:required.map(key => ({anyOf:[{required:[key]},
    ...Object.entries(aliases).filter(([,value]) => value === key).map(([alias]) => ({required:[alias]}))]}))} : {})};
}
export const pluginImageTools = [
  {name:'d365_plugin_images_query',description:'List native images for an exact step without reading plugin configuration. Bounded results report completeness; does not follow continuation links.',
    inputSchema:schema({step_id:id,top:{type:'integer',minimum:1,maximum:500}},['step_id']),annotations:{readOnlyHint:true}},
  {name:'d365_plugin_image_register',description:'Preview/register a native Pre/Post/Both image with explicit readable fields. Supports entity-specific Create, Update, Delete, Assign and SetState steps. Validates stage/message and overlapping aliases. Preview fingerprint required to write. No assembly upload or automatic publication.',
    inputSchema:schema({step_id:id,...imageFields,...mutation},['step_id','name','entity_alias','image_type','attributes']),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'d365_plugin_image_update',description:'Preview/update an unmanaged customizable image. Omitted patch values are preserved. Checks fields, parent step and duplicate aliases, requires preview fingerprint and metadata-gated concurrency, then reads back saved fields.',
    inputSchema:schema({image_id:id,patch:schema(imageFields,[]),...mutation,...concurrency},['image_id','patch']),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'d365_plugin_image_delete',description:'Preview/delete an unmanaged customizable image by exact ID. Requires preview fingerprint, metadata-gated concurrency and a subsequent 404 to confirm deletion. Does not delete its parent step or retry a write.',
    inputSchema:schema({image_id:id,...mutation,...concurrency},['image_id']),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
];
