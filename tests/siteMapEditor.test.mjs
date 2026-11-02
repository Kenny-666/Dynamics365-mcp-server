import test from 'node:test';
import assert from 'node:assert/strict';
import { editSiteMap } from '../src/services/siteMapEditor.ts';
const xml = '<SiteMap><Area Id="sales"><Group Id="existing"><SubArea Id="old" Entity="account"/></Group></Area></SiteMap>';
test('edits navigation locally and leaves unrelated content intact', () => {
 const result = editSiteMap({xml,edits:[{action:'add_group',id:'newgroup',parent_id:'sales',title:'业务'}, {action:'add_subarea',id:'cases',parent_id:'newgroup',entity:'incident',title:'案例'}, {action:'rename',id:'old',title:'客户'}]});
 assert.equal(result.saved,false); assert.equal(result.published,false);
 assert.match(result.xml,/Id="cases"/); assert.match(result.xml,/Entity="incident"/); assert.match(result.xml,/Title="客户"/);
 assert.notEqual(result.sourceHash,result.candidateHash);
});
test('rejects ambiguous and malformed edits without a partial result', () => {
 assert.throws(() => editSiteMap({xml,edits:[{action:'add_group',id:'existing',parent_id:'sales'}]}),/already exists/);
 assert.throws(() => editSiteMap({xml,edits:[{action:'add_subarea',id:'x',parent_id:'existing',entity:'account',url:'/x'}]}),/exactly one/);
 assert.throws(() => editSiteMap({xml:'<!DOCTYPE SiteMap [<!ENTITY x "a">]><SiteMap/>',edits:[{action:'rename',id:'x',title:'x'}]}));
 assert.throws(() => editSiteMap({xml:'<SiteMap><Area Id="a"/><Area Id="a"/></SiteMap>',edits:[{action:'add_group',id:'g',parent_id:'a'}]}),/ambiguous/);
});
test('localized titles update one LCID while preserving other languages and escaping XML', () => {
 const source='<SiteMap><Area Id="sales"><Titles><Title LCID="1033" Title="Sales"/><Title LCID="2052" Title="销售"/></Titles></Area></SiteMap>';
 const result=editSiteMap({xml:source,edits:[{action:'set_localized_title',id:'sales',language_code:2052,title:'客户 & 服务'},{action:'set_localized_title',id:'sales',language_code:1041,title:'営業'}]});
 assert.match(result.xml,/LCID="1033" Title="Sales"/);assert.match(result.xml,/LCID="2052" Title="客户 &amp; 服务"/);assert.match(result.xml,/LCID="1041" Title="営業"/);
});
test('rejects invalid languages and duplicate localized titles',()=>{
 const duplicate='<SiteMap><Area Id="a"><Titles><Title LCID="2052" Title="一"/><Title LCID="2052" Title="二"/></Titles></Area></SiteMap>';
 assert.throws(()=>editSiteMap({xml:duplicate,edits:[{action:'set_localized_title',id:'a',language_code:2052,title:'三'}]}),/Duplicate/);
 assert.throws(()=>editSiteMap({xml:duplicate,edits:[{action:'set_localized_title',id:'a',language_code:0,title:'三'}]}),/LCID/);
});
