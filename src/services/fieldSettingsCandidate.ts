import {hash} from './modelMetadata.js';
type Row=Record<string,any>;

/** Prepare only selected native settings, rejecting overlapping target changes. */
export function prepareFieldSettingsCandidate(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A field settings candidate is required.');
 const a=raw as Row;if(Object.keys(a).some(k=>!['baseline','source','target','baseline_hash','source_hash','target_hash','selections'].includes(k)))throw new Error('Unexpected candidate argument.');
 for(const side of ['baseline','source','target'])if(!a[side]||typeof a[side]!=='object'||Array.isArray(a[side])||typeof a[side+'_hash']!=='string'||!/^[a-f0-9]{64}$/.test(a[side+'_hash'])||hash(a[side])!==a[side+'_hash'])throw new Error('A matching reviewed field definition hash is required for '+side+'.');
 const mapping:Record<string,string>={MaxLength:'max_length',MinValue:'min_value',MaxValue:'max_value',Precision:'precision',RequiredLevel:'required_level',DefaultValue:'default_value',DefaultFormValue:'default_value',Format:'format',IsAuditEnabled:'is_audit_enabled',IsValidForAdvancedFind:'is_valid_for_advanced_find'};
 if(!Array.isArray(a.selections)||!a.selections.length||a.selections.length>Object.keys(mapping).length||a.selections.some((x:unknown)=>typeof x!=='string'||!Object.hasOwn(mapping,x))||new Set(a.selections).size!==a.selections.length)throw new Error('Select unique supported field settings.');
 const identity=(d:Row)=>[d.LogicalName,d.SchemaName,d.AttributeType].map(x=>typeof x==='string'?x.toLowerCase():null);
 if(identity(a.baseline).some(x=>x===null)||hash(identity(a.baseline))!==hash(identity(a.source))||hash(identity(a.baseline))!==hash(identity(a.target)))throw new Error('The reviewed field identities or types differ.');
 const patch:Row={},changes:Row[]=[];
 for(const property of a.selections){const read=(definition:Row)=>{if(!Object.hasOwn(definition,property)||definition[property]===undefined||definition[property]===null)throw new Error('Selected setting is missing: '+property);const value=definition[property];return value&&typeof value==='object'&&Object.hasOwn(value,'Value')?value.Value:value;};
  const before=read(a.baseline),next=read(a.source),current=read(a.target);if(!['string','number','boolean'].includes(typeof before)||typeof before!==typeof next||typeof before!==typeof current||typeof next==='number'&&!Number.isFinite(next))throw new Error('Selected setting has an unsupported value: '+property);if(before===next)throw new Error('Selected setting is unchanged: '+property);if(current!==before&&current!==next)throw new Error('Target setting conflicts: '+property);const key=mapping[property];if(Object.hasOwn(patch,key))throw new Error('Selections map to the same setting.');patch[key]=next;changes.push({property,baseline:before,source:next,targetBefore:current});
 }
 return {patch,changes,reviewHash:hash({baseline:a.baseline_hash,source:a.source_hash,target:a.target_hash,changes}),executionAllowed:false,limitations:['Only selected settings are represented; native validation and data restrictions still apply.','Field identity and metadata hashes do not authenticate baseline provenance.','No metadata is saved, published or packaged.']};
}

/** Confirm the native preview changes only the reviewed properties and values. */
export function inspectFieldSettingsPreview(candidate:Row,native:Row){
 if(!candidate||!Array.isArray(candidate.changes)||!native||!native.changes||typeof native.changes!=='object'||Array.isArray(native.changes))throw new Error('A candidate and native settings preview are required.');
 const selected=new Map<string,Row>(candidate.changes.map((change:Row)=>[change.property,change]));
 for(const [property,entry] of Object.entries(native.changes) as Array<[string,Row]>){const reviewed=selected.get(property);if(!reviewed||!entry||typeof entry!=='object')throw new Error('Native settings preview includes an unselected property.');const after=entry.after&&typeof entry.after==='object'&&Object.hasOwn(entry.after,'Value')?entry.after.Value:entry.after;if(after!==reviewed.source)throw new Error('Native settings preview differs from the reviewed source value.');}
 for(const change of candidate.changes)if(change.targetBefore!==change.source&&!Object.hasOwn(native.changes,change.property))throw new Error('The native settings preview omitted a selected change.');
 return {status:'selected_changes_match',properties:Object.keys(native.changes).sort(),reviewHash:hash({candidate:candidate.reviewHash,changes:native.changes})};
}
