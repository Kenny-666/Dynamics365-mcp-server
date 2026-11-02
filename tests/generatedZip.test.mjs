import test from 'node:test';
import assert from 'node:assert/strict';
import {generatedZip} from '../src/services/generatedZip.ts';
import {inspectArchive} from '../src/services/solutionPackage.ts';
test('generated Office archive roundtrips bounded UTF-8 content without extraction',()=>{const b=generatedZip({'word/document.xml':'<doc>中文 &amp; test</doc>','[Content_Types].xml':'<Types/>'});const result=inspectArchive(b,{'word/document.xml':4096});assert.equal(result.payloads.get('word/document.xml').toString(),'<doc>中文 &amp; test</doc>');assert.equal(result.entries.length,2);});
test('generated archive rejects traversal paths',()=>{assert.throws(()=>generatedZip({'../bad':'x'}));});
