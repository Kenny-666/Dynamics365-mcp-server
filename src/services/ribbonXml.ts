import {validXmlCharacters} from './xmlCharacters.js';
import {DOMParser,XMLSerializer,type Document,type Element,type Node} from '@xmldom/xmldom';
import {digest} from './apiOperationMetadata.js';
import {children} from './queryXml.js';
import {fail,flag,integer,row,type Row} from './solutionSupport.js';
import {text} from './solutionSnapshotValues.js';
import type {InspectedArchive} from './solutionPackage.js';
export const CUSTOMIZATIONS_LIMIT = 4 * 1024 * 1024;
export function decodeRibbonXml(bytes:Buffer):string {
  let source:string;
  if (bytes.length >= 2 && bytes.readUInt16LE(0) === 0xfeff) {if (bytes.length % 2) fail('RIBBON_XML','Invalid XML encoding.');source = bytes.subarray(2).toString('utf16le');}
  else {source = bytes.toString('utf8');if (!Buffer.from(source,'utf8').equals(bytes)) fail('RIBBON_XML','Only UTF-8 or BOM UTF-16LE XML is supported.');}
  return source.replace(/^\ufeff/,'').replace(/^<\?xml\s[^?]*\?>/i,declaration => declaration.replace(/encoding\s*=\s*(['"])[^'"]+\1/i,'encoding="utf-8"'));
}
export function ribbonDocument(source:string,roots:string[],limit = CUSTOMIZATIONS_LIMIT):Document {
  if (typeof source !== 'string' || Buffer.byteLength(source) > limit || !validXmlCharacters(source) || /<!\s*(?:DOCTYPE|ENTITY)/i.test(source) || (source.match(/</g)?.length ?? 0) > 100000) fail('RIBBON_XML','Ribbon XML exceeds bounds or contains a DTD/entity declaration.');
  let document:Document;
  try {document = new DOMParser({onError:() => {throw new Error();}}).parseFromString(source,'application/xml');
    if (document.doctype || !document.documentElement || !roots.includes(document.documentElement.tagName) || document.documentElement.namespaceURI) throw new Error();}
  catch {return fail('RIBBON_XML','Ribbon XML is malformed or has an unsupported root.');}
  let nodes = 0;const visit = (node:Node,depth:number) => {if (++nodes > 150000 || depth > 64) fail('RIBBON_XML','Ribbon XML exceeds structural bounds.');for (let child = node.firstChild;child;child = child.nextSibling) visit(child,depth+1);};visit(document,0);return document;
}
export function signature(node:Node):unknown {
  if (node.nodeType === 1) {
    const e = node as Element,attributes:Row = {};for (let i = 0;i < e.attributes.length;i++) {const attr = e.attributes.item(i)!;attributes[attr.name] = attr.value;}
    const hasElements = Array.from(e.childNodes).some(child => child.nodeType === 1),nested:unknown[] = [];
    for (let child = e.firstChild;child;child = child.nextSibling) if (![3,4].includes(child.nodeType) || !hasElements || child.nodeValue?.trim()) nested.push(signature(child));
    return [e.tagName,attributes,nested];
  }
  if (node.nodeType === 9) return Array.from(node.childNodes).map(signature);
  return [node.nodeType,node.nodeName,node.nodeValue];
}
const all = (root:Element,tag:string) => Array.from(root.getElementsByTagName(tag));
function one(parent:Element,tag:string):Element {const values = children(parent,tag);if (values.length !== 1) fail('RIBBON_XML','A required Ribbon XML container is missing or ambiguous.');return values[0];}
export function selectRibbon(document:Document,logicalName:string):Element {
  const entities = one(document.documentElement!,'Entities'),matches = children(entities,'Entity').filter(entity => {
    const names = children(entity,'Name');return names.length === 1 && names[0].textContent?.trim().toLowerCase() === logicalName;
  });
  if (matches.length !== 1) fail('RIBBON_TARGET','The selected table was not uniquely included in customizations.xml.');
  const ribbon = one(matches[0],'RibbonDiffXml');
  for (const e of [ribbon,...Array.from(ribbon.getElementsByTagName('*'))]) if (e.namespaceURI) fail('RIBBON_XML','Namespaced RibbonDiffXml elements are unsupported.');
  return ribbon;
}
export function ribbonSummary(root:Element,top:number) {
  const buttons = all(root,'Button'),commands = all(root,'CommandDefinition'),locations = Array.from(root.getElementsByTagName('*')).filter(e => ['Controls','Group','Tab'].includes(e.tagName) && e.hasAttribute('Id'));
  const fields = (e:Element,names:string[]) => Object.fromEntries(names.filter(key => e.hasAttribute(key)).map(key => [key,text(e.getAttribute(key),4096)]));
  return {definitionHash:digest(signature(root)),buttonCount:buttons.length,commandCount:commands.length,
    buttons:buttons.slice(0,top).map(button => ({...fields(button,['Id','Command','LabelText','ToolTipTitle','TemplateAlias','Image16by16','Image32by32','Sequence']),
      customActionId:button.parentNode?.parentNode?.nodeType === 1 && (button.parentNode.parentNode as Element).tagName === 'CustomAction' ? (button.parentNode.parentNode as Element).getAttribute('Id') : null})),
    commands:commands.slice(0,top).map(command => ({id:command.getAttribute('Id'),enableRules:all(command,'EnableRule').map(e => e.getAttribute('Id')),
      displayRules:all(command,'DisplayRule').map(e => e.getAttribute('Id')),javaScript:all(command,'JavaScriptFunction').map(e => ({...fields(e,['Library','FunctionName']),parameterTypes:Array.from(e.childNodes).filter(n => n.nodeType === 1).map(n => n.nodeName)}))})),
    candidateLocations:locations.slice(0,top).map(e => e.getAttribute('Id')+'._children'),truncated:buttons.length > top || commands.length > top || locations.length > top,
    effectiveVisibility:'not_evaluated',javaScriptExecuted:false,modernCommands:'not_supported'};
}
function id(value:unknown):string {if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.-]{0,239}$/.test(value)) fail('RIBBON_INVALID','A bounded Ribbon identifier is required.');return value;}
function owned(value:unknown,prefix:string):string {const selected = id(value);if (!selected.startsWith(prefix+'.') && !selected.startsWith(prefix+'_')) fail('RIBBON_SCOPE','Custom IDs must start with the package publisher prefix.');return selected;}
function options(value:unknown,fields:string[]):Row {const a = row(value);if (Object.keys(a).some(key => !fields.includes(key))) fail('RIBBON_INVALID','An unknown Ribbon change property was supplied.');return a;}
function append(document:Document,parent:Element,tag:string,attrs:Row = {}):Element {
  const e = document.createElement(tag);for (const [key,value] of Object.entries(attrs)) e.setAttribute(key,String(value));parent.appendChild(e);return e;
}
function ensure(document:Document,parent:Element,tag:string,order:string[]):Element {
  const found = children(parent,tag);if (found.length > 1) fail('RIBBON_XML','Duplicate Ribbon container.');if (found[0]) return found[0];
  const e = document.createElement(tag);
  // children() matches literal names; inspect element siblings for ordered insertion.
  const before = Array.from(parent.childNodes).find(n => n.nodeType === 1 && order.indexOf((n as Element).tagName) > order.indexOf(tag));
  if (before) parent.insertBefore(e,before);else parent.appendChild(e);return e;
}
function locate(root:Element,tag:string,identifier:string):Element|undefined {
  const found = all(root,tag).filter(e => e.getAttribute('Id') === identifier);if (found.length > 1) fail('RIBBON_AMBIGUOUS','A Ribbon definition ID is ambiguous.');return found[0];
}
function resource(document:Document,archive:InspectedArchive,value:unknown,types:number[]):string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,249}$/.test(value) || value.includes('..') || value.includes('//')) fail('RIBBON_RESOURCE','A package Web Resource unique name is required.');
  const matches = all(document.documentElement!,'WebResource').filter(e => children(e,'Name').length === 1 && children(e,'Name')[0].textContent === value);
  if (matches.length !== 1) fail('RIBBON_RESOURCE','Referenced JavaScript/images must be uniquely included in the package.');
  const type = one(matches[0],'WebResourceType').textContent,file = one(matches[0],'FileName').textContent?.replace(/\\/g,'/').replace(/^\/(?=[^/])/,'');
  if (!types.includes(Number(type)) || !archive.entries.some(e => e.name === file && !e.name.endsWith('/'))) fail('RIBBON_RESOURCE','The packaged resource type or payload is unavailable.');return '$webresource:'+value;
}
function labels(document:Document,ribbon:Element,button:Element,input:unknown,prefix:string,newButton = false) {
  if (!Array.isArray(input) || !input.length || input.length > 32) fail('RIBBON_INVALID','labels must contain 1–32 language/text pairs.');
  const labelId = owned(button.getAttribute('Id')!+'.Label',prefix),container = ensure(document,ribbon,'LocLabels',['CustomActions','Templates','CommandDefinitions','RuleDefinitions','LocLabels']);
  const labelNodes = all(ribbon,'LocLabel'),existing = labelNodes.filter(e => e.getAttribute('Id') === labelId);
  if (existing.length > 1 || Array.from(document.documentElement!.getElementsByTagName('*')).some(other => other !== button && Array.from(other.attributes).some(a => a.value === '$LocLabels:'+labelId))) fail('RIBBON_SHARED_LABEL','The destination label is ambiguous or shared.');
  const originalRef = button.getAttribute('LabelText'),original = originalRef?.startsWith('$LocLabels:') ? labelNodes.filter(e => e.getAttribute('Id') === originalRef.slice(11)) : [];
  if (original.length > 1) fail('RIBBON_SHARED_LABEL','The original label reference is ambiguous.');
  const merged = new Map<number,string>();
  if (original[0]) for (const title of all(original[0],'Title')) {
    const language = Number(title.getAttribute('languagecode'));if (!Number.isInteger(language) || language < 1 || language > 65535 || merged.has(language)) fail('RIBBON_XML','Label languages are malformed or duplicated.');merged.set(language,title.getAttribute('description') ?? '');
  }
  const seen = new Set<number>();for (const raw of input) {
    const a = options(raw,['language_code','text']),language = integer(a.language_code,0,1,65535),value = text(a.text,512);
    if (!language || seen.has(language) || !value?.trim()) fail('RIBBON_INVALID','Each label needs a distinct LCID and nonempty text.');seen.add(language);merged.set(language,value);
  }
  const label = existing[0] ?? append(document,container,'LocLabel',{Id:labelId});while (label.firstChild) label.removeChild(label.firstChild);
  const titles = append(document,label,'Titles');for (const [language,description] of [...merged].sort(([a],[b]) => a-b)) append(document,titles,'Title',{languagecode:language,description});
  button.setAttribute('LabelText','$LocLabels:'+labelId);
  if (newButton) {button.setAttribute('ToolTipTitle','$LocLabels:'+labelId);button.setAttribute('ToolTipDescription','$LocLabels:'+labelId);}
}
function customButton(ribbon:Element,buttonId:string) {
  const button = locate(ribbon,'Button',buttonId),ui = button?.parentNode as Element|undefined,action = ui?.parentNode as Element|undefined;
  if (!button || ui?.tagName !== 'CommandUIDefinition' || action?.tagName !== 'CustomAction' || (action.parentNode as Element)?.tagName !== 'CustomActions') fail('RIBBON_SCOPE','Only standalone custom Button definitions in this table are editable.');
  return {button,action};
}
export function editRibbon(document:Document,ribbon:Element,archive:InspectedArchive,logicalName:string,prefix:string,raw:unknown):Row[] {
  if (['mscrm','microsoft'].includes(prefix.toLowerCase()) || !Array.isArray(raw) || !raw.length || raw.length > 20) fail('RIBBON_INVALID','Supply 1–20 changes for a custom publisher prefix.');
  const order = ['CustomActions','Templates','CommandDefinitions','RuleDefinitions','LocLabels'],changes:Row[] = [];
  for (const section of order) ensure(document,ribbon,section,order);
  const templates = one(ribbon,'Templates');if (!children(templates,'RibbonTemplates').length) append(document,templates,'RibbonTemplates',{Id:'Mscrm.Templates'});
  const ruleDefinitions = one(ribbon,'RuleDefinitions');for (const tag of ['TabDisplayRules','DisplayRules','EnableRules']) ensure(document,ruleDefinitions,tag,['TabDisplayRules','DisplayRules','EnableRules']);
  for (const value of raw) {
    const a = row(value),operation = a.operation,buttonId = owned(a.button_id,prefix);
    if (operation === 'add_button') {
      options(a,['operation','button_id','command_id','custom_action_id','location','sequence','labels','library','function_name','parameters','image_16','image_32']);
      const commandId = owned(a.command_id,prefix),actionId = owned(a.custom_action_id,prefix);
      if (typeof a.location !== 'string') fail('RIBBON_LOCATION','An explicit insertion location is required.');
      const location = id(a.location.replace(/\._children$/,''))+ '._children';
      if (a.location !== location || !['Form','HomepageGrid','SubGrid'].some(kind => location.startsWith('Mscrm.'+kind+'.'+logicalName+'.'))) fail('RIBBON_LOCATION','Use an explicit current-table Mscrm Form/HomepageGrid/SubGrid insertion location ending in ._children.');
      for (const selected of [buttonId,commandId,actionId]) if (Array.from(document.documentElement!.getElementsByTagName('*')).some(e => e.getAttribute('Id') === selected)) fail('RIBBON_EXISTS','A requested Ribbon definition ID already exists.');
      if (new Set([buttonId,commandId,actionId,buttonId+'.Label']).size !== 4) fail('RIBBON_INVALID','Button, command, action and label IDs must be distinct.');
      const sequence = integer(a.sequence,100,1),library = resource(document,archive,a.library,[3]),image16 = resource(document,archive,a.image_16,[5,6,7,10]),image32 = resource(document,archive,a.image_32,[5,6,7,10]);
      if (typeof a.function_name !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(a.function_name) || a.function_name.length > 256) fail('RIBBON_INVALID','A qualified JavaScript function name is required.');
      const action = append(document,ensure(document,ribbon,'CustomActions',order),'CustomAction',{Id:actionId,Location:location,Sequence:sequence}),ui = append(document,action,'CommandUIDefinition'),
        button = append(document,ui,'Button',{Id:buttonId,Command:commandId,Sequence:sequence,TemplateAlias:'o1',Image16by16:image16,Image32by32:image32});
      labels(document,ribbon,button,a.labels,prefix,true);
      const command = append(document,ensure(document,ribbon,'CommandDefinitions',order),'CommandDefinition',{Id:commandId});append(document,command,'EnableRules');append(document,command,'DisplayRules');
      const js = append(document,append(document,command,'Actions'),'JavaScriptFunction',{Library:library,FunctionName:a.function_name}),parameters = a.parameters ?? [];
      if (!Array.isArray(parameters) || parameters.length > 16) fail('RIBBON_INVALID','At most 16 explicit ordered action parameters are supported.');
      for (const raw of parameters) {
        const p = options(raw,['type','value']);let parameterValue:unknown = p.value;
        if (!Object.hasOwn(p,'value')) fail('RIBBON_INVALID','Each action parameter needs an explicit value.');
        if (p.type === 'crm') {if (!['PrimaryControl','SelectedControl','SelectedControlSelectedItemIds','SelectedControlSelectedItemReferences'].includes(p.value)) fail('RIBBON_INVALID','Unsupported CRM context parameter.');}
        else if (p.type === 'string') parameterValue = text(p.value,1024);
        else if (p.type === 'bool') parameterValue = flag(p.value);
        else if (p.type === 'int') {if (!Number.isInteger(p.value) || p.value < -2147483648 || p.value > 2147483647) fail('RIBBON_INVALID','Int parameters require an Int32 value.');}
        else fail('RIBBON_INVALID','Parameter type must be crm, string, bool or int.');
        append(document,js,({crm:'CrmParameter',string:'StringParameter',bool:'BoolParameter',int:'IntParameter'} as Row)[p.type],{Value:parameterValue});
      }
      changes.push({operation,buttonId,commandId,customActionId:actionId,location,sequence,resourceReferences:'present_in_package_not_runtime_verified'});
    } else if (operation === 'update_button') {
      options(a,['operation','button_id','labels','sequence']);const {button,action} = customButton(ribbon,buttonId);owned(action.getAttribute('Id'),prefix);
      if (a.labels === undefined && a.sequence === undefined) fail('RIBBON_INVALID','Provide labels and/or sequence.');
      if (a.labels !== undefined) labels(document,ribbon,button,a.labels,prefix);
      if (a.sequence !== undefined) {const sequence = integer(a.sequence,100,1);button.setAttribute('Sequence',String(sequence));action.setAttribute('Sequence',String(sequence));}
      changes.push({operation,buttonId,handlerAndRules:'preserved'});
    } else if (operation === 'set_visibility') {
      options(a,['operation','button_id','visible']);if (typeof a.visible !== 'boolean') fail('RIBBON_INVALID','visible must be explicit.');
      const {button} = customButton(ribbon,buttonId),commandId = owned(button.getAttribute('Command'),prefix),command = locate(ribbon,'CommandDefinition',commandId);
      if (!command || all(document.documentElement!,'CommandDefinition').filter(c => c.getAttribute('Id') === commandId).length !== 1
        || Array.from(document.documentElement!.getElementsByTagName('*')).filter(b => b.getAttribute('Command') === commandId).length !== 1) fail('RIBBON_SHARED_COMMAND','Visibility editing requires a unique unshared custom command.');
      const refs = one(command,'DisplayRules'),definitions = ensure(document,ribbon,'RuleDefinitions',order),display = ensure(document,definitions,'DisplayRules',['TabDisplayRules','DisplayRules','EnableRules']),ruleId = buttonId+'.Hidden.DisplayRule';
      const expected = document.createElement('DisplayRule');expected.setAttribute('Id',ruleId);append(document,expected,'CrmClientTypeRule',{Type:'Web'});append(document,expected,'CrmClientTypeRule',{Type:'Web',InvertResult:'true'});
      let rule = locate(display,'DisplayRule',ruleId);
      const references = all(document.documentElement!,'CommandDefinition').flatMap(c => all(c,'DisplayRule').filter(e => e.getAttribute('Id') === ruleId));
      if (Array.from(document.documentElement!.getElementsByTagName('*')).some(e => e.getAttribute('Id') === ruleId && e !== rule && !references.includes(e))) fail('RIBBON_SHARED_RULE','The dedicated rule ID collides with another definition.');
      if (rule && digest(signature(rule)) !== digest(signature(expected)) || references.some(ref => ref.parentNode !== refs)) fail('RIBBON_SHARED_RULE','The dedicated hidden rule is modified or shared.');
      const selectedRefs = children(refs,'DisplayRule').filter(e => e.getAttribute('Id') === ruleId);if (selectedRefs.length > 1) fail('RIBBON_XML','The hidden rule reference is duplicated.');
      if (!a.visible) {if (!rule) {display.appendChild(expected);rule = expected;}if (!selectedRefs.length) append(document,refs,'DisplayRule',{Id:ruleId});}
      else {if (selectedRefs[0]) refs.removeChild(selectedRefs[0]);if (rule) display.removeChild(rule);}
      changes.push({operation,buttonId,visible:a.visible,interpretation:a.visible ? 'dedicated_false_rule_removed_other_rules_and_layers_still_apply' : 'contradictory_client_display_checks_no_HideCustomAction'});
    } else fail('RIBBON_INVALID','Unsupported Ribbon operation.');
  }
  return changes;
}
export const serializeRibbon = (document:Document|Element) => new XMLSerializer().serializeToString(document);
export function outsideRibbonHash(document:Document,logicalName:string):string {
  const clone = ribbonDocument(serializeRibbon(document),['ImportExportXml']),ribbon = selectRibbon(clone,logicalName);
  ribbon.parentNode!.replaceChild(clone.createElement('RibbonDiffXml'),ribbon);return digest(signature(clone));
}
