// Run with: node --import tsx scripts/qa-local.mjs
import '../tests/fixtures/deny-network.cjs';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tools} from '../src/tool_handler.ts';
import {inspectSolutionPackage} from '../src/services/solutionPackage.ts';
import {archive} from '../tests/solutionTransfer.fixture.mjs';
const require=createRequire(import.meta.url);
// The MCP SDK's installed schema validator; this QA command requires development dependencies.
const Ajv=require('ajv');const ajv=new Ajv({strict:false,validateFormats:false});
assert.equal(tools.length,84);assert.equal(new Set(tools.map(tool=>tool.name)).size,84);
for(const tool of tools){assert.match(tool.name,/^[a-zA-Z_][a-zA-Z0-9_]*$/);assert.equal(tool.inputSchema.type,'object');ajv.compile(tool.inputSchema);}
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const discovered=(await readdir(new URL('../tests/',import.meta.url))).filter(name=>name.endsWith('.test.mjs')).sort();
const scheduled=[...pkg.scripts.test.matchAll(/tests\/([^\s]+\.test\.mjs)/g)].map(match=>match[1]).sort();assert.deepEqual(scheduled,discovered);
let seed=0xD3652026,accepted=0,rejected=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for(let iteration=0;iteration<256;iteration++){
  let bytes=Buffer.from(archive());
  if(iteration%4===0) bytes=bytes.subarray(0,random()%bytes.length);
  else for(let change=0;change<1+iteration%8;change++) bytes[random()%bytes.length]^=1<<(random()%8);
  try {const result=await inspectSolutionPackage({content_base64:bytes.toString('base64')});assert.equal(result.success,true);accepted++;}
  catch(error){assert.equal(error.code,'D365_SOLUTION_PACKAGE',`Unexpected rejection: ${error.code} ${error.message}`);rejected++;}
}
console.log(JSON.stringify({node:process.version,tools:tools.length,schemasCompiled:tools.length,testFilesScheduled:discovered.length,zipMutationSeed:'0xD3652026',zipMutationCases:256,accepted,rejected,network:'denied by test fixture'},null,2));
