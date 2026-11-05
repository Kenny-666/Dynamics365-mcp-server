import {hash} from './modelMetadata.js';
import {CrmRequestError} from '../errors.js';
type Row=Record<string,any>;
const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Keep per-step confirmation and counts without repeating large native membership lists. */
function summarizeResult(result:Row):Row {
 const changes=result.observedChanges;
 return {saved:result.saved===true,noChange:result.noChange===true,readback:result.readback?{status:result.readback.status}:undefined,responseSolutionComponentId:result.responseSolutionComponentId??null,
  observedChanges:changes?{added:Array.isArray(changes.added)?changes.added.length:null,removed:Array.isArray(changes.removed)?changes.removed.length:null,changed:Array.isArray(changes.changed)?changes.changed.length:null,attribution:changes.attribution}:undefined,
  dependencyClosureVerified:false,exportContentsVerified:false};
}
/** Compose separately verified native adds. No atomicity or automatic retry is claimed. */
export async function executeFormPackage(plan:Row,selected:unknown,expected:unknown,allow:boolean,add:(args:Row)=>Promise<Row>,signal?:AbortSignal,verifyForms?:()=>Promise<{sourceXmlHash:string;targetXmlHash:string}>,verifyComponent?:(item:Row)=>Promise<void>) {
 if(!Array.isArray(selected)||!selected.length||selected.length>241)throw new Error('Select between 1 and 241 components.');
 const form=plan.formPreview?.component;if(!form||form.componentType!==60||!guid.test(form.objectId||''))throw new Error('Invalid form preview.');
 const available=[{component_type:60,component_id:form.objectId},...plan.componentCandidates.filter((x:Row)=>x.previewStatus==='available').map((x:Row)=>({component_type:x.component_type,component_id:x.component_id,name:x.name,reason:x.reason??null,requiresManualReview:x.requiresManualReview===true,...(x.related_fields?{related_fields:x.related_fields}:{}),...(x.logical_name?{logical_name:x.logical_name}:{})}))];
 const selection=selected.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['component_type','component_id'].includes(k))||![2,9,60,61].includes(v.component_type)||typeof v.component_id!=='string'||!guid.test(v.component_id))throw new Error('Invalid component selection.');const found=available.filter(x=>x.component_type===v.component_type&&x.component_id.toLowerCase()===v.component_id.toLowerCase());if(found.length!==1)throw new Error('Selected component was not in the reviewed plan.');return found[0];});
 const keys=selection.map(x=>x.component_type+':'+x.component_id.toLowerCase());if(new Set(keys).size!==keys.length||!selection.some(x=>x.component_type===60))throw new Error('Select the form exactly once; duplicate components are not permitted.');
 const planHash=hash({source:plan.comparison.sourceXmlHash,target:plan.comparison.targetXmlHash,sourceIdentity:plan.comparison.source,targetIdentity:plan.comparison.target,solution:plan.solution,formPreview:plan.formPreview.planHash,fieldChecks:plan.fieldChecks,libraryChecks:plan.libraryChecks,selection});
 if(expected!==undefined&&expected!==planHash)throw new Error('Reviewed form package plan changed; preview again.');
 if(!allow)return {dryRun:true,planHash,selection,atomic:false,steps:[],scope:'entire_source_form',executionBlocked:true,blockedBy:'RELEASE_SCOPE_NOT_VERIFIED',guidance:'The complete source form and selected components may contain unrelated changes. Baseline-based change isolation and exported package verification are not implemented; do not use this plan for release.'};
 if(allow)throw new CrmRequestError('D365_FORM_RELEASE_SCOPE_UNVERIFIED','Form package execution is disabled because approved changes cannot yet be isolated from unrelated changes. Preview and inspect the complete source form and dependencies; use an independently controlled release process.',{outcome:'not_sent'});
 if(typeof expected!=='string'||expected!==planHash)throw new Error('Execution requires expected_hash from the current preview.');
 const steps:Row[]=[];
 for(const item of selection){
  if(signal?.aborted)return {dryRun:false,planHash,selection,steps,status:'cancelled',atomic:false};
  const args:Row={solution_unique_name:plan.solution,component_id:item.component_id,component_type:item.component_type,...(item.logical_name?{logical_name:item.logical_name}:{})};
  let phase='form_check';
  try{if(verifyForms){const current=await verifyForms();if(current.sourceXmlHash!==plan.comparison.sourceXmlHash||current.targetXmlHash!==plan.comparison.targetXmlHash)throw new Error('Form definition changed after review.');}
   phase='preflight';const fresh=await add({...args,dry_run:true});if(typeof fresh.planHash!=='string')throw new Error('Component preflight missing plan hash.');
   if(item.component_type===9&&(fresh.component?.objectId?.toLowerCase()!==item.component_id.toLowerCase()||fresh.component?.source?.Name!==item.name))throw new CrmRequestError('D365_FORM_COMPONENT_IDENTITY_MISMATCH','Global choice identity changed before add.',{outcome:'not_sent'});
   if(verifyComponent&&item.component_type!==60){phase='component_check';await verifyComponent(item);}
   if(signal?.aborted)return {dryRun:false,planHash,selection,steps,status:'cancelled',atomic:false};
   phase='add';const result=await add({...args,dry_run:false,expected_hash:fresh.planHash,allow_unprotected_write:true});steps.push({component:item,status:result.noChange?'already_member':'added',result:summarizeResult(result)});
  }catch(error){const e=error instanceof CrmRequestError?error:undefined;const data=e&&'data' in e?(e as any).data:undefined;const accepted=phase==='add'&&data?.saved===true;steps.push({component:item,status:accepted?'accepted_unverified':'failed',phase:accepted?'readback':phase,code:e?.code??(phase==='form_check'?'FORM_RECHECK_FAILED':'UNEXPECTED'),outcome:accepted?'accepted':phase==='add'?(e?.details.outcome??'unknown'):'not_sent',data:data?{saved:data.saved??null,phase:data.phase??null,cause:data.cause??null}:undefined});return {dryRun:false,planHash,selection,steps,status:'stopped',atomic:false};}
 }
 return {dryRun:false,planHash,selection,steps,status:'completed',atomic:false,exportContentsVerified:false};
}
