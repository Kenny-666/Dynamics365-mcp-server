import test from 'node:test';
import assert from 'node:assert/strict';
import {SecurityEvidenceService} from '../src/services/securityEvidence.ts';
const role='11111111-1111-1111-1111-111111111111',privilege='22222222-2222-2222-2222-222222222222',row='33333333-3333-3333-3333-333333333333',bu='44444444-4444-4444-4444-444444444444';
test('returns bounded direct role privilege masks without claiming effective access',async()=>{const client={makeRequest:async endpoint=>endpoint.startsWith('/roles(')?{roleid:role,name:'Role',_businessunitid_value:bu}:{value:[{roleprivilegeid:row,roleid:role,privilegeid:privilege,privilegedepthmask:4}]}};const result=await new SecurityEvidenceService(client).privileges({role_id:role,top:1});assert.equal(result.items[0].depthMask,4);assert.equal(result.paging.limited,true);assert.match(result.note,/not computed/);});
test('rejects mismatched role privilege rows',async()=>{const client={makeRequest:async endpoint=>endpoint.startsWith('/roles(')?{roleid:role,name:'Role'}:{value:[{roleprivilegeid:row,roleid:bu,privilegeid:privilege,privilegedepthmask:4}]}};await assert.rejects(new SecurityEvidenceService(client).privileges({role_id:role}));});
