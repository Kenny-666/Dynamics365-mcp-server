import {hash} from './modelMetadata.js';
type Row=Record<string,any>;

/** Compare the native create preview with selected source properties; never infer full equivalence. */
export function inspectFieldCreationPreview(source:Row,body:Row){
 if(!source||typeof source!=='object'||!body||typeof body!=='object')throw new Error('Source definition and native create body are required.');
 const labels=(value:unknown)=>{if(value===null||value===undefined)return [];if(typeof value!=='object'||Array.isArray(value))throw new Error('Label evidence is invalid.');const x=value as Row;if(!Array.isArray(x.LocalizedLabels)||x['LocalizedLabels@odata.nextLink'])throw new Error('Label evidence is incomplete.');const seen=new Set<number>();return x.LocalizedLabels.map((item:Row)=>{if(!item||!Number.isInteger(item.LanguageCode)||typeof item.Label!=='string'||seen.has(item.LanguageCode))throw new Error('Label evidence is invalid.');seen.add(item.LanguageCode);return {language:item.LanguageCode,text:item.Label};}).sort((a:Row,b:Row)=>a.language-b.language);};
 const checked=['SchemaName','AttributeType','MaxLength','MinValue','MaxValue','Precision','PrecisionSource','Format','FormatName','DateTimeBehavior','RequiredLevel'];const differences:Row[]=[];
 for(const property of checked){if(!Object.hasOwn(body,property))continue;if(!Object.hasOwn(source,property)||source[property]===undefined){differences.push({property,status:'source_missing'});continue;}const value=(v:any)=>v&&typeof v==='object'&&Object.hasOwn(v,'Value')?v.Value:v;const left=value(source[property]),right=value(body[property]);if(left===undefined||right===undefined||hash(left)!==hash(right))differences.push({property,status:'different'});}
 for(const property of ['DisplayName','Description']){const left=labels(source[property]),right=labels(body[property]);if(hash(left)!==hash(right))differences.push({property,status:'different'});}
 return {status:differences.length?'mismatch':'selected_properties_match',differences,checkedProperties:checked.filter(p=>Object.hasOwn(body,p)).concat(['DisplayName','Description']),limitations:['Only native create body properties listed here are compared.','Other source metadata, managed properties, dependencies and runtime behavior are not established.']};
}
