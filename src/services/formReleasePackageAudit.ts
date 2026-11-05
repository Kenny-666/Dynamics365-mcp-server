import {inspectFormPackage} from './formPackageInspect.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;

function observedProperty(item:unknown,name:string):unknown{
 if(!item||typeof item!=='object'||Array.isArray(item))return null;
 return (item as Record<string,unknown>)[name]??null;
}

/** Compare a real archive with an explicit manifest; unresolved evidence never passes as a match. */
export async function auditFormReleasePackage(raw:unknown,signal?:AbortSignal){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('A package audit request is required.');
 const a=raw as Row;
 if(Object.keys(a).some(k=>!['file_path','content_base64','components'].includes(k))||!Array.isArray(a.components)||!a.components.length||a.components.length>241)throw new Error('A bounded component manifest and package are required.');
 const seen=new Set<string>();
 for(const item of a.components){if(!item||typeof item!=='object'||Array.isArray(item)||![2,9,60,61].includes(item.component_type)||typeof item.component_id!=='string')throw new Error('Invalid manifest component.');const key=item.component_type+':'+item.component_id.toLowerCase();if(seen.has(key))throw new Error('Duplicate manifest component.');seen.add(key);if([60,61].includes(item.component_type)&&(typeof item.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(item.expected_hash)))throw new Error('Expected content hashes are required for each form and web resource.');}
 const report=await inspectFormPackage(a,signal);
 const issues:Row[]=[];
 for(const root of report.rootScope)if(root.scope!=='requested')issues.push({kind:'root',status:root.scope,type:root.type,id:root.id||null,schemaName:root.schemaName});
 for(const root of report.rootScope)if(root.behavior===null||!['1','2'].includes(root.behavior))issues.push({kind:'root_inclusion_behavior',status:root.behavior==='0'?'includes_subcomponents':'unresolved',type:root.type,id:root.id||null,behavior:root.behavior});
 for(const issue of report.manifestIssues)issues.push({kind:'manifest_structure',detail:issue});
 for(const dependency of report.manifestDependencies)issues.push({kind:'manifest_dependency',status:'requires_review',dependency});
 for(const nested of report.nestedScope)if(nested.scope!=='requested')issues.push({kind:'nested_component',status:nested.scope,component:nested});
 for(const section of report.opaqueSections)issues.push({kind:'opaque_customization_section',status:'requires_review',section});
 for(const file of report.archiveFiles)if(file.classification==='unrecognized')issues.push({kind:'archive_file',status:'unrecognized',file});
 for(const item of report.components)if(item.status!=='declared_root')issues.push({kind:'membership',componentType:item.component_type,id:item.component_id,status:item.status});
 for(const item of report.formContents){const comparison='hashComparison' in item?item.hashComparison:'unknown';if(item.status!=='form_xml_present'||comparison!=='matched')issues.push({kind:'form_content',id:item.component_id,status:item.status,hashComparison:comparison});}
 for(const item of report.webResources){const comparison='hashComparison' in item?item.hashComparison:'unknown';if(item.status!=='payload_present'||comparison!=='matched')issues.push({kind:'web_resource',id:item.component_id,status:item.status,hashComparison:comparison});}
 for(const item of report.fields)issues.push({kind:'field_definition',id:observedProperty(item,'component_id'),status:observedProperty(item,'status'),hashComparison:observedProperty(item,'hashComparison'),reason:'name_id_binding_not_verified'});
 for(const item of report.globalChoices)issues.push({kind:'global_choice_definition',id:observedProperty(item,'component_id'),status:observedProperty(item,'status'),hashComparison:observedProperty(item,'hashComparison'),reason:'name_id_binding_not_verified'});
 const reportHash=hash({package:report.package,components:report.components,rootScope:report.rootScope,nestedScope:report.nestedScope,opaqueSections:report.opaqueSections,archiveFiles:report.archiveFiles,manifestIssues:report.manifestIssues,manifestDependencies:report.manifestDependencies,formContents:report.formContents,fields:report.fields,webResources:report.webResources,globalChoices:report.globalChoices,issues});
 return {reportHash,package:report.package,issues,observedScope:report.rootScope,nestedScope:report.nestedScope,opaqueSections:report.opaqueSections,archiveFiles:report.archiveFiles,manifestIssues:report.manifestIssues,manifestDependencies:report.manifestDependencies,selectedComponents:report.components,formContents:report.formContents,fields:report.fields,webResources:report.webResources,globalChoices:report.globalChoices,status:issues.length?'review_required':'selected_root_and_content_matched',releaseReady:false,limitations:['Nested inventory covers only recognized standard containers; platform-generated content may need review.','Manifest dependency declarations are not proof of dependency closure or target compatibility.','Opaque customization sections and unrecognized archive files require review.','Form XML may be transformed during export; a mismatch requires manual review.','No source manifest provenance, target layering, dependency closure, import or runtime behavior is verified.']};
}
