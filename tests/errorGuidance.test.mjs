import test from 'node:test';
import assert from 'node:assert/strict';
import {CrmRequestError,toolErrorPayload} from '../src/errors.ts';
test('error guidance prioritizes unknown outcomes over conflict retry guidance',()=>{
 const result=toolErrorPayload(new CrmRequestError('D365_CONCURRENCY_CONFLICT','safe',{status:412,outcome:'unknown'}));
 assert.match(result.guidance[0],/do not automatically retry/);assert.doesNotMatch(result.guidance[0],/new preview/);
});
test('actionable guidance distinguishes concurrency, permissions and metadata',()=>{
 assert.match(toolErrorPayload(new CrmRequestError('D365_CONCURRENCY_CONFLICT','safe',{status:412,outcome:'rejected'})).guidance[0],/ETag/);
 assert.match(toolErrorPayload(new CrmRequestError('D365_HTTP_ERROR','safe',{status:403})).guidance[0],/privileges/);
 assert.match(toolErrorPayload(new CrmRequestError('D365_METADATA_INVALID','safe')).guidance[0],/metadata/);
 assert.equal(toolErrorPayload(new CrmRequestError('OTHER','safe')).guidance,undefined);
});
