import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareFormDefinitions} from '../src/services/formComparison.ts';
const form=(xml)=>({kind:'form',type:2,logicalName:'account',id:'1',xml:{formxml:xml}});
test('compares form XML while preserving ordering, attributes, IDs and explicit unknown elements',()=>{
 const a=form('<form><tabs><tab id="a"><labels><label description="New"/></labels><custom x="1"/></tab></tabs></form>');
 const b=form('<form>\n <tabs><tab id="a"><labels><label description="Old"/></labels></tab></tabs>\n</form>');
 const r=compareFormDefinitions(a,b);assert.equal(r.changes.length,3);assert.ok(r.changes.some(x=>x.path.endsWith('/custom[1]')&&x.kind==='source_only'));assert.ok(r.changes.some(x=>x.path.endsWith('/label[1]')&&x.kind==='changed'));
});
test('rejects different tables, non-main forms and malformed XML',()=>{
 const a=form('<form/>');assert.throws(()=>compareFormDefinitions(a,{...a,logicalName:'contact'}));assert.throws(()=>compareFormDefinitions(a,{...a,type:1}));assert.throws(()=>compareFormDefinitions(a,form('<form><bad></form>')));
});
test('reports field and library reference differences without asserting dependency closure',()=>{
 const a=form('<form><tabs><tab><section><control datafieldname="new_x"/></section></tab></tabs><formLibraries><Library name="new_test.js"/></formLibraries></form>');
 const b=form('<form><tabs><tab><section><control datafieldname="name"/></section></tab></tabs><formLibraries/></form>');
 const r=compareFormDefinitions(a,b);assert.deepEqual(r.references.fields.sourceOnly,['new_x']);assert.deepEqual(r.references.fields.targetOnly,['name']);assert.deepEqual(r.references.libraries.sourceOnly,['new_test.js']);assert.ok(r.changes.some(x=>x.category==='control'));
});

test('detects reordering of differently named siblings',()=>{
 const result=compareFormDefinitions(form('<form><alpha/><beta/></form>'),form('<form><beta/><alpha/></form>'));
 assert.equal(result.changes.length,1);assert.deepEqual(result.changes[0].source.childOrder,['alpha','beta']);assert.deepEqual(result.changes[0].target.childOrder,['beta','alpha']);
});
test('reports moves only for unambiguous matching IDs',()=>{
 const a=form('<form><section id="a"><control id="one"/></section><section id="b"/></form>');
 const b=form('<form><section id="a"/><section id="b"><control id="one"/></section></form>');
 const r=compareFormDefinitions(a,b);assert.equal(r.moves.length,1);assert.equal(r.moves[0].id,'control:one');
 const d=form('<form><control id="one"/><control id="one"/></form>');const ambiguous=compareFormDefinitions(d,b);assert.deepEqual(ambiguous.ambiguousIds,['control:one']);assert.equal(ambiguous.moves.length,0);
});
test('compares uniquely matched node attributes after movement without inferring descendant equality',()=>{
 const a=form('<form><section id="a"><control id="one" disabled="true"/></section><section id="b"/></form>');
 const b=form('<form><section id="a"/><section id="b"><control id="one" disabled="false"/></section></form>');
 const r=compareFormDefinitions(a,b),c=r.identityChanges.find(x=>x.id==='control:one');assert.equal(c.scope,'node_only');assert.deepEqual(c.attributes,[{name:'disabled',source:'true',target:'false'}]);assert.ok(r.moves.some(x=>x.id==='control:one'));
});
test('does not produce identity comparisons for duplicated IDs',()=>{
 const a=form('<form><control id="one" disabled="true"/><control id="one"/></form>'),b=form('<form><control id="one" disabled="false"/></form>');const r=compareFormDefinitions(a,b);assert.deepEqual(r.ambiguousIds,['control:one']);assert.equal(r.identityChanges.length,0);
});
test('reports matching configured URLs without claiming distinct URLs prove distinct organizations',()=>{
 const a={...form('<form/>'),environment:{orgUrl:'https://CRM.example:443/Org/'}},b={...a,environment:{orgUrl:'https://crm.example/Org'}};
 assert.equal(compareFormDefinitions(a,b).endpointRelationship,'same_configured_url');assert.equal(compareFormDefinitions(a,{...b,environment:{orgUrl:'https://alias.example/Org'}}).endpointRelationship,'different_configured_url');assert.equal(compareFormDefinitions(a,form('<form/>')).endpointRelationship,'unknown');assert.ok(compareFormDefinitions(a,b).limitations.some(x=>x.includes('aliases')));
});
test('uses organization IDs to identify aliases and preserves unavailable identity',()=>{
 const id='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',a={...form('<form/>'),environment:{orgUrl:'https://a.example',organizationId:id}},b={...a,environment:{orgUrl:'https://b.example',organizationId:id.toUpperCase()}};
 const same=compareFormDefinitions(a,b);assert.equal(same.endpointRelationship,'different_configured_url');assert.equal(same.organizationRelationship,'same_organization');assert.equal(compareFormDefinitions(a,{...b,environment:{...b.environment,organizationId:other}}).organizationRelationship,'different_organizations');assert.equal(compareFormDefinitions(a,{...b,environment:{...b.environment,organizationId:null}}).organizationRelationship,'unknown');
});
