const id = {type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const identifier = {type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,99}$'};
const component = {component_id:{...id,description:'Native object/metadata GUID, NOT the solutioncomponent membership row GUID.'},component_type:{type:'integer',minimum:1,maximum:2147483647}};
const paging = {top:{type:'integer',minimum:1,maximum:5000,description:'Maximum returned rows, default 500; completeness is explicit.'},max_pages:{type:'integer',minimum:1,maximum:20,description:'Maximum native pages, default 5.'}};
function schema(properties:Record<string,any>,required:string[] = []) {
  const aliases:Record<string,string> = {solutionUniqueName:'solution_unique_name',solutionId:'solution_id',componentId:'component_id',componentType:'component_type',
    logicalName:'logical_name',maxPages:'max_pages',dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write'};
  const expanded = {...properties};for (const [alias,key] of Object.entries(aliases)) if (properties[key]) expanded[alias] = {...properties[key],'x-alias-for':key};
  return {type:'object',additionalProperties:false,properties:expanded,...(required.length ? {allOf:required.map(key => ({anyOf:[{required:[key]},
    ...Object.entries(aliases).filter(([,value]) => value === key).map(([key]) => ({required:[key]}))]}))} : {})};
}
export const solutionTools = [
  {name:'list_solutions',description:'List native solution identity/state with optional exact unique-name/ID/managed filters. Bounded paging stays in the current query scope. Visible rows are not deployment validation.',
    inputSchema:schema({solution_unique_name:identifier,solution_id:id,is_managed:{type:'boolean'},...paging}),annotations:{readOnlyHint:true}},
  {name:'list_solution_components',description:'List visible solutioncomponent membership rows for an exact solution; objectid/type, membership row ID and root inclusion behavior are separate. Optional filters combine with the solution. No code/XML/configuration is read; completeness does not prove export payload contents.',
    inputSchema:schema({solution_unique_name:identifier,...component,...paging},['solution_unique_name']),annotations:{readOnlyHint:true}},
  {name:'get_solution_component_dependencies',description:'Invoke native RetrieveRequiredComponents, RetrieveDependentComponents or RetrieveDependenciesForDelete after current CSDL validation. Default direction required. Returns projected dependency edges and explicit bounded completeness. Does not compute transitive closure, authorize deletion or prove deployment readiness.',
    inputSchema:schema({...component,direction:{enum:['required','dependent','delete']},...paging},['component_id','component_type']),annotations:{readOnlyHint:true}},
  {name:'add_solution_component',description:'Default preview of adding one existing component to a visible ordinary unmanaged solution. Validates the actual object/type, current CSDL and complete visible membership/required-dependency baseline. Types: 1 Entity, 2 Attribute, 9 global Option Set, 10 Entity Relationship, 14 Entity Key, 26 Saved Query, 60 System Form, 61 Web Resource, 90–93 plugin types/assemblies/steps/images. Attribute/Key requires logical_name. Fixed AddRequiredComponents=false/DoNotIncludeSubcomponents=true; implicit parent shells may still be added. Execute with planHash plus explicit unprotected Action; reread membership and report observed deltas without claiming export completeness.',
    inputSchema:schema({solution_unique_name:identifier,...component,logical_name:identifier,dry_run:{type:'boolean',description:'Default true; no add Action is sent.'},
      expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Current preview planHash, required to execute.'},
      allow_unprotected_write:{type:'boolean',description:'Explicitly accept the native Action concurrency window; no atomic solution/dependency lock is claimed.'}},['solution_unique_name','component_id','component_type']),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
];
