import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {handleToolCall} from '../src/tool_handler.ts';
import {D365AuthService} from '../src/services/d365Auth.ts';
test('enabled audit wraps write tool dispatch and records validation failures without input',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'d365-audit-dispatch-'));const settings={D365_AUDIT_WRITES:'true',D365_JOURNAL_DIR:dir,D365_PROFILE_AUDITTEST__AUTH_TYPE:'op_ad',D365_PROFILE_AUDITTEST__ORG_URL:'https://audit.invalid',D365_PROFILE_AUDITTEST__AD_USERNAME:'u',D365_PROFILE_AUDITTEST__AD_DOMAIN:'d',D365_PROFILE_AUDITTEST__AD_PASSWORD:'p'};const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
 const original=D365AuthService.prototype.makeRequest;D365AuthService.prototype.makeRequest=async()=>({UserId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',OrganizationId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'});
 try{await assert.rejects(handleToolCall('update_existing_record',{id:'invalid',data:{name:'private-value'}},{environmentProfile:'audittest'}));const files=await readdir(dir);assert.equal(files.length,1);const record=JSON.parse(await readFile(join(dir,files[0]),'utf8'));assert.equal(record.toolName,'update_existing_record');assert.equal(record.status,'call_failed');assert.ok(!JSON.stringify(record).includes('private-value'));}
 finally{D365AuthService.prototype.makeRequest=original;for(const k of Object.keys(settings)){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}await rm(dir,{recursive:true,force:true});}
});
