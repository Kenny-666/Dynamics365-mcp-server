import {createHash} from 'node:crypto';

type Row=Record<string,any>;

/** Review complete UTF-8 component contents without returning their potentially sensitive contents. */
export function reviewComponentThreeWay(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A component review request is required.');
 const input=raw as Row;
 if(Object.keys(input).some(k=>!['name','baseline','source','target'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>300||/[\x00-\x1f]/.test(input.name))throw new Error('Invalid component name or arguments.');
 const digest=(value:unknown)=>{if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>2*1024*1024)throw new Error('Each component version must be UTF-8 text of at most 2 MiB.');return createHash('sha256').update(value,'utf8').digest('hex');};
 const baselineHash=digest(input.baseline),sourceHash=digest(input.source),targetHash=digest(input.target);
 const sourceChanged=sourceHash!==baselineHash,targetChanged=targetHash!==baselineHash;
 const classification=!sourceChanged&&!targetChanged?'unchanged':!sourceChanged?'target_only':!targetChanged?'source_only':sourceHash===targetHash?'same_change':'conflict';
 const reviewHash=createHash('sha256').update(JSON.stringify({name:input.name,baselineHash,sourceHash,targetHash,classification})).digest('hex');
 return {name:input.name,baselineHash,sourceHash,targetHash,classification,reviewHash,executionAllowed:false,limitations:['Whole-file hashes do not identify which requirement introduced a change.','Caller-supplied content and baseline provenance are not independently verified.','Different contents on both sides are conflicts even if individual edits could be merged.','No component is edited, merged, packaged, or deployed.']};
}
