import {hash} from './modelMetadata.js';

type Row=Record<string,any>;

/** Select individual localized label changes for the existing merge-label update API. */
export function prepareFieldLabelCandidate(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A field label candidate request is required.');const a=raw as Row;
 if(Object.keys(a).some(k=>!['baseline','source','target','baseline_hash','source_hash','target_hash','selections'].includes(k)))throw new Error('Unexpected candidate argument.');
 for(const side of ['baseline','source','target'])if(!a[side]||typeof a[side]!=='object'||Array.isArray(a[side])||typeof a[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(a[side+'_hash'])||hash(a[side])!==a[side+'_hash'])throw new Error('A matching reviewed definition hash is required for '+side+'.');
 if(!Array.isArray(a.selections)||!a.selections.length||a.selections.length>100)throw new Error('Select 1–100 localized label changes.');
 const maps=(value:unknown)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Localized label definition is unavailable.');const label=value as Row;if(!Array.isArray(label.LocalizedLabels)||label.LocalizedLabels.length>128||label['LocalizedLabels@odata.nextLink'])throw new Error('Localized labels are incomplete.');const result=new Map<number,string>();for(const item of label.LocalizedLabels){if(!item||!Number.isInteger(item.LanguageCode)||item.LanguageCode<1||item.LanguageCode>65535||typeof item.Label!=='string'||result.has(item.LanguageCode))throw new Error('Localized labels are malformed or ambiguous.');result.set(item.LanguageCode,item.Label);}return result;};
 const selected=new Set<string>(),changes:Row[]=[],operations:Row={display_name:[],description:[]};
 for(const item of a.selections){if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['property','language_code'].includes(k))||!['DisplayName','Description'].includes(item.property)||!Number.isInteger(item.language_code)||item.language_code<1||item.language_code>65535)throw new Error('Invalid label selection.');const key=item.property+':'+item.language_code;if(selected.has(key))throw new Error('Duplicate label selection.');selected.add(key);
  const base=maps(a.baseline[item.property]),source=maps(a.source[item.property]),target=maps(a.target[item.property]),before=base.get(item.language_code)??null,next=source.get(item.language_code)??null,current=target.get(item.language_code)??null;
  if(next===before)throw new Error('Selected label is unchanged from baseline.');if(current!==before&&current!==next)throw new Error('Target label conflicts with the selected source change.');if(next===null||!next.trim()||next.length>(item.property==='Description'?2000:100))throw new Error('Label removal, empty labels and oversized labels require manual resolution.');
  const property=item.property==='DisplayName'?'display_name':'description';operations[property].push({language_code:item.language_code,text:next});changes.push({property:item.property,language_code:item.language_code,baseline:before,source:next,targetBefore:current});
 }
 for(const key of Object.keys(operations))if(!operations[key].length)delete operations[key];
 return {operations,changes,reviewHash:hash({baseline:a.baseline_hash,source:a.source_hash,target:a.target_hash,changes}),executionAllowed:false,limitations:['Only selected localized labels are represented; other field properties and dependencies are not copied.','Label merging uses the native metadata update API and is not an atomic lock.','Baseline provenance and platform behavior are not verified.']};
}
