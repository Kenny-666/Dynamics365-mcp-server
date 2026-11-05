import {XMLSerializer,type Element,type Node} from '@xmldom/xmldom';
import {uiXml,xmlHash} from './modelUiXml.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;
const serializer=new XMLSerializer();
const elements=(node:Node,tag:string)=>Array.from(node.childNodes).filter(n=>n.nodeType===1&&(n as Element).tagName===tag) as Element[];
const nodeHash=(node:Node)=>hash(serializer.serializeToString(node));

/** Add or remove an explicitly reviewed whole form row in a local candidate. */
export function prepareFormRowCandidate(raw:unknown,workingTarget?:string) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A row candidate request is required.');
 const a=raw as Row;
 if(Object.keys(a).some(k=>!['baseline','source','target','baseline_hash','source_hash','target_hash','section_id','cell_id','action','row_hash'].includes(k)))throw new Error('Unexpected candidate argument.');
 for(const side of ['baseline','source','target'])if(typeof a[side]!=='string'||typeof a[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(a[side+'_hash'])||xmlHash(a[side],'form')!==a[side+'_hash'])throw new Error('A matching XML hash is required for '+side+'.');
 if(a.baseline_hash!==a.target_hash)throw new Error('Target form differs from baseline; resolve target changes before preparing a row candidate.');
 if(!['add','remove'].includes(a.action)||typeof a.section_id!=='string'||!a.section_id.trim()||a.section_id.length>200||typeof a.cell_id!=='string'||!a.cell_id.trim()||a.cell_id.length>200||typeof a.row_hash!=='string'||!/^[a-f0-9]{64}$/.test(a.row_hash))throw new Error('A valid action, section ID, cell ID and reviewed row hash are required.');
 const baseline=uiXml(a.baseline,'form'),source=uiXml(a.source,'form'),target=uiXml(workingTarget??a.target,'form');
 const section=(doc:any)=>{const items=Array.from(doc.getElementsByTagName('section') as ArrayLike<Element>).filter(x=>x.getAttribute('id')?.toLowerCase()===a.section_id.toLowerCase());const [item]=items;if(items.length!==1||!item)throw new Error('Section must be unique and present in each definition.');const rows=elements(item,'rows');const [row]=rows;if(rows.length!==1||!row)throw new Error('Section rows must be unique.');return row;};
 const bRows=section(baseline),sRows=section(source),tRows=section(target);
 const matching=(rows:Element)=>elements(rows,'row').filter(row=>elements(row,'cell').some(cell=>cell.getAttribute('id')?.toLowerCase()===a.cell_id.toLowerCase()));
 const left=matching(bRows),right=matching(sRows),dest=matching(tRows);
 let reviewed:Element;
 if(a.action==='add'){
  if(left.length||dest.length||right.length!==1)throw new Error('Added row must be absent from baseline and target and unique in source.');reviewed=right[0];
  if(nodeHash(reviewed)!==a.row_hash)throw new Error('Source row differs from the reviewed hash.');
  const sourceRows=elements(sRows,'row'),index=sourceRows.indexOf(reviewed);let anchor:Node|null=null;
  for(let i=index+1;i<sourceRows.length;i++){const h=nodeHash(sourceRows[i]),baseMatches=elements(bRows,'row').filter(row=>nodeHash(row)===h);if(baseMatches.length>1)throw new Error('Insertion anchor is ambiguous.');if(baseMatches.length===1){const targetMatches=elements(tRows,'row').filter(row=>nodeHash(row)===h);if(targetMatches.length!==1)throw new Error('Target insertion anchor is unavailable.');anchor=targetMatches[0];break;}}
  tRows.insertBefore(target.importNode(reviewed,true),anchor);
 }else{
  if(left.length!==1||dest.length!==1||right.length)throw new Error('Removed row must be unique in baseline and target and absent from source.');reviewed=left[0];
  if(nodeHash(reviewed)!==a.row_hash||nodeHash(dest[0])!==a.row_hash)throw new Error('Baseline or target row differs from the reviewed hash.');
  tRows.removeChild(dest[0]);
 }
 const root=target.documentElement;if(!root)throw new Error('Target form has no document element.');const formxml=serializer.serializeToString(root);uiXml(formxml,'form');const candidateHash=xmlHash(formxml,'form');
 return {candidate:{formxml},candidateHash,reviewHash:hash({baseline:a.baseline_hash,source:a.source_hash,target:a.target_hash,section:a.section_id,cell:a.cell_id,action:a.action,rowHash:a.row_hash,candidateHash}),executionAllowed:false,limitations:['The whole row including all cells and controls is copied or removed and must be reviewed.','Target must equal baseline; other target changes require separate resolution.','Insertion placement is derived from the next unchanged row; intervening source-only rows are not copied.','Field metadata, dependencies, platform validity and deployment are not verified.']};
}

export function inspectFormRow(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A row inspection request is required.');const a=raw as Row;
 if(Object.keys(a).some(k=>!['formxml','section_id','cell_id'].includes(k))||typeof a.formxml!=='string'||typeof a.section_id!=='string'||!a.section_id.trim()||typeof a.cell_id!=='string'||!a.cell_id.trim())throw new Error('Form XML, section ID and cell ID are required.');
 const doc=uiXml(a.formxml,'form'),sections=Array.from(doc.getElementsByTagName('section')).filter(x=>x.getAttribute('id')?.toLowerCase()===a.section_id.toLowerCase());if(sections.length!==1)throw new Error('Section must be unique.');
 const rows=elements(sections[0],'rows').flatMap(container=>elements(container,'row')).filter(row=>elements(row,'cell').some(cell=>cell.getAttribute('id')?.toLowerCase()===a.cell_id.toLowerCase()));if(rows.length!==1)throw new Error('Row must be unique.');
 return {rowXml:serializer.serializeToString(rows[0]),rowHash:nodeHash(rows[0]),formHash:xmlHash(a.formxml,'form'),note:'Review the complete row and its dependencies before selecting it.'};
}
