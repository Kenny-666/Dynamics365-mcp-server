import {compareFormDefinitions} from './formComparison.js';
import {hash} from './modelMetadata.js';
type Row=Record<string,any>;
type FieldReader=(environment:'source'|'target',logicalName:string,field:string)=>Promise<Row>;
type LibraryReader=(environment:'source'|'target',name:string)=>Promise<Row>;
function comparableLabels(value:unknown):unknown {
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid localized labels');
 const v=value as Row;if(!Array.isArray(v.LocalizedLabels)||v.LocalizedLabels.length>128||v['LocalizedLabels@odata.nextLink'])throw new Error('Incomplete localized labels');
 const seen=new Set<number>();return v.LocalizedLabels.map((item:unknown)=>{if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid localized label');const x=item as Row;if(!Number.isInteger(x.LanguageCode)||x.LanguageCode<1||x.LanguageCode>65535||seen.has(x.LanguageCode)||typeof x.Label!=='string'||x.Label.length>4096)throw new Error('Invalid localized label');seen.add(x.LanguageCode);return {language:x.LanguageCode,text:x.Label};}).sort((a:Row,b:Row)=>a.language-b.language);
}
function comparableOptionSet(value:unknown):unknown {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid option set');
 const v=value as Row;if(!['Picklist','Boolean'].includes(v.OptionSetType)||typeof v.IsGlobal!=='boolean'||v.IsGlobal&&(typeof v.Name!=='string'||!v.Name))throw new Error('Incomplete option set identity');
 if(v['Options@odata.nextLink'])throw new Error('Incomplete options');
 const options=v.OptionSetType==='Boolean'?[v.FalseOption,v.TrueOption]:v.Options;
 if(!Array.isArray(options)||options.length>1000)throw new Error('Incomplete options');const seen=new Set<number>();
 const items=options.map((o:unknown)=>{if(!o||typeof o!=='object'||Array.isArray(o))throw new Error('Invalid option');const x=o as Row;if(!Number.isInteger(x.Value)||x.Value<0||x.Value>2147483647||seen.has(x.Value)||!Object.hasOwn(x,'Label'))throw new Error('Invalid option');seen.add(x.Value);return {Value:x.Value,Label:comparableLabels(x.Label),...Object.fromEntries(['Description','Color','ExternalValue','ParentValues'].filter(k=>Object.hasOwn(x,k)).map(k=>[k,k==='Description'?comparableLabels(x[k]):x[k]]))};});
 if(v.OptionSetType==='Boolean'&&(items.length!==2||items[0].Value!==0||items[1].Value!==1))throw new Error('Invalid Boolean options');
 return {OptionSetType:v.OptionSetType,IsGlobal:v.IsGlobal,...(v.IsGlobal?{Name:v.Name}:{}),...Object.fromEntries(['ParentOptionSetName','DisplayName','Description'].filter(k=>Object.hasOwn(v,k)).map(k=>[k,['DisplayName','Description'].includes(k)?comparableLabels(v[k]):v[k]])),Options:items};
}
export async function inspectFormField(name:string,logicalName:string,readField:FieldReader,signal?:AbortSignal) {
 const read=async (side:'source'|'target')=>{try {const r=await readField(side,logicalName,name),d=r.definition;if(!d||typeof d!=='object'||typeof d.LogicalName!=='string'||typeof d.AttributeType!=='string'||d.LogicalName.toLowerCase()!==name.toLowerCase()) return {status:'incomplete'};const fields=['LogicalName','SchemaName','AttributeType','DisplayName','Description','Format','FormatName','MaxLength','MinValue','MaxValue','Precision','RequiredLevel','IsValidForCreate','IsValidForUpdate','DateTimeBehavior','Targets','DefaultFormValue','OptionSet'];const selected=Object.fromEntries(fields.filter(k=>Object.hasOwn(d,k)).map(k=>[k,['DisplayName','Description'].includes(k)?comparableLabels(d[k]):k==='OptionSet'?comparableOptionSet(d[k]):d[k]]));const choice=d.OptionSet?.IsGlobal===true?{name:d.OptionSet.Name,id:d.OptionSet.MetadataId??null,type:d.OptionSet.OptionSetType}:null;return {status:'available',metadataId:d.MetadataId??null,globalChoice:choice,requiresOptionSet:['Boolean','Picklist','Virtual','MultiSelectPicklist'].includes(d.AttributeType),selectedHash:hash(selected),selectedProperties:Object.keys(selected),propertyHashes:Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,hash(v)]))};}catch(error){if(signal?.aborted)throw error;return {status:'unavailable'};}};
 const left=await read('source'),right=await read('target');
 const available=left.status==='available'&&right.status==='available';const keys=available?[...new Set([...Object.keys(left.propertyHashes!),...Object.keys(right.propertyHashes!)])]:[];const differingProperties=available?keys.filter(k=>Object.hasOwn(left.propertyHashes!,k)&&Object.hasOwn(right.propertyHashes!,k)&&left.propertyHashes![k]!==right.propertyHashes![k]).sort():null;
 const required=['SchemaName','DisplayName','Description','RequiredLevel',...((left.requiresOptionSet||right.requiresOptionSet)?['OptionSet']:[])];const inspected=[...new Set([...required,...keys])];const missingProperties=available?{source:inspected.filter(k=>!Object.hasOwn(left.propertyHashes!,k)),target:inspected.filter(k=>!Object.hasOwn(right.propertyHashes!,k))}:null;
 const complete=!!missingProperties&&!missingProperties.source.length&&!missingProperties.target.length;
 return {name,source:left,target:right,comparison:!available?'unknown':differingProperties!.length?'selected_properties_differ':complete?'selected_properties_match':'unknown',differingProperties,missingProperties};
}
export async function inspectFormLibrary(name:string,readLibrary:LibraryReader,signal?:AbortSignal) {
 const read=async(side:'source'|'target')=>{try{return await readLibrary(side,name);}catch(error){if(signal?.aborted)throw error;return {status:'unavailable'};}};
 const left=await read('source'),right=await read('target');
 return {name,source:left,target:right,comparison:left.status==='available'&&right.status==='available'?(left.contentHash===right.contentHash&&left.type===right.type?'content_and_type_match':'content_or_type_differ'):'unknown'};
}
/** Preview the whole source form and enumerate references requiring independent review. */
export async function planFormPackage(source:Row,target:Row,solution:string,preview:(a:Row)=>Promise<Row>,readField?:FieldReader,signal?:AbortSignal,readLibrary?:LibraryReader) {
 if(typeof solution!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(solution)) throw new Error('A valid solution unique name is required.');
 const comparison=compareFormDefinitions(source,target);
 const form=await preview({solution_unique_name:solution,component_id:source.id,component_type:60,dry_run:true});
 const fieldChecks:Row[]=[];
 const names=[...comparison.references.fields.sourceOnly,...comparison.references.fields.shared];
 if(readField && names.length>100) throw new Error('Too many field references for a single plan; limit is 100.');
 for(const name of readField?names:[]) {
  if(signal?.aborted) throw new Error('Form package planning was cancelled.');
  fieldChecks.push(await inspectFormField(name,source.logicalName,readField!,signal));
 }
 const libraryChecks:Row[]=[],libraryNames=[...comparison.references.libraries.sourceOnly,...comparison.references.libraries.shared];
 if(readLibrary && libraryNames.length>40) throw new Error('Too many library references for a single plan; limit is 40.');
 for(const name of readLibrary?libraryNames:[]) {
  if(signal?.aborted) throw new Error('Form package planning was cancelled.');
  libraryChecks.push(await inspectFormLibrary(name,readLibrary!,signal));
 }
 const candidateInputs:Row[]=[];
 const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 for(const field of fieldChecks) if(field.source.status==='available'&&guid.test(field.source.metadataId??'')&&['selected_properties_differ','unknown'].includes(field.comparison))candidateInputs.push({name:field.name,component_type:2,component_id:field.source.metadataId,logical_name:source.logicalName,reason:field.comparison,requiresManualReview:field.comparison==='unknown'||!!field.missingProperties&&(field.missingProperties.source.length>0||field.missingProperties.target.length>0)});
 const choices=new Map<string,Row>();for(const field of fieldChecks){const choice=field.source.globalChoice;const optionUnknown=field.comparison==='unknown'||!!field.missingProperties&&(field.missingProperties.source.includes('OptionSet')||field.missingProperties.target.includes('OptionSet'));if(!choice||choice.type!=='Picklist'||!optionUnknown&&!field.differingProperties?.includes('OptionSet'))continue;if(!guid.test(choice.id??''))continue;const key=choice.id.toLowerCase(),existing=choices.get(key);if(existing){existing.related_fields.push(field.name);existing.inconsistentSource ||= existing.name!==choice.name||existing.sourceOptionHash!==field.source.propertyHashes?.OptionSet;existing.requiresManualReview ||= optionUnknown;}else choices.set(key,{name:choice.name,component_type:9,component_id:choice.id,related_fields:[field.name],sourceOptionHash:field.source.propertyHashes?.OptionSet,inconsistentSource:false,reason:'global_choice_difference_or_unknown',requiresManualReview:optionUnknown});}candidateInputs.push(...choices.values());
 for(const field of fieldChecks){const choice=field.source.globalChoice;if(!choice||!guid.test(choice.id??''))continue;const existing=choices.get(choice.id.toLowerCase());if(!existing||existing.related_fields.includes(field.name))continue;existing.related_fields.push(field.name);existing.inconsistentSource ||= existing.name!==choice.name||existing.sourceOptionHash!==field.source.propertyHashes?.OptionSet;}
 for(const library of libraryChecks) if(library.source.status==='available'&&guid.test(library.source.id??'')&&['content_or_type_differ','unknown'].includes(library.comparison))candidateInputs.push({name:library.name,component_type:61,component_id:library.source.id,reason:library.comparison,requiresManualReview:library.comparison==='unknown'});
 const componentCandidates:Row[]=[];
 for(const item of candidateInputs){
  if(signal?.aborted)throw new Error('Form package planning was cancelled.');
  if(item.inconsistentSource){componentCandidates.push({...item,previewStatus:'inconsistent_source'});continue;}
  try{const args:Row={solution_unique_name:solution,component_id:item.component_id,component_type:item.component_type,dry_run:true};if(item.logical_name)args.logical_name=item.logical_name;
   const result=await preview(args);if(item.component_type===9&&(result.component?.objectId?.toLowerCase()!==item.component_id.toLowerCase()||result.component?.source?.Name!==item.name))throw new Error('Global choice identity differs from field reference.');const dependencies=result.requiredDependencies,items=Array.isArray(dependencies?.items)?dependencies.items:[];componentCandidates.push({...item,previewStatus:'available',preview:{planHash:result.planHash,alreadyMember:result.alreadyMember,dependencyCount:Array.isArray(dependencies?.items)?items.length:null,dependencySample:items.slice(0,20),dependenciesTruncated:items.length>20,dependencyPaging:dependencies?.paging??null}});
  }catch(error){if(signal?.aborted)throw error;componentCandidates.push({...item,previewStatus:'unavailable'});}
 }
 const unresolvedComponents=[...fieldChecks.filter(x=>x.source.status!=='available'||!guid.test(x.source.metadataId??'')).map(x=>({kind:'field',name:x.name,reason:'source_unavailable_or_identity_invalid'})),...fieldChecks.filter(x=>x.source.globalChoice&&(!guid.test(x.source.globalChoice.id??'')||x.source.globalChoice.type!=='Picklist')).map(x=>({kind:'global_choice',name:x.source.globalChoice.name,reason:'source_identity_invalid_or_type_unsupported'})),...libraryChecks.filter(x=>x.source.status!=='available'||!guid.test(x.source.id??'')).map(x=>({kind:'library',name:x.name,reason:'source_unavailable_or_identity_invalid'})),...[...comparison.references.resourceIds.sourceOnly,...comparison.references.resourceIds.shared].map(id=>({kind:'embedded_web_resource',id,reason:'identity_and_content_require_independent_review'}))];
 return {comparison,solution,formPreview:form,fieldChecks,libraryChecks,componentCandidates,unresolvedComponents,reviewRequired:{sourceOnlyFields:comparison.references.fields.sourceOnly,sourceOnlyLibraries:comparison.references.libraries.sourceOnly,sharedFields:comparison.references.fields.shared,sharedLibraries:comparison.references.libraries.shared},
  scope:'entire_source_form',automaticDependencyInclusion:false,readyToExecute:false,
  limitations:['The entire form is included, including changes beyond the requested difference.','Only selected field properties are compared; environment-specific IDs and option metadata can cause differences. Only library bytes and type are compared; transitive dependencies require independent comparison.','Candidate previews are independent and may become stale when a prior component is added; re-preview each immediately before execution.','A preview is not a platform lock and does not prove the final exported package.','This operation does not add, export, publish or import components.']};
}
