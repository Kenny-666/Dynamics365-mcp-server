const id = {type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const file = {type:'string',minLength:1,maxLength:4096,description:'Absolute local file path. ZIPs are read without extraction or execution.'};
const input = {file_path:file,content_base64:{type:'string',minLength:1,maxLength:44739244,description:'Canonical base64; ZIP bytes at most 32 MiB. Supply exactly one input source.'}};
const review = {dry_run:{type:'boolean',description:'Default true. Execution requires a current preview planHash.'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}};
function schema(properties:Record<string,any>,required:string[] = [],source = false) {
  const aliases:Record<string,string> = {filePath:'file_path',contentBase64:'content_base64',outputPath:'output_path',solutionUniqueName:'solution_unique_name',
    dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write',asyncOperationId:'async_operation_id',importJobId:'import_job_id'};
  const expanded = {...properties};for (const [alias,key] of Object.entries(aliases)) if (properties[key]) expanded[alias] = {...properties[key],'x-alias-for':key};
  const present = (key:string) => ({anyOf:[{required:[key]},...Object.entries(aliases).filter(([,value]) => value === key).map(([key]) => ({required:[key]}))]});
  const allOf:any[] = required.map(present);
  if (source) allOf.push({oneOf:[{allOf:[present('file_path'),{not:present('content_base64')}]},{allOf:[present('content_base64'),{not:present('file_path')}]}]});
  return {type:'object',additionalProperties:false,properties:expanded,...(allOf.length ? {allOf} : {})};
}
export const solutionTransferTools = [
  {name:'inspect_solution_package',description:'Inspect a local solution ZIP or base64 without CRM configuration. Bounds ZIP headers, paths, inflated sizes and every payload CRC; reads only solution.xml identity, publisher and declaration counts. No extraction/execution. Does not prove authenticity, safe code, dependencies, contents or deployability.',
    inputSchema:schema(input,[],true),annotations:{readOnlyHint:true}},
  {name:'export_solution',description:'Preview by default. Native ExportSolution from a visible ordinary unmanaged source; choose managed output explicitly. Current CSDL and caller/environment identity are validated. Execute with planHash; writes an exclusive new local .zip, verifies identity/hash, never returns base64 or overwrites files. No publish. On failure the reserved path can be empty/partial; no automatic replay.',
    inputSchema:schema({solution_unique_name:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,99}$'},managed:{type:'boolean'},output_path:file,...review},['solution_unique_name','output_path']),
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'import_solution_async',description:'Preview first import of an ordinary unmanaged ZIP into the configured environment. Execute with planHash and allow_unprotected_write=true. Same solution-name updates, managed/patch/upgrade imports are blocked. First import can change shared unmanaged components. Fixed overwrite overlay/workflow activation/dependency skip/holding/upgrade flags false; no environment overrides or separate publish. Submits once using ImportSolutionAsync; accepted is not completed. Unknown outcomes retain a client-assigned importJobId for manual status checks.',
    inputSchema:schema({...input,...review,allow_unprotected_write:{type:'boolean',description:'Explicitly accept the native import concurrency window and shared unmanaged component changes.'}},[],true),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'get_solution_import_status',description:'Read native asyncoperation and/or importjob by explicit receipt IDs once, without polling or resubmission. Separates terminal async state, progress, unavailable/hidden/forbidden evidence and solution identity readback. Caller-supplied IDs are independent observations, not an independently verified relation. Progress=100/identity match is not deployment/runtime proof. No raw job/log/configuration text returned.',
    inputSchema:{...schema({async_operation_id:id,import_job_id:id}),anyOf:[{required:['async_operation_id']},{required:['asyncOperationId']},{required:['import_job_id']},{required:['importJobId']}]},annotations:{readOnlyHint:true}},
];
