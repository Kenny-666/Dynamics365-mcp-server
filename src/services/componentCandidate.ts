import {createHash} from 'node:crypto';

type Row=Record<string,any>;
const digest=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');

/** Construct an explicit text candidate locally. Offsets use JavaScript UTF-16 code units. */
export function prepareComponentCandidate(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Candidate request must be an object.');
 const input=raw as Row;
 if(Object.keys(input).some(k=>!['name','baseline','source','target','baseline_hash','source_hash','target_hash','hunks'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>300||/[\x00-\x1f]/.test(input.name))throw new Error('Invalid candidate arguments.');
 const sides=['baseline','source','target'] as const;
 for(const side of sides){if(typeof input[side]!=='string'||Buffer.byteLength(input[side],'utf8')>2*1024*1024||typeof input[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(input[side+'_hash'])||digest(input[side])!==input[side+'_hash'])throw new Error('Component content or reviewed hash is invalid for '+side+'.');}
 if(input.baseline_hash!==input.target_hash)throw new Error('Target differs from baseline; an independently reviewed merge is required.');
 if(!Array.isArray(input.hunks)||!input.hunks.length||input.hunks.length>100)throw new Error('Select 1–100 text hunks.');
 const hunks=input.hunks.map((rawHunk:unknown)=>{
  if(!rawHunk||typeof rawHunk!=='object'||Array.isArray(rawHunk))throw new Error('Invalid text hunk.');
  const h=rawHunk as Row;if(Object.keys(h).some(k=>!['baseline_start','baseline_end','source_start','source_end'].includes(k)))throw new Error('Unexpected text hunk field.');
  for(const k of ['baseline_start','baseline_end','source_start','source_end'])if(!Number.isSafeInteger(h[k])||h[k]<0)throw new Error('Text hunk offsets must be nonnegative integers.');
  if(h.baseline_start>h.baseline_end||h.baseline_end>input.baseline.length||h.source_start>h.source_end||h.source_end>input.source.length)throw new Error('Text hunk offsets exceed the reviewed versions.');
  const oldText=input.baseline.slice(h.baseline_start,h.baseline_end),newText=input.source.slice(h.source_start,h.source_end);
  if(oldText===newText)throw new Error('Selected hunk does not change the baseline.');
  return {baseline_start:h.baseline_start,baseline_end:h.baseline_end,source_start:h.source_start,source_end:h.source_end,oldHash:digest(oldText),newHash:digest(newText),newText};
 });
 hunks.sort((a:Row,b:Row)=>a.baseline_start-b.baseline_start||a.baseline_end-b.baseline_end);
 for(let i=1;i<hunks.length;i++)if(hunks[i].baseline_start<hunks[i-1].baseline_end||hunks[i].baseline_start===hunks[i-1].baseline_start)throw new Error('Baseline hunk ranges overlap or are ambiguous.');
 const sourceOrder=[...hunks].sort((a:Row,b:Row)=>a.source_start-b.source_start||a.source_end-b.source_end);
 for(let i=1;i<sourceOrder.length;i++)if(sourceOrder[i].source_start<sourceOrder[i-1].source_end||sourceOrder[i].source_start===sourceOrder[i-1].source_start)throw new Error('Source hunk ranges overlap or are ambiguous.');
 let candidate='',cursor=0;for(const h of hunks){candidate+=input.target.slice(cursor,h.baseline_start)+h.newText;cursor=h.baseline_end;}candidate+=input.target.slice(cursor);
 if(Buffer.byteLength(candidate,'utf8')>2*1024*1024)throw new Error('Candidate exceeds the 2 MiB limit.');
 const candidateHash=digest(candidate),selection=hunks.map(({newText,...rest}:Row)=>rest),reviewHash=digest(JSON.stringify({name:input.name,baselineHash:input.baseline_hash,sourceHash:input.source_hash,targetHash:input.target_hash,candidateHash,selection}));
 return {name:input.name,candidate,candidateHash,reviewHash,selection,executionAllowed:false,limitations:['Offsets use UTF-16 code units; callers must independently review each selected source and baseline range.','Selections do not establish semantic correctness, dependency completeness, or requirement ownership.','Baseline provenance is not authenticated.','No content is saved to CRM, published, or packaged.']};
}
