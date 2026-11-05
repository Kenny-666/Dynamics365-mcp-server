import {prepareFormCandidate} from './formCandidate.js';
import {prepareFormNodeCandidate} from './formNodeCandidate.js';
import {prepareFormRowCandidate} from './formRowCandidate.js';
import {prepareFormScriptEntryCandidate} from './formScriptCandidate.js';
import {xmlHash} from './modelUiXml.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;
/** Apply individually reviewed changes to one in-memory candidate, without any CRM writes. */
export function prepareCompositeFormCandidate(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Composite candidate input must be an object.');const a=raw as Row;
 if(Object.keys(a).some(k=>!['baseline','source','target','baseline_hash','source_hash','target_hash','steps'].includes(k)))throw new Error('Unexpected composite candidate argument.');
 for(const side of ['baseline','source','target'])if(typeof a[side]!=='string'||typeof a[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(a[side+'_hash'])||xmlHash(a[side],'form')!==a[side+'_hash'])throw new Error('A matching reviewed XML hash is required for '+side+'.');
 if(a.baseline_hash!==a.target_hash)throw new Error('Target differs from baseline; resolve target changes before combining changes.');
 if(!Array.isArray(a.steps)||!a.steps.length||a.steps.length>50)throw new Error('Select 1–50 candidate steps.');
 const common={baseline:a.baseline,source:a.source,target:a.target,baseline_hash:a.baseline_hash,source_hash:a.source_hash,target_hash:a.target_hash};let working=a.target;const steps:Row[]=[];
 for(const [index,rawStep] of a.steps.entries()){
  if(!rawStep||typeof rawStep!=='object'||Array.isArray(rawStep)||Object.keys(rawStep).some(k=>!['kind','selection'].includes(k))||!['attributes','nodes','row','script_entry'].includes(rawStep.kind)||!rawStep.selection||typeof rawStep.selection!=='object'||Array.isArray(rawStep.selection))throw new Error('Invalid composite step '+(index+1)+'.');
  const selection=rawStep.selection as Row;if(Object.keys(selection).some(k=>Object.hasOwn(common,k)))throw new Error('A candidate step cannot override reviewed form versions.');
  const input={...selection,...common},beforeHash=xmlHash(working,'form');let result:Row;
  if(rawStep.kind==='attributes')result=prepareFormCandidate(input,working);
  else if(rawStep.kind==='nodes')result=prepareFormNodeCandidate(input,working);
  else if(rawStep.kind==='row')result=prepareFormRowCandidate(input,working);
  else result=prepareFormScriptEntryCandidate(input,working);
  working=result.candidate.formxml;steps.push({index,kind:rawStep.kind,beforeHash,candidateHash:result.candidateHash,reviewHash:result.reviewHash});
 }
 const candidateHash=xmlHash(working,'form');return {candidate:{formxml:working},candidateHash,steps,reviewHash:hash({baseline:a.baseline_hash,source:a.source_hash,target:a.target_hash,steps,candidateHash}),executionAllowed:false,limitations:['Each step and the final complete candidate require review.','Overlapping edits may conflict; selection does not prove requirement ownership.','No dependencies, CRM writes, publication, export or deployment are performed.']};
}
