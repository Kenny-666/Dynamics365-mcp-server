import {hash,nativeOptions} from './modelMetadata.js';
type Row=Record<string,any>;

/** Prepare one explicit option insertion or localized update; no native write is performed. */
export function prepareChoiceCandidate(raw:unknown,existingIsolatedOption=false){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A choice candidate request is required.');const a=raw as Row;
 if(Object.keys(a).some(k=>!['baseline','source','target','baseline_hash','source_hash','target_hash','value','selections'].includes(k)))throw new Error('Unexpected choice candidate argument.');
 for(const side of ['baseline','source','target']){const v=a[side];if(!v||typeof v!=='object'||Array.isArray(v)||v.IsGlobal!==true||v.OptionSetType!=='Picklist'||typeof v.Name!=='string'||typeof a[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(a[side+'_hash'])||hash(v)!==a[side+'_hash'])throw new Error('A matching global Picklist definition and hash are required for '+side+'.');}
 if(a.baseline.Name!==a.source.Name||a.baseline.Name!==a.target.Name)throw new Error('Global choice names differ.');
 if(!Number.isInteger(a.value)||a.value<0||a.value>2147483647||!Array.isArray(a.selections)||!a.selections.length||a.selections.length>100)throw new Error('An option value and 1–100 label selections are required.');
 const option=(side:string)=>{const options=nativeOptions(a[side]);const matches=options.filter(x=>x.Value===a.value);if(matches.length>1)throw new Error('Duplicate option value.');return matches[0]??null;};
 const baseline=option('baseline'),source=option('source'),target=option('target');if(!source)throw new Error('Option removal is not supported.');
 if(!baseline&&target)throw new Error('Target already has this option; resolve the conflict.');if(baseline&&!target)throw new Error('Target no longer has the baseline option.');
 const labels=(v:unknown)=>{if(v===null||v===undefined)return new Map<number,string>();if(typeof v!=='object'||Array.isArray(v))throw new Error('Invalid option labels.');const label=v as Row;if(!Array.isArray(label.LocalizedLabels)||label.LocalizedLabels.length>128||label['LocalizedLabels@odata.nextLink'])throw new Error('Incomplete option labels.');const out=new Map<number,string>();for(const x of label.LocalizedLabels){if(!x||!Number.isInteger(x.LanguageCode)||x.LanguageCode<1||x.LanguageCode>65535||typeof x.Label!=='string'||out.has(x.LanguageCode))throw new Error('Invalid option label.');out.set(x.LanguageCode,x.Label);}return out;};
 const patch:Row={operation:baseline?'update':'insert',value:a.value,label:[],description:[]},changes:Row[]=[],seen=new Set<string>();
 for(const item of a.selections){if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['property','language_code'].includes(k))||!['Label','Description'].includes(item.property)||!Number.isInteger(item.language_code)||item.language_code<1||item.language_code>65535)throw new Error('Invalid option label selection.');const key=item.property+':'+item.language_code;if(seen.has(key))throw new Error('Duplicate option label selection.');seen.add(key);
  const before=labels(baseline?.[item.property]).get(item.language_code)??null,next=labels(source[item.property]).get(item.language_code)??null,current=labels(target?.[item.property]).get(item.language_code)??null;
  if(next===before)throw new Error('Selected option label is unchanged.');if(current!==before&&current!==next)throw new Error('Target option label conflicts.');if(next===null||!next.trim()||next.length>(item.property==='Description'?2000:100))throw new Error('Label removal or invalid label requires manual resolution.');
  patch[item.property==='Label'?'label':'description'].push({language_code:item.language_code,text:next});changes.push({property:item.property,language_code:item.language_code,baseline:before,source:next,targetBefore:current});
 }
 if(!baseline&&!patch.label.length&&!existingIsolatedOption)throw new Error('An inserted option requires at least one selected label.');for(const key of ['label','description'])if(!patch[key].length)delete patch[key];
 return {choiceName:a.source.Name,operation:patch,changes,reviewHash:hash({baseline:a.baseline_hash,source:a.source_hash,target:a.target_hash,value:a.value,changes}),executionAllowed:false,limitations:['Only explicitly selected option labels or descriptions are represented.','Insertion does not automatically copy unselected languages or other option properties.','Option removal, reordering and renumbering require separate handling.','Definitions and baseline provenance are caller supplied.']};
}
