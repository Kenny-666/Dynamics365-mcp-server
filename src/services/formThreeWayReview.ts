import {compareFormDefinitions} from './formComparison.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;

/** Advisory comparison only: positional XML paths are not a safe merge primitive. */
export function reviewFormThreeWay(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A three-way review request is required.');
 const input=raw as Row;
 if(Object.keys(input).some(k=>!['baseline','source','target'].includes(k))||!input.baseline||!input.source||!input.target)throw new Error('Baseline, source and target definitions are required.');
 const sourceComparison=compareFormDefinitions(input.source,input.baseline);
 const targetComparison=compareFormDefinitions(input.target,input.baseline);
 const sourceChanges=sourceComparison.changes as Row[],targetChanges=targetComparison.changes as Row[];
 const byPath=new Map(targetChanges.map(change=>[change.path,change]));
 const intersects=(left:string,right:string)=>left===right||left.startsWith(right+'/')||right.startsWith(left+'/');
 const changes=sourceChanges.map(change=>{
  const overlapping=targetChanges.filter(other=>intersects(change.path,other.path));
  const same=byPath.get(change.path);
  const identical=overlapping.length===1&&same&&hash(change.source)===hash(same.source)&&change.kind===same.kind;
  return {path:change.path,kind:change.kind,category:change.category,classification:!overlapping.length?'source_only':identical?'same_change':'conflict',targetPaths:overlapping.map(x=>x.path)};
 });
 const targetOnly=targetChanges.filter(change=>!sourceChanges.some(other=>intersects(change.path,other.path))).map(change=>({path:change.path,kind:change.kind,category:change.category}));
 const reviewHash=hash({baseline:sourceComparison.targetXmlHash,source:sourceComparison.sourceXmlHash,target:targetComparison.sourceXmlHash,changes,targetOnly});
 return {reviewHash,baselineXmlHash:sourceComparison.targetXmlHash,sourceXmlHash:sourceComparison.sourceXmlHash,targetXmlHash:targetComparison.sourceXmlHash,changes,targetOnly,sourceMoves:sourceComparison.moves,targetMoves:targetComparison.moves,ambiguousIds:[...new Set([...sourceComparison.ambiguousIds,...targetComparison.ambiguousIds])],executionAllowed:false,limitations:['Input definitions are supplied by the caller; baseline provenance and publication state are not verified.','Paths are positional. Reordering, differing IDs or changes in different sibling positions can cause false positives or hide semantic conflicts.','This is an advisory comparison, not a merge or a component dependency analysis.','No package is created and no release is authorized.']};
}
