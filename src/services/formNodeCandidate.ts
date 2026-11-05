import {XMLSerializer,type Element,type Node} from '@xmldom/xmldom';
import {uiXml,xmlHash} from './modelUiXml.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;
const serializer=new XMLSerializer();
const nodeHash=(node:Node)=>hash(serializer.serializeToString(node));

export function inspectFormNode(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Node inspection request must be an object.');
 const a=raw as Row;if(Object.keys(a).some(k=>!['formxml','element','id'].includes(k))||typeof a.formxml!=='string'||!['tab','section','control'].includes(a.element)||typeof a.id!=='string'||!a.id.trim()||a.id.length>200)throw new Error('Invalid node inspection request.');
 const document=uiXml(a.formxml,'form'),nodes=Array.from(document.getElementsByTagName(a.element)).filter(x=>x.getAttribute('id')?.toLowerCase()===a.id.toLowerCase());
 if(nodes.length!==1)throw new Error('Selected node must be unique and present.');
 const xml=serializer.serializeToString(nodes[0]);return {element:a.element,id:a.id,nodeXml:xml,nodeHash:nodeHash(nodes[0]),formHash:xmlHash(a.formxml,'form'),limitations:['Review the entire subtree before selecting it.','Serialization hash is not a semantic or provenance guarantee.']};
}

/** Replace explicitly approved, existing subtrees in a local candidate; never write to CRM. */
export function prepareFormNodeCandidate(raw:unknown,workingTarget?:string) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Candidate request must be an object.');
 const a=raw as Row;
 if(Object.keys(a).some(k=>!['baseline','source','target','baseline_hash','source_hash','target_hash','nodes'].includes(k)))throw new Error('Unexpected candidate argument.');
 const sides=['baseline','source','target'] as const;
 for(const side of sides)if(typeof a[side]!=='string'||typeof a[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(a[side+'_hash'])||xmlHash(a[side],'form')!==a[side+'_hash'])throw new Error('A matching reviewed XML hash is required for '+side+'.');
 const docs=Object.fromEntries(sides.map(side=>[side,uiXml(side==='target'&&workingTarget!==undefined?workingTarget:a[side],'form')]));
 if(!Array.isArray(a.nodes)||!a.nodes.length||a.nodes.length>50)throw new Error('Select 1–50 existing nodes.');
 const seen=new Set<string>();
 const selected=a.nodes.map((rawNode:unknown)=>{if(!rawNode||typeof rawNode!=='object'||Array.isArray(rawNode))throw new Error('Invalid selected node.');const n=rawNode as Row;if(Object.keys(n).some(k=>!['element','id','source_node_hash'].includes(k))||!['tab','section','control'].includes(n.element)||typeof n.id!=='string'||!n.id.trim()||n.id.length>200||typeof n.source_node_hash!=='string'||!/^[a-f0-9]{64}$/.test(n.source_node_hash))throw new Error('Invalid selected node identity or hash.');const key=n.element+':'+n.id.toLowerCase();if(seen.has(key))throw new Error('Duplicate selected node.');seen.add(key);return {element:n.element,id:n.id,source_node_hash:n.source_node_hash};});
 const find=(side:string,n:Row):Element=>{const found=Array.from(docs[side].getElementsByTagName(n.element) as ArrayLike<Element>).filter(x=>x.getAttribute('id')?.toLowerCase()===n.id.toLowerCase());const [node]=found;if(found.length!==1||!node)throw new Error('Selected node must be unique and present in '+side+'.');return node;};
 // Tabs and sections commonly sit under structural wrappers without an ID.
 // Anchor those wrappers to their nearest identified ancestor (or the form root),
 // retaining sibling positions so a move is not mistaken for an in-place edit.
 const parentIdentity=(node:Element)=>{let parent=node.parentNode as Element|null;const path:string[]=[];while(parent&&parent.nodeType===1){const id=parent.getAttribute('id');if(id){path.unshift(parent.tagName+':'+id.toLowerCase());return path.join('/');}const owner=parent.parentNode as Element|null;if(!owner||owner.nodeType!==1){if(parent.tagName!=='form')throw new Error('Selected node has no stable form parent.');path.unshift('form');return path.join('/');}const siblings=Array.from(owner.childNodes).filter(x=>x.nodeType===1&&(x as Element).tagName===parent!.tagName);const position=siblings.indexOf(parent);if(position<0)throw new Error('Selected node parent is ambiguous.');path.unshift(parent.tagName+'['+(position+1)+']');parent=owner;}throw new Error('Selected node has no stable form parent.');};
 const entries=selected.map((n:Row)=>{const baseline=find('baseline',n),source=find('source',n),target=find('target',n);if(parentIdentity(baseline)!==parentIdentity(source)||parentIdentity(baseline)!==parentIdentity(target))throw new Error('Moved nodes require manual resolution.');const baseHash=nodeHash(baseline),sourceHash=nodeHash(source),targetHash=nodeHash(target);if(sourceHash!==n.source_node_hash)throw new Error('Source subtree differs from approved hash.');if(sourceHash===baseHash)throw new Error('Selected subtree has no source change.');if(targetHash!==baseHash&&targetHash!==sourceHash)throw new Error('Target subtree conflicts with selected change.');return {n,baseline,source,target,baseHash,sourceHash,targetHash};});
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){let p:Node|null=entries[i].target.parentNode;while(p){if(p===entries[j].target)throw new Error('Overlapping selected nodes are not supported.');p=p.parentNode;}p=entries[j].target.parentNode;while(p){if(p===entries[i].target)throw new Error('Overlapping selected nodes are not supported.');p=p.parentNode;}}
 const operations=entries.map(e=>({element:e.n.element,id:e.n.id,baselineNodeHash:e.baseHash,sourceNodeHash:e.sourceHash,targetNodeHash:e.targetHash}));
 for(const e of entries)e.target.parentNode!.replaceChild(docs.target.importNode(e.source,true),e.target);
 const root=docs.target.documentElement;if(!root)throw new Error('Target form has no document element.');const formxml=serializer.serializeToString(root);uiXml(formxml,'form');const candidateHash=xmlHash(formxml,'form');
 return {candidate:{formxml},candidateHash,operations,reviewHash:hash({baseline:a.baseline_hash,source:a.source_hash,target:a.target_hash,operations,candidateHash}),executionAllowed:false,limitations:['Each selection copies the entire subtree; all changes inside must be reviewed.','Parent wrappers are matched by position under an identified ancestor; insertions, deletions and moves require independent handling.','XML serialization hashes may differ for semantically equivalent XML.','Dependencies, provenance, platform layering and deployment are not verified.']};
}
