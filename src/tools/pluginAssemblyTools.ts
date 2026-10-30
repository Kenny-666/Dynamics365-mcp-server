const id = {type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const source = {file_path:{type:'string',minLength:1,description:'Local regular managed DLL, at most 16 MiB. Never executed.'},
  content_base64:{type:'string',minLength:4,maxLength:22369624,description:'Canonical base64 managed DLL; exclusive with file_path.'}};
function schema(properties:Record<string,unknown>,required:string[],sourceRequired = false) {
  const aliases:Record<string,string> = {assemblyId:'assembly_id',filePath:'file_path',contentBase64:'content_base64',dryRun:'dry_run',
    expectedFingerprint:'expected_fingerprint',ifMatch:'if_match',allowUnprotectedUpdate:'allow_unprotected_update'};
  const expanded = {...properties};
  for (const [alias,key] of Object.entries(aliases)) if (properties[key]) expanded[alias] = {...properties[key] as object,'x-alias-for':key};
  const allOf = required.map(key => ({anyOf:[{required:[key]},...Object.entries(aliases).filter(([,value]) => value === key).map(([key]) => ({required:[key]}))]}));
  if (sourceRequired) allOf.push({anyOf:['file_path','filePath','content_base64','contentBase64'].map(key => ({required:[key]}))});
  return {type:'object',additionalProperties:false,properties:expanded,...(allOf.length ? {allOf} : {})};
}
export const pluginAssemblyTools = [
  {name:'d365_plugin_assembly_inspect',description:'Read actual DLL identity, target framework, public plugin contract types and reference metadata locally using a fixed .NET 10 metadata-reader process. No CRM settings required. Does not load/execute inspected code, verify its signature or resolve dependencies.',
    inputSchema:schema(source,[],true),annotations:{readOnlyHint:true}},
  {name:'d365_plugin_assemblies_query',description:'List native plugin assembly metadata with optional exact ID/name filters. Excludes content, credentials and configuration; bounded completeness is explicit. Does not invoke the .NET reader.',
    inputSchema:schema({assembly_id:id,name:{type:'string',minLength:1,maxLength:256},top:{type:'integer',minimum:1,maximum:500}},[]),annotations:{readOnlyHint:true}},
  {name:'d365_plugin_assembly_update',description:'Default preview only. Compare actual DLL against a stored unmanaged database assembly and preserve all existing plugin type IDs/names. Permit same major/minor non-decreasing build/revision, same identity/framework/references and AnyCPU signed managed DLL only. Managed, packaged, workflow, added/removed/unresolved types and dependency changes are blocked. Execute with preview fingerprint and metadata-gated concurrency; verify stored bytes, identity and type IDs after saving. .NET 10 Runtime required. Never creates assemblies or retargets steps.',
    inputSchema:schema({assembly_id:id,...source,dry_run:{type:'boolean',description:'Default true; use false only with the same preview fingerprint.'},
      expected_fingerprint:{type:'string',pattern:'^[a-f0-9]{64}$'},if_match:{type:'string',description:'Specific ETag; wildcard rejected.'},
      allow_unprotected_update:{type:'boolean',description:'Explicitly allow If-Match:* only when table concurrency is not confirmed; cannot bypass a supplied ETag.'}},['assembly_id'],true),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
];
