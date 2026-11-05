import {hash} from './modelMetadata.js';

type Row=Record<string,any>;
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validType=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0;
const key=(type:number,id:string)=>type+':'+id.toLowerCase();

/** Traverse native required components with explicit resource bounds and fail-closed completeness. */
export async function inspectDependencyGraph(raw:unknown,read:(id:string,type:number)=>Promise<Row>,signal?:AbortSignal){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Dependency graph input must be an object.');const a=raw as Row;
 if(Object.keys(a).some(k=>!['components','max_depth','max_nodes'].includes(k))||!Array.isArray(a.components)||!a.components.length||a.components.length>100)throw new Error('Select 1–100 components.');
 const maxDepth=a.max_depth??3,maxNodes=a.max_nodes??100;if(!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>5||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>100)throw new Error('Invalid dependency traversal limits.');
 const selected=new Set<string>(),queue:Row[]=[];
 for(const component of a.components){if(!component||typeof component!=='object'||Array.isArray(component)||Object.keys(component).some(k=>!['component_type','component_id'].includes(k))||!validType(component.component_type)||!validId(component.component_id))throw new Error('Invalid component identity.');const id=key(component.component_type,component.component_id);if(selected.has(id))throw new Error('Duplicate component.');selected.add(id);queue.push({type:component.component_type,id:component.component_id.toLowerCase(),depth:0});}
 if(queue.length>maxNodes)throw new Error('The selected component count exceeds max_nodes.');
 const scheduled=new Set(queue.map(x=>key(x.type,x.id))),visited=new Set<string>(),edges:Row[]=[],unread:Row[]=[];let truncated=false;
 while(queue.length){if(signal?.aborted)throw new Error('Dependency traversal cancelled.');const item=queue.shift()!,owner=key(item.type,item.id);if(visited.has(owner))continue;visited.add(owner);
  try{const report=await read(item.id,item.type);if(!report||report.direction!=='required'||!report.requested||key(report.requested.componentType,report.requested.objectId)!==owner||!Array.isArray(report.items))throw new Error('Invalid native dependency report.');if(report.paging?.complete!==true){unread.push({component:owner,reason:'incomplete_paging'});continue;}
   for(const row of report.items){if(!validType(row.requiredcomponenttype)||!validId(row.requiredcomponentobjectid)||!validType(row.dependentcomponenttype)||!validId(row.dependentcomponentobjectid))throw new Error('Invalid native dependency row.');const required=key(row.requiredcomponenttype,row.requiredcomponentobjectid),dependent=key(row.dependentcomponenttype,row.dependentcomponentobjectid);edges.push({queried:owner,dependent,required,depth:item.depth+1,classification:selected.has(required)?'selected':'not_selected'});if(edges.length>5000)throw new Error('Dependency edge limit exceeded.');
    if(!scheduled.has(required)){if(item.depth+1>=maxDepth||scheduled.size>=maxNodes){truncated=true;continue;}scheduled.add(required);queue.push({type:row.requiredcomponenttype,id:row.requiredcomponentobjectid.toLowerCase(),depth:item.depth+1});}
   }
  }catch(error){if(signal?.aborted)throw error;unread.push({component:owner,reason:'read_failed_or_invalid'});}
 }
 edges.sort((x,y)=>x.queried.localeCompare(y.queried)||x.required.localeCompare(y.required)||x.dependent.localeCompare(y.dependent));unread.sort((x,y)=>x.component.localeCompare(y.component));
 const report={selected:[...selected].sort(),visited:[...visited].sort(),edges,unread,truncated,limits:{maxDepth,maxNodes}};
 return {...report,reviewHash:hash(report),completeVisibleGraph:!truncated&&!unread.length,executionAllowed:false,limitations:['Results are bounded, non-transactional and limited by the current identity.','Not-selected dependencies may already exist in the target, but their identity and compatibility are not verified.','A complete visible graph does not prove deployment or runtime readiness.']};
}

/** Classify direct dependency evidence without inferring cross-environment identity or compatibility. */
export function reviewReleaseDependencies(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Dependency review input must be an object.');
 const a=raw as Row;
 if(Object.keys(a).some(k=>!['reports','selected_components','target_evidence'].includes(k))||!Array.isArray(a.reports)||!a.reports.length||a.reports.length>241||!Array.isArray(a.selected_components)||a.selected_components.length>241||!Array.isArray(a.target_evidence)||a.target_evidence.length>5000)throw new Error('Bounded dependency reports, component selection and target evidence are required.');
 const selected=new Set<string>();
 for(const item of a.selected_components){if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['component_type','component_id'].includes(k))||!validType(item.component_type)||!validId(item.component_id))throw new Error('Invalid selected component.');const id=key(item.component_type,item.component_id);if(selected.has(id))throw new Error('Duplicate selected component.');selected.add(id);}
 const evidence=new Map<string,Row>();
 for(const item of a.target_evidence){if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['source_type','source_id','target_type','target_id','evidence_reference'].includes(k))||!validType(item.source_type)||!validId(item.source_id)||!validType(item.target_type)||!validId(item.target_id)||typeof item.evidence_reference!=='string'||!item.evidence_reference.trim()||item.evidence_reference.length>500)throw new Error('Invalid target evidence.');const id=key(item.source_type,item.source_id);if(evidence.has(id))throw new Error('Duplicate target evidence.');evidence.set(id,{sourceType:item.source_type,sourceId:item.source_id.toLowerCase(),targetType:item.target_type,targetId:item.target_id.toLowerCase(),evidenceReference:item.evidence_reference.trim()});}
 const records:Row[]=[],reported=new Set<string>();let incomplete=false;
 for(const report of a.reports){if(!report||typeof report!=='object'||Array.isArray(report)||report.direction!=='required'||!report.requested||!validType(report.requested.componentType)||!validId(report.requested.objectId)||!Array.isArray(report.items)||report.items.length>5000)throw new Error('Invalid native required-dependency report.');const owner=key(report.requested.componentType,report.requested.objectId);if(!selected.has(owner))throw new Error('Dependency report is not for a selected component.');if(reported.has(owner))throw new Error('Duplicate dependency report.');reported.add(owner);if(report.paging?.complete!==true)incomplete=true;
  for(const item of report.items){if(!item||!validType(item.requiredcomponenttype)||!validId(item.requiredcomponentobjectid)||!validType(item.dependentcomponenttype)||!validId(item.dependentcomponentobjectid))throw new Error('Incomplete native dependency row.');const dependent=key(item.dependentcomponenttype,item.dependentcomponentobjectid);if(dependent!==owner)throw new Error('Native dependency row does not belong to its requested component.');const required=key(item.requiredcomponenttype,item.requiredcomponentobjectid),mapping=evidence.get(required);records.push({owner,dependent,required,classification:selected.has(required)?'selected':mapping?'target_evidence_claimed':'unresolved',targetEvidence:mapping??null});if(records.length>10000)throw new Error('Dependency review exceeds record limit.');}
 }
 const missingReports=[...selected].filter(id=>!reported.has(id)).sort();records.sort((x,y)=>x.owner.localeCompare(y.owner)||x.required.localeCompare(y.required)||x.dependent.localeCompare(y.dependent));
 const summary={incomplete,missingReports,unresolvedCount:records.filter(r=>r.classification==='unresolved').length,claimedTargetCount:records.filter(r=>r.classification==='target_evidence_claimed').length};
 return {reviewHash:hash({selected:[...selected].sort(),records,summary}),records,...summary,executionAllowed:false,limitations:['All reports and mappings are caller supplied; target evidence is a claim, not verified identity, compatibility or authorization.','Only direct reported dependencies are classified; transitive closure and missing permissions are not established.','A selected component or an empty report does not prove deployment readiness.']};
}
