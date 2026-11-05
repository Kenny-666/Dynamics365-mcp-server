import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewReleaseDependencies} from '../src/services/formDependencyReview.ts';

const owner='11111111-1111-1111-1111-111111111111';
const unrelated='22222222-2222-2222-2222-222222222222';
const required='33333333-3333-3333-3333-333333333333';

const report={
 direction:'required',
 requested:{componentType:60,objectId:owner},
 paging:{complete:true},
 items:[{requiredcomponenttype:2,requiredcomponentobjectid:required,dependentcomponenttype:60,dependentcomponentobjectid:owner}]
};

test('accepts dependency rows bound to their requested component',()=>{
 const result=reviewReleaseDependencies({reports:[report],selected_components:[{component_type:60,component_id:owner}],target_evidence:[]});
 assert.equal(result.unresolvedCount,1);
 assert.equal(result.records[0].owner,`60:${owner}`);
});

test('rejects dependency rows that are unrelated to the requested component',()=>{
 const mismatched={...report,items:[{...report.items[0],dependentcomponentobjectid:unrelated}]};
 assert.throws(()=>reviewReleaseDependencies({reports:[mismatched],selected_components:[{component_type:60,component_id:owner}],target_evidence:[]}),/does not belong/);
});
