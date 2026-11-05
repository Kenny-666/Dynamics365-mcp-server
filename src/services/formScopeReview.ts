import {hash} from './modelMetadata.js';

type Row = Record<string, any>;

/** Review an existing plan locally. A review is not proof of a trusted baseline or a deployable package. */
export function reviewFormReleaseScope(raw: unknown) {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('A scope review request is required.');
 const input=raw as Row;
 if (Object.keys(input).some(k=>!['plan','approved_paths','approved_components'].includes(k))) throw new Error('Unexpected scope review argument.');
 const plan=input.plan,comparison=plan?.comparison;
 if (!plan || typeof plan!=='object' || !comparison || !Array.isArray(comparison.changes) || !Array.isArray(plan.componentCandidates) || !Array.isArray(plan.unresolvedComponents) || !/^[a-f0-9]{64}$/.test(comparison.sourceXmlHash || '') || !/^[a-f0-9]{64}$/.test(comparison.targetXmlHash || '')) throw new Error('A complete form package plan is required.');
 if (comparison.changes.length>3000 || plan.componentCandidates.length>240 || plan.unresolvedComponents.length>1000) throw new Error('Scope review exceeds limits.');
 const paths=input.approved_paths,components=input.approved_components;
 if (!Array.isArray(paths) || paths.length>3000 || paths.some((p:unknown)=>typeof p!=='string'||!p.startsWith('/form[1]')||p.length>2048) || new Set(paths).size!==paths.length) throw new Error('Invalid approved paths.');
 const key=(v:Row)=>`${v.component_type}:${String(v.component_id).toLowerCase()}`;
 if (!Array.isArray(components)||components.length>240||components.some((x:unknown)=>!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||![2,9,61].includes((x as Row).component_type)||typeof (x as Row).component_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((x as Row).component_id))) throw new Error('Invalid approved components.');
 const approvedKeys=components.map(key);if(new Set(approvedKeys).size!==approvedKeys.length)throw new Error('Duplicate approved component.');
 const knownPaths=new Set(comparison.changes.map((x:Row)=>x.path));if(paths.some((p:string)=>!knownPaths.has(p)))throw new Error('Approved path is not present in the plan.');
 const candidates=plan.componentCandidates as Row[];
 if(approvedKeys.some((k:string)=>candidates.filter(x=>key(x)===k).length!==1))throw new Error('Approved component is absent or ambiguous.');
 const changes=comparison.changes.map((change:Row)=>({path:change.path,kind:change.kind,category:change.category,classification:paths.includes(change.path)?'selected_for_review':'outside_selected_scope'}));
 const items=candidates.map(item=>({component_type:item.component_type,component_id:item.component_id,name:item.name,reason:item.reason,classification:approvedKeys.includes(key(item))?'selected_for_review':'outside_selected_scope',previewStatus:item.previewStatus,requiresManualReview:item.requiresManualReview===true}));
 const reviewHash=hash({source:comparison.sourceXmlHash,target:comparison.targetXmlHash,solution:plan.solution,changes,items,unresolvedComponents:plan.unresolvedComponents});
 return {reviewHash,sourceXmlHash:comparison.sourceXmlHash,targetXmlHash:comparison.targetXmlHash,changes,components:items,unresolvedComponents:plan.unresolvedComponents,baseline:'not_provided',executionAllowed:false,limitations:['Selections express review intent only and cannot prove changes belong to a requirement.','Positional XML paths can shift; shared scripts and fields may contain other changes.','Input is caller-supplied and is not independently authenticated.','No dependency closure, isolated build, export contents, or deployment has been verified.']};
}
