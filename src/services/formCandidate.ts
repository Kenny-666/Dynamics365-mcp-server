import {XMLSerializer, type Element} from '@xmldom/xmldom';
import {uiXml,xmlHash} from './modelUiXml.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;
const allowed=new Set(['disabled','visible','showlabel','labelid']);

/** Construct a local candidate only for explicit attributes on stable, unique native IDs. */
export function prepareFormCandidate(raw:unknown,workingTarget?:string) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Candidate request must be an object.');
 const input=raw as Row;
 if(Object.keys(input).some(k=>!['baseline','source','target','baseline_hash','source_hash','target_hash','operations'].includes(k)))throw new Error('Unexpected candidate argument.');
 const versions=['baseline','source','target'] as const;
 for(const side of versions)if(typeof input[side]!=='string'||Buffer.byteLength(input[side],'utf8')>4*1024*1024||typeof input[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(input[side+'_hash']))throw new Error('Each XML definition and its expected hash are required.');
 const docs=Object.fromEntries(versions.map(side=>[side,uiXml(side==='target'&&workingTarget!==undefined?workingTarget:input[side],'form')]));
 const hashes=Object.fromEntries(versions.map(side=>[side,xmlHash(input[side],'form')]));
 for(const side of versions)if(hashes[side]!==input[side+'_hash'])throw new Error('Form definition differs from the reviewed hash.');
 if(!Array.isArray(input.operations)||input.operations.length<1||input.operations.length>50)throw new Error('Select 1–50 operations.');
 const seen=new Set<string>();
 const operations=input.operations.map((v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid operation.');const op=v as Row;if(Object.keys(op).some(k=>!['element','id','attribute'].includes(k))||!['tab','section','control'].includes(op.element)||typeof op.id!=='string'||!op.id.trim()||op.id.length>200||typeof op.attribute!=='string'||!allowed.has(op.attribute))throw new Error('Unsupported candidate operation.');const key=[op.element,op.id.toLowerCase(),op.attribute].join(':');if(seen.has(key))throw new Error('Duplicate candidate operation.');seen.add(key);return {element:op.element,id:op.id,attribute:op.attribute};});
 const find=(side:string,op:Row):Element=>{const nodes=Array.from(docs[side].getElementsByTagName(op.element) as ArrayLike<Element>).filter(x=>x.getAttribute('id')?.toLowerCase()===op.id.toLowerCase());const [node]=nodes;if(nodes.length!==1||!node)throw new Error('Selected element ID is absent or ambiguous in '+side+'.');return node;};
 const result:Row[]=[];
 for(const op of operations){const base=find('baseline',op),source=find('source',op),target=find('target',op);const value=(node:Element)=>node.hasAttribute(op.attribute)?node.getAttribute(op.attribute):null;const before=value(base),selected=value(source),current=value(target);if(selected===before)throw new Error('Selected attribute does not differ from baseline.');if(current!==before&&current!==selected)throw new Error('Target and source changed the same attribute differently.');if(selected===null)target.removeAttribute(op.attribute);else target.setAttribute(op.attribute,selected);result.push({...op,baseline:before,source:selected,targetBefore:current});}
 const root=docs.target.documentElement;if(!root)throw new Error('Target form has no document element.');const xml=new XMLSerializer().serializeToString(root);uiXml(xml,'form');const candidateHash=xmlHash(xml,'form');
 return {candidate:{formxml:xml},candidateHash,reviewHash:hash({hashes,operations:result,candidateHash}),operations:result,executionAllowed:false,limitations:['Only explicitly selected supported attributes are copied. Element insertions, deletions, ordering, scripts and dependencies are not handled.','Input provenance and published state are not verified.','The candidate is not imported, saved, published or packaged.','Platform normalization and form layering require independent review.']};
}
