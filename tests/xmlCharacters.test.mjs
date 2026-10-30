import './fixtures/deny-network.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseXml} from '../src/services/queryXml.ts';
import {OperationMetadata} from '../src/services/apiOperationMetadata.ts';
import {ribbonDocument} from '../src/services/ribbonXml.ts';
import {inspectSolutionPackage} from '../src/services/solutionPackage.ts';
import {summarizeImportLog} from '../src/services/solutionImportLog.ts';
import {archive,manifest} from './solutionTransfer.fixture.mjs';
import {csdl} from './ribbon.fixture.mjs';
import {validXmlCharacters} from '../src/services/xmlCharacters.ts';
test('XML 1.0 character boundaries reject invalid literals and references',()=>{
  for(const value of [0,1,8,11,12,31,0xD800,0xDFFF,0xFFFE,0xFFFF,0x110000]){
    if(value<=0x10FFFF) assert.equal(validXmlCharacters('<a>'+String.fromCodePoint(value)+'</a>'),false);
    assert.equal(validXmlCharacters('<a>&#'+value+';</a>'),false);
    assert.equal(validXmlCharacters('<a>&#x'+value.toString(16)+';</a>'),false);
  }
  for(const ref of ['&#;','&#x;','&#X41;','&#12x;','&#-1;','&#999999999999999999999;']) assert.equal(validXmlCharacters('<a>'+ref+'</a>'),false);
});
test('XML legal characters, supplementary Unicode and inert references remain valid',()=>{
  for(const value of [9,10,13,32,0xD7FF,0xE000,0xFFFD,0x10000,0x10FFFF]){
    const source='<fetch><entity name="account"><label>'+String.fromCodePoint(value)+'&#'+value+';&#x'+value.toString(16)+';</label></entity></fetch>';
    assert.equal(validXmlCharacters(source),true);
    // The existing strict DOM warning policy also rejects literal replacement characters.
    if(value!==0xFFFD) assert.ok(parseXml(source,'fetch'));
  }
  const source='<fetch><!-- &#0; --><entity name="account"><label><![CDATA[&#0;]]>&amp;#0;</label><?test &#0;?></entity></fetch>';
  assert.equal(validXmlCharacters(source),true);assert.ok(parseXml(source,'fetch'));
});
for(const [label,invalid] of [['literal NUL','\u0000'],['numeric NUL reference','&#0;']]){
  test(`FetchXML rejects ${label}`,()=>assert.throws(()=>parseXml('<fetch>'+invalid+'<entity name="account"/></fetch>','fetch')));
  test(`CSDL rejects ${label}`,()=>assert.throws(()=>new OperationMetadata(csdl.replace('<EnumType ',invalid+'<EnumType '))));
  test(`Ribbon XML rejects ${label}`,()=>assert.throws(()=>ribbonDocument('<RibbonDiffXml><Label>'+invalid+'</Label></RibbonDiffXml>',['RibbonDiffXml'])));
  test(`solution manifest rejects ${label}`,async()=>{
    const bytes=archive({manifest:manifest.replace('</SolutionManifest>','<Description>'+invalid+'</Description></SolutionManifest>')});
    await assert.rejects(inspectSolutionPackage({content_base64:bytes.toString('base64')}));
  });
  test(`import log rejects ${label}`,()=>assert.throws(()=>summarizeImportLog('<importexportxml><result result="failure" errortext="'+invalid+'"/></importexportxml>',10,false,128)));
}
