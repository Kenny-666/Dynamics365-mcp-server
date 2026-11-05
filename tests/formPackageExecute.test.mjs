import {test} from 'node:test';import assert from 'node:assert/strict';import {executeFormPackage} from '../src/services/formPackageExecute.ts';import {CrmRequestError} from '../src/errors.ts';
import {SolutionError} from '../src/services/solutionSupport.ts';
const id='11111111-1111-1111-1111-111111111111',field='22222222-2222-2222-2222-222222222222';
const plan={solution:'test',comparison:{sourceXmlHash:'a',targetXmlHash:'b'},formPreview:{component:{objectId:id,componentType:60},planHash:'p'},fieldChecks:[],libraryChecks:[],componentCandidates:[{previewStatus:'available',component_type:2,component_id:field,logical_name:'account'}]};
const selected=[{component_type:60,component_id:id},{component_type:2,component_id:field}];
test('blocks the legacy direct package path before any solution write',async()=>{
 let calls=0;
 const preview=await executeFormPackage(plan,selected,undefined,false,async()=>{calls++;return {}; });
 await assert.rejects(executeFormPackage(plan,selected,preview.planHash,true,async()=>{calls++;return {}; }),error=>error?.code==='D365_FORM_RELEASE_SCOPE_UNVERIFIED');
 assert.equal(calls,0);
});
test.skip('legacy direct execution: requires review and refreshes every preview after earlier writes',async()=>{const calls=[];let n=0;const add=async a=>{calls.push(a);return a.dry_run?{planHash:'p'+n}:{saved:true,id:++n}};const p=await executeFormPackage(plan,selected,undefined,false,add);assert.equal(calls.length,0);const r=await executeFormPackage(plan,selected,p.planHash,true,add);assert.equal(r.status,'completed');assert.equal(r.atomic,false);assert.deepEqual(calls.map(x=>x.dry_run),[true,false,true,false]);assert.equal(calls[3].expected_hash,'p1');});
test.skip('legacy direct execution: rejects stale plans and stops after uncertain write',async()=>{let writes=0;const add=async a=>{if(a.dry_run)return {planHash:'p'};if(++writes===2)throw new CrmRequestError('FAILED','x',{outcome:'unknown'});return {saved:true}};const p=await executeFormPackage(plan,selected,undefined,false,add);await assert.rejects(executeFormPackage(plan,selected,'bad',true,add));const r=await executeFormPackage(plan,selected,p.planHash,true,add);assert.equal(r.status,'stopped');assert.equal(r.steps.length,2);assert.equal(r.steps[1].outcome,'unknown');assert.equal(writes,2);});
test.skip('legacy direct execution: rechecks both forms before every mutation and stops without sending a stale next write',async()=>{let n=0;const add=async a=>a.dry_run?{planHash:'p'}:{saved:true};const p=await executeFormPackage(plan,selected,undefined,false,add);const r=await executeFormPackage(plan,selected,p.planHash,true,add,undefined,async()=>({sourceXmlHash:++n===1?'a':'changed',targetXmlHash:'b'}));assert.equal(r.status,'stopped');assert.equal(r.steps.length,2);assert.equal(r.steps[0].status,'added');assert.equal(r.steps[1].phase,'form_check');assert.equal(r.steps[1].outcome,'not_sent');});

test('retains manual review signal for unknown target candidates',async()=>{
 const next={...plan,componentCandidates:[{...plan.componentCandidates[0],reason:'unknown',requiresManualReview:true}]};
 const r=await executeFormPackage(next,selected,undefined,false,async()=>({}));assert.equal(r.selection[1].requiresManualReview,true);assert.equal(r.selection[1].reason,'unknown');
});

test.skip('legacy direct execution: preserves accepted but unverified writes and stops before the next component',async()=>{
 let writes=0;const add=async a=>{if(a.dry_run)return {planHash:'p'};writes++;throw new SolutionError('READBACK_FAILED','readback failed',{saved:true,phase:'readback'},{outcome:'not_sent'});};
 const p=await executeFormPackage(plan,selected,undefined,false,add);const r=await executeFormPackage(plan,selected,p.planHash,true,add);
 assert.equal(r.status,'stopped');assert.equal(writes,1);assert.equal(r.steps.length,1);assert.equal(r.steps[0].status,'accepted_unverified');assert.equal(r.steps[0].phase,'readback');assert.equal(r.steps[0].outcome,'accepted');assert.equal(r.steps[0].data.saved,true);
});

test.skip('legacy direct execution: stops before adding a component when its reviewed evidence changes',async()=>{
 const candidate={...plan.componentCandidates[0],name:'new_field'};const next={...plan,componentCandidates:[candidate]};let writes=0,checked;
 const add=async a=>a.dry_run?{planHash:'p'}:(writes++,{saved:true});const p=await executeFormPackage(next,selected,undefined,false,add);
 const r=await executeFormPackage(next,selected,p.planHash,true,add,undefined,undefined,async item=>{checked=item.name;throw Error('changed')});
 assert.equal(checked,'new_field');assert.equal(writes,1);assert.equal(r.status,'stopped');assert.equal(r.steps[1].phase,'component_check');assert.equal(r.steps[1].outcome,'not_sent');
});

test.skip('legacy direct execution: supports a 59-field selection and stops without replay when a later item fails',async()=>{
 const candidates=Array.from({length:59},(_,i)=>({previewStatus:'available',component_type:2,component_id:`${(i+1).toString(16).padStart(8,'0')}-1111-1111-1111-111111111111`,name:`field_${i}`,logical_name:'account'}));
 const p={...plan,componentCandidates:candidates},items=[{component_type:60,component_id:id},...candidates.map(x=>({component_type:2,component_id:x.component_id}))];let writes=0;
 const add=async x=>{if(x.dry_run)return {planHash:'p'};if(++writes===55)throw new CrmRequestError('FAILED','x',{outcome:'unknown'});return {saved:true}};
 const preview=await executeFormPackage(p,items,undefined,false,add),r=await executeFormPackage(p,items,preview.planHash,true,add);assert.equal(preview.selection.length,60);assert.equal(r.status,'stopped');assert.equal(writes,55);assert.equal(r.steps.length,55);assert.equal(r.steps.at(-1).outcome,'unknown');
 await assert.rejects(executeFormPackage(p,Array(242).fill(items[0]),undefined,false,add),/241/);
});

test.skip('legacy direct execution: keeps per-component outcome while bounding large membership deltas',async()=>{
 const many=Array.from({length:3000},(_,i)=>({id:i,value:'x'.repeat(100)}));const add=async a=>a.dry_run?{planHash:'p'}:{saved:true,readback:{status:'matched',membership:many},observedChanges:{added:many,removed:[],changed:[],attribution:'observed_between_nontransactional_reads'}};
 const p=await executeFormPackage(plan,selected,undefined,false,add),r=await executeFormPackage(plan,selected,p.planHash,true,add);
 assert.equal(r.steps.length,2);assert.equal(r.steps[0].result.readback.status,'matched');assert.equal(r.steps[0].result.observedChanges.added,3000);assert.ok(Buffer.byteLength(JSON.stringify(r))<10000);
});
test.skip('legacy direct execution: rechecks all reviewed field references before adding a global choice',async()=>{
 const candidate={previewStatus:'available',component_type:9,component_id:field,name:'new_choice',related_fields:['new_x','new_y']},p={...plan,componentCandidates:[candidate]},items=[{component_type:60,component_id:id},{component_type:9,component_id:field}];let seen;
 const add=async a=>a.dry_run?{planHash:'p',...(a.component_type===9?{component:{objectId:field,source:{Name:'new_choice'}}}:{})}:{saved:true},review=await executeFormPackage(p,items,undefined,false,add);const result=await executeFormPackage(p,items,review.planHash,true,add,undefined,undefined,async item=>{seen=item.related_fields;});assert.equal(result.status,'completed');assert.deepEqual(seen,['new_x','new_y']);
});
test.skip('legacy direct execution: stops before writing when the fresh global choice identity differs',async()=>{
 const candidate={previewStatus:'available',component_type:9,component_id:field,name:'new_choice',related_fields:['new_x']},p={...plan,componentCandidates:[candidate]},items=[{component_type:60,component_id:id},{component_type:9,component_id:field}];let writes=0;
 const add=async a=>a.dry_run?{planHash:'p',component:{objectId:field,source:{Name:'other_choice'}}}:(writes++,{saved:true}),review=await executeFormPackage(p,items,undefined,false,add),r=await executeFormPackage(p,items,review.planHash,true,add);
 assert.equal(r.status,'stopped');assert.equal(r.steps[1].phase,'preflight');assert.equal(r.steps[1].code,'D365_FORM_COMPONENT_IDENTITY_MISMATCH');assert.equal(r.steps[1].outcome,'not_sent');assert.equal(writes,1);
});
