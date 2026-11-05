import {compareFormDefinitions} from './formComparison.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;

/** Compare the complete candidate to the target and require explicit review of each positional difference. */
export function inspectFormCandidateScope(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Candidate scope input must be an object.');
 const input=raw as Row;
 if(Object.keys(input).some(k=>!['candidate','target','candidate_hash','target_hash','approved_paths'].includes(k))||!input.candidate||!input.target)throw new Error('Candidate, target and reviewed scope are required.');
 for(const k of ['candidate_hash','target_hash'])if(typeof input[k]!=='string'||!/^[a-f0-9]{64}$/.test(input[k]))throw new Error('Reviewed XML hashes are required.');
 if(!Array.isArray(input.approved_paths)||input.approved_paths.length>3000||input.approved_paths.some((x:unknown)=>typeof x!=='string'||!x.startsWith('/form[1]')||x.length>2048)||new Set(input.approved_paths).size!==input.approved_paths.length)throw new Error('Invalid approved paths.');
 const comparison=compareFormDefinitions(input.candidate,input.target);
 if(comparison.sourceXmlHash!==input.candidate_hash||comparison.targetXmlHash!==input.target_hash)throw new Error('Candidate or target changed since review.');
 if(comparison.sourceXmlHash!==comparison.targetXmlHash&&!comparison.changes.length)throw new Error('Form hashes differ but the positional comparison found no reviewable changes.');
 const paths=new Set(input.approved_paths),observed=new Set(comparison.changes.map((x:Row)=>x.path));
 const changes=comparison.changes.map((change:Row)=>({...change,classification:paths.has(change.path)?'approved_path':'outside_approved_scope'}));
 const unusedPaths=input.approved_paths.filter((path:string)=>!observed.has(path));
 const outside=changes.filter((change:Row)=>change.classification==='outside_approved_scope');
 const reportHash=hash({candidateHash:comparison.sourceXmlHash,targetHash:comparison.targetXmlHash,approvedPaths:[...paths].sort(),changes,unusedPaths});
 return {reportHash,candidateHash:comparison.sourceXmlHash,targetHash:comparison.targetXmlHash,changes,unusedPaths,outsideScopeCount:outside.length,scopeStatus:outside.length||unusedPaths.length?'mismatch':'selected_paths_only',executionAllowed:false,limitations:['Positional XML differences are not a semantic diff; reordered or environment-specific IDs may be misleading.','Explicit paths do not prove requirement ownership or dependency completeness.','Caller-supplied candidate, target and approved paths are not authenticated.','A matching report does not prove export contents, platform merge behavior, or deployment readiness.']};
}

/** Reject selected positional values that cannot be traced to the observed source. */
export function inspectCandidateSourceEvidence(candidate:Row,source:Row,target:Row){
 const proposed=compareFormDefinitions(candidate,target),available=compareFormDefinitions(source,target);
 const sourceChanges=new Map<string,Row>(available.changes.map((change:Row)=>[change.path,change]));
 const issues:Row[]=[];
 for(const change of proposed.changes){
  const observed=sourceChanges.get(change.path);
  if(!observed){issues.push({path:change.path,reason:'no_source_change_at_path'});continue;}
  if(change.kind!==observed.kind){issues.push({path:change.path,reason:'different_change_kind'});continue;}
  if(change.kind!=='changed'){
   if(hash(change.source)!==hash(observed.source)||hash(change.target)!==hash(observed.target))issues.push({path:change.path,reason:'added_or_removed_node_differs'});
   continue;
  }
  const attrs=(node:Row)=>Object.fromEntries(node.attributes as Array<[string,string]>),before=attrs(change.target),after=attrs(change.source),sourceAfter=attrs(observed.source);
  for(const name of new Set([...Object.keys(before),...Object.keys(after)]))if(before[name]!==after[name]&&after[name]!==sourceAfter[name])issues.push({path:change.path,attribute:name,reason:'attribute_value_not_in_source'});
  if(change.source.text!==change.target.text&&change.source.text!==observed.source.text)issues.push({path:change.path,reason:'text_not_in_source'});
  const targetContent=change.target.childContent as Row[],candidateContent=change.source.childContent as Row[],sourceContent=observed.source.childContent as Row[];
  if(hash(candidateContent)!==hash(targetContent)){
   // Structural edits affect sibling positions.  A multiset check would allow a
   // candidate to combine a selected insertion with an unselected reorder.
   if(hash(candidateContent)!==hash(sourceContent)){
    issues.push({path:change.path,reason:'child_structure_not_exactly_observed'});
    continue;
   }
   const count=(content:Row[])=>{const result=new Map<string,number>();for(const item of content){const token=JSON.stringify(item);result.set(token,(result.get(token)??0)+1);}return result;};
   const baselineCounts=count(targetContent),candidateCounts=count(candidateContent),sourceCounts=count(sourceContent);
   const keys=new Set([...baselineCounts.keys(),...candidateCounts.keys(),...sourceCounts.keys()]);
   for(const key of keys){const baseline=baselineCounts.get(key)??0,selected=(candidateCounts.get(key)??0)-baseline,availableDelta=(sourceCounts.get(key)??0)-baseline;if(selected!==0&&(availableDelta===0||Math.sign(selected)!==Math.sign(availableDelta)||Math.abs(selected)>Math.abs(availableDelta))){issues.push({path:change.path,reason:'child_content_not_in_source'});break;}}
  }
 }
 const report={candidateHash:proposed.sourceXmlHash,sourceHash:available.sourceXmlHash,targetHash:proposed.targetXmlHash,issues};
 return {...report,reportHash:hash(report),status:issues.length?'unmatched':'selected_values_observed',limitations:['Positional matching is conservative when nodes move; review structure and ownership independently.','Matching selected values does not authenticate a baseline or establish dependency compatibility.']};
}
