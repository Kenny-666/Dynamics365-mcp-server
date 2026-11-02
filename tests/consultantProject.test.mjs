import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {consultantProject} from '../src/services/consultantProject.ts';
import {inspectArchive} from '../src/services/solutionPackage.ts';
async function fixture(run){const root=await mkdtemp(join(tmpdir(),'d365-consultant-')),old=process.env.D365_CONSULTANT_DIR;process.env.D365_CONSULTANT_DIR=root;try{await run(root);}finally{if(old===undefined)delete process.env.D365_CONSULTANT_DIR;else process.env.D365_CONSULTANT_DIR=old;await rm(root,{recursive:true,force:true});}}
test('project creates editable artifacts, compares versions and restores without overwriting',async()=>fixture(async root=>{
 await consultantProject({action:'create_project',project_id:'Demo',name:'实施项目'});
 const first=await consultantProject({action:'generate_document',project_id:'Demo',title:'FS',spec:{title:'需求',sections:[{heading:'范围',body:'第一版'}]}});
 const second=await consultantProject({action:'generate_document',project_id:'Demo',title:'FS',spec:{title:'需求',sections:[{heading:'范围',body:'第二版'}]}});
 const diff=await consultantProject({action:'compare_document_versions',project_id:'Demo',from_asset_id:first.assetId,to_asset_id:second.assetId});assert.equal(diff.changes[0].change,'modified');
 const restored=await consultantProject({action:'restore_asset',project_id:'Demo',asset_id:first.assetId});assert.notEqual(restored.assetId,first.assetId);assert.equal(restored.sha256,first.sha256);
 const uat=await consultantProject({action:'generate_uat',project_id:'Demo',title:'UAT',spec:{cases:[{id:'T1',scenario:'客户',expected:'成功'}]}});
 const html=await consultantProject({action:'generate_prototype',project_id:'Demo',title:'原型',spec:{title:'客户',fields:[{label:'名称'}]}});
 assert.ok(inspectArchive(await readFile(first.path)).entries.some(e=>e.name==='word/document.xml'));assert.ok(inspectArchive(await readFile(uat.path)).entries.some(e=>e.name==='xl/worksheets/sheet1.xml'));assert.match(await readFile(html.path,'utf8'),/离线原型/);
 const listing=await consultantProject({action:'list_assets',project_id:'Demo'});assert.equal(listing.count,5);assert.ok(listing.items.every(item=>item.path.startsWith(join(root,'Demo'))));
}));
test('imports supported material and rejects unregistered paths and traversal',async()=>fixture(async root=>{
 await consultantProject({action:'create_project',project_id:'Demo',name:'Demo'});const source=join(root,'requirements.txt');await writeFile(source,'original');const result=await consultantProject({action:'import_material',project_id:'Demo',file_path:source});assert.equal(await readFile(result.path,'utf8'),'original');
 await assert.rejects(consultantProject({action:'list_assets',project_id:'../escape'}));await mkdir(join(root,'unregistered'));await assert.rejects(consultantProject({action:'list_assets',project_id:'unregistered'}),/manifest/);await assert.rejects(consultantProject({action:'import_material',project_id:'Demo',file_path:join(root,'bad.exe')}),/extension/);
}));
test('optional consultant tool works without a CRM configuration',async()=>fixture(async()=>{
 const {handleToolCall,selectTools}=await import('../src/tool_handler.ts');assert.ok(selectTools('consultant').some(t=>t.name==='manage_consultant_project'));assert.ok(!selectTools('all').some(t=>t.name==='manage_consultant_project'));
 const result=await handleToolCall('manage_consultant_project',{action:'create_project',project_id:'NoCrm',name:'Independent'});assert.equal(result.projectId,'NoCrm');
}));
