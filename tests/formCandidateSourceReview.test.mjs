import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCandidateSourceEvidence} from '../src/services/formCandidateScope.ts';

const form = formxml => ({kind:'form',type:2,logicalName:'account',xml:{formxml}});

test('accepts an added node only when the complete child structure matches the source',()=>{
 const target=form('<form><a/><b/></form>');
 const source=form('<form><a/><b/><c/></form>');
 const result=inspectCandidateSourceEvidence(source,source,target);
 assert.equal(result.status,'selected_values_observed');
});

test('accepts a source-observed node deletion',()=>{
 const target=form('<form><a/><b/><c/></form>');
 const source=form('<form><a/><c/></form>');
 const result=inspectCandidateSourceEvidence(source,source,target);
 assert.equal(result.status,'selected_values_observed');
});

test('accepts a reorder only when the candidate exactly matches the source structure',()=>{
 const target=form('<form><a/><b/><c/></form>');
 const source=form('<form><c/><a/><b/></form>');
 const result=inspectCandidateSourceEvidence(source,source,target);
 assert.equal(result.status,'selected_values_observed');
});

test('rejects a candidate that reorders existing nodes while selecting an added node',()=>{
 const target=form('<form><a/><b/></form>');
 const source=form('<form><a/><b/><c/></form>');
 const candidate=form('<form><b/><a/><c/></form>');
 const result=inspectCandidateSourceEvidence(candidate,source,target);
 assert.equal(result.status,'unmatched');
 assert.ok(result.issues.some(issue=>issue.reason==='child_structure_not_exactly_observed'));
});

test('rejects a partial structural selection when the source has unselected nodes',()=>{
 const target=form('<form><a/><b/></form>');
 const source=form('<form><a/><b/><c/><d/></form>');
 const candidate=form('<form><a/><b/><c/></form>');
 const result=inspectCandidateSourceEvidence(candidate,source,target);
 assert.equal(result.status,'unmatched');
 assert.ok(result.issues.some(issue=>issue.reason==='child_structure_not_exactly_observed'));
});
