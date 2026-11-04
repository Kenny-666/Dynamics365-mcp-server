import {uiXml,xmlHash} from './modelUiXml.js';
import type {Element} from '@xmldom/xmldom';

type Row = Record<string, any>;
function endpointIdentity(value:unknown):string|null {
 if(typeof value!=='string')return null;
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)return null;return u.origin+u.pathname.replace(/\/+$/,'');}catch{return null;}
}
/** Bounded positional XML comparison. Order and all attributes are preserved; IDs are not guessed away. */
export function compareFormDefinitions(source:Row,target:Row) {
 if(source.kind!=='form'||target.kind!=='form'||source.type!==2||target.type!==2||source.logicalName!==target.logicalName) throw new Error('Both definitions must be main forms for the same table.');
 const flatten=(value:unknown) => {
  const doc=uiXml(value,'form'),out=new Map<string,string>(),identities=new Map<string,string[]>();let count=0;
  const visit=(node:Element,path:string) => {
   if(++count>10000) throw new Error('Form exceeds comparison element limit.');
   const nativeId=node.getAttribute('id')?.trim();
   if(nativeId && ['tab','section','control'].includes(node.tagName)){const key=node.tagName+':'+nativeId.toLowerCase(),existing=identities.get(key)||[];existing.push(path);identities.set(key,existing);}
   const attrs:Array<[string,string]>=[];for(let i=0;i<node.attributes.length;i++){const a=node.attributes.item(i)!;attrs.push([a.name,a.value]);}attrs.sort((a,b)=>a[0].localeCompare(b[0]));
   const children=Array.from(node.childNodes).filter(n=>n.nodeType===1) as Element[];
   const text=Array.from(node.childNodes).filter(n=>n.nodeType===3||n.nodeType===4).map(n=>n.nodeValue||'').filter(v=>v.trim()).join('');
   out.set(path,JSON.stringify({attributes:attrs,text,childOrder:children.map(child=>child.tagName)}));
   const seen=new Map<string,number>();for(const child of children){const n=(seen.get(child.tagName)||0)+1;seen.set(child.tagName,n);visit(child,`${path}/${child.tagName}[${n}]`);}
  };visit(doc.documentElement!,'/form[1]');return {out,identities};
 };
 const inventory=(value:unknown) => {
  const root=uiXml(value,'form').documentElement!;
  const collect=(tag:string,attr:string)=>[...new Set(Array.from(root.getElementsByTagName(tag)).map(e=>e.getAttribute(attr)?.trim()).filter((v):v is string=>!!v))].sort();
  const hiddenFields=Array.from(root.getElementsByTagName('hiddencontrols')).flatMap(parent=>Array.from(parent.getElementsByTagName('data')).map(e=>e.getAttribute('datafieldname')?.trim()).filter((v):v is string=>!!v));
  const resourceIds=Array.from(root.getElementsByTagName('WebResourceId')).map(e=>e.textContent?.trim()).filter((v):v is string=>!!v);
  return {fields:[...new Set([...collect('control','datafieldname'),...hiddenFields])].sort(),libraries:[...new Set([...collect('Library','name'),...collect('Handler','libraryName')])].sort(),resourceIds:[...new Set(resourceIds)].sort()};
 };
 const sourceReferences=inventory(source.xml?.formxml),targetReferences=inventory(target.xml?.formxml);
 const referenceDelta=(sourceValues:string[],targetValues:string[]) => ({sourceOnly:sourceValues.filter(v=>!targetValues.includes(v)),targetOnly:targetValues.filter(v=>!sourceValues.includes(v)),shared:sourceValues.filter(v=>targetValues.includes(v))});
 const sourceFlat=flatten(source.xml?.formxml),targetFlat=flatten(target.xml?.formxml),a=sourceFlat.out,b=targetFlat.out,paths=[...new Set([...a.keys(),...b.keys()])].sort();
 const moves:Row[]=[],identityChanges:Row[]=[],ambiguousIds:string[]=[];
 for(const [id,sourcePaths] of sourceFlat.identities){const targetPaths=targetFlat.identities.get(id);if(!targetPaths)continue;if(sourcePaths.length!==1||targetPaths.length!==1){ambiguousIds.push(id);continue;}const sourcePath=sourcePaths[0],targetPath=targetPaths[0];if(sourcePath!==targetPath)moves.push({id,sourcePath,targetPath});
  const left=JSON.parse(a.get(sourcePath)!),right=JSON.parse(b.get(targetPath)!);
  const leftAttrs=Object.fromEntries(left.attributes),rightAttrs=Object.fromEntries(right.attributes),keys=[...new Set([...Object.keys(leftAttrs),...Object.keys(rightAttrs)])].sort();
  const attributes=keys.filter(k=>leftAttrs[k]!==rightAttrs[k]).map(name=>({name,source:leftAttrs[name]??null,target:rightAttrs[name]??null}));
  if(attributes.length||left.text!==right.text||JSON.stringify(left.childOrder)!==JSON.stringify(right.childOrder))identityChanges.push({id,sourcePath,targetPath,attributes,textChanged:left.text!==right.text,childOrderChanged:JSON.stringify(left.childOrder)!==JSON.stringify(right.childOrder),scope:'node_only'});
 }
 moves.sort((x,y)=>x.id.localeCompare(y.id));identityChanges.sort((x,y)=>x.id.localeCompare(y.id));ambiguousIds.sort();
 const changes=paths.filter(k=>a.get(k)!==b.get(k)).map(path=>({path,category:/\/Handler\[|\/event\[/.test(path)?'event':/\/Library\[/.test(path)?'library':/\/control\[/.test(path)?'control':/\/section\[/.test(path)?'section':/\/tab\[/.test(path)?'tab':'other',kind:!b.has(path)?'source_only':!a.has(path)?'target_only':'changed',source:a.has(path)?JSON.parse(a.get(path)!):null,target:b.has(path)?JSON.parse(b.get(path)!):null}));
 if(changes.length>3000)throw new Error('Comparison exceeds change limit; narrow the form.');
 const sourceEndpoint=endpointIdentity(source.environment?.orgUrl),targetEndpoint=endpointIdentity(target.environment?.orgUrl),endpointRelationship=!sourceEndpoint||!targetEndpoint?'unknown':sourceEndpoint===targetEndpoint?'same_configured_url':'different_configured_url';
 const organizationId=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v.toLowerCase():null,sourceOrg=organizationId(source.environment?.organizationId),targetOrg=organizationId(target.environment?.organizationId),organizationRelationship=!sourceOrg||!targetOrg?'unknown':sourceOrg===targetOrg?'same_organization':'different_organizations';
 return {source:{environment:source.environment,id:source.id,name:source.name,definitionHash:source.definitionHash,publication:source.publication},target:{environment:target.environment,id:target.id,name:target.name,definitionHash:target.definitionHash,publication:target.publication},endpointRelationship,organizationRelationship,logicalName:source.logicalName,changes,moves,identityChanges,ambiguousIds,references:{fields:referenceDelta(sourceReferences.fields,targetReferences.fields),libraries:referenceDelta(sourceReferences.libraries,targetReferences.libraries),resourceIds:referenceDelta(sourceReferences.resourceIds,targetReferences.resourceIds)},sourceXmlHash:xmlHash(source.xml.formxml,'form'),targetXmlHash:xmlHash(target.xml.formxml,'form'),comparison:'positional_xml',limitations:['Configured URL comparison does not prove organization identity: aliases or proxies can address the same organization. Organization IDs come from independent WhoAmI reads and are not an atomic lock.','Position changes can appear as multiple differences; childOrder preserves ordering between different element types.','Move and identity hints use unique exact IDs only; different or duplicate IDs cannot be matched safely. Identity changes cover the node itself, not its descendants.','Saved definitions can contain unpublished changes.','References are inventory only: shared names may still have different definitions, and removal does not imply deletion. Embedded WebResourceId values require independent resolution and review.','No dependency or solution package completeness is established.']};
}
