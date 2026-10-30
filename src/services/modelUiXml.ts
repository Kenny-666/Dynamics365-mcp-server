import { randomUUID } from 'node:crypto';
import type { Document,Element,Node } from '@xmldom/xmldom';
import { children,parseXml,xml } from './queryXml.js';
import { args,fail,flag,hash,integer,labels,logical,name,type Row } from './modelMetadata.js';

export function guid(value:unknown,field = 'id'):string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail('INVALID',field + ' must be a GUID without braces.');
  return value.toLowerCase();
}
function xmlGuid(value:string):string { return guid(value.replace(/^\{|\}$/g,''),'native XML ID'); }
export function uiXml(source:unknown,root:string):Document {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 1000000) fail('UI_XML','UI XML must be a string within 1 MB.');
  let document:Document;
  try { document = parseXml(source,root); } catch { fail('UI_XML','UI XML is malformed, oversized, contains a DTD/entity or has an unexpected root.'); }
  let nodes = 0;
  function visit(node:Node,depth:number) {
    if (++nodes > 40000 || depth > 64) fail('UI_XML','UI XML exceeds the structural bound.');
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child,depth + 1);
  }
  visit(document,0);
  if (document.documentElement!.namespaceURI) fail('UNSUPPORTED','Namespaced UI roots are outside the supported editing format.');
  return document;
}
function signature(node:Node):unknown {
  if (node.nodeType === 1) {
    const element = node as Element,attributes:Row = {};
    for (let i = 0;i < element.attributes.length;i++) { const item = element.attributes.item(i)!; attributes[item.name] = item.value; }
    const nested:unknown[] = [],hasElements = Array.from(element.childNodes).some(child => child.nodeType === 1);
    for (let child = node.firstChild;child;child = child.nextSibling) {
      if (child.nodeType === 1 || (child.nodeType === 3 || child.nodeType === 4) && (!hasElements || child.nodeValue?.trim())) nested.push(signature(child));
    }
    return [element.tagName,attributes,nested];
  }
  return node.nodeValue;
}
export function xmlHash(source:string,root:string):string { return hash(signature(uiXml(source,root).documentElement!)); }
function elements(root:Element,tag:string):Element[] { return Array.from(root.getElementsByTagName(tag)); }
function unique(items:Element[],label:string):Element {
  if (items.length !== 1) fail('UI_XML','The requested ' + label + ' was missing or ambiguous.');
  return items[0];
}
function container(document:Document,parent:Element,tag:string):Element {
  const matches = children(parent,tag);
  if (matches.length > 1) fail('UI_XML','Duplicate XML container: ' + tag);
  if (matches[0]) return matches[0];
  const created = document.createElement(tag); parent.appendChild(created); return created;
}
function append(document:Document,parent:Element,tag:string,attributes:Record<string,string>):Element {
  const element = document.createElement(tag); for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,value);
  parent.appendChild(element); return element;
}
export function libraryName(value:unknown):string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/.test(value) || value.length > 250 || value.includes('..') || value.includes('//')) fail('INVALID','library_name must be a native Web Resource name, not a URL/path.');
  return value;
}
export function formSummary(source:string):Row {
  const root = uiXml(source,'form').documentElement!;
  return {sections:elements(root,'section').map(section => ({id:section.getAttribute('id') ? xmlGuid(section.getAttribute('id')!) : null,name:section.getAttribute('name'),columns:section.getAttribute('columns')})),
    controls:elements(root,'control').map(control => ({id:control.getAttribute('id'),attributeName:control.getAttribute('datafieldname'),classId:control.getAttribute('classid')})),
    libraries:elements(root,'Library').map(library => ({name:library.getAttribute('name'),libraryUniqueId:library.getAttribute('libraryUniqueId')})),
    events:elements(root,'event').map(event => ({name:event.getAttribute('name'),attributeName:event.getAttribute('attribute'),
      handlers:elements(event,'Handler').map(handler => ({functionName:handler.getAttribute('functionName'),libraryName:handler.getAttribute('libraryName'),enabled:handler.getAttribute('enabled')}))}))};
}
export type UiResolver = {field:(name:string)=>Promise<Row>;library:(name:string)=>Promise<{id:string;name:string}>};
export async function formChanges(source:string,raw:unknown,resolver:UiResolver):Promise<{body:Row;changes:Row[]}> {
  const document = uiXml(source,'form'),root = document.documentElement!,changes:Row[] = [];
  const operations = operationList(raw);
  for (const rawOperation of operations) {
    const action = rawOperation?.action;
    if (action === 'add_field') {
      const a = args(rawOperation,['action','attribute_name','section_id','template_control_id','control_id','label']);
      const field = logical(a.attribute_name,'attribute_name'),controlId = name(a.control_id ?? field,'control_id'),sectionId = guid(a.section_id,'section_id');
      const controls = elements(root,'control');
      if (controls.some(control => control.getAttribute('datafieldname') === field || control.getAttribute('id') === controlId)) fail('EXISTS','This field/control already appears on the form.');
      const templateId = name(a.template_control_id,'template_control_id'),template = unique(controls.filter(control => control.getAttribute('id') === templateId),'template control');
      const sourceField = logical(template.getAttribute('datafieldname'),'template field');
      const targetMeta = await resolver.field(field),sourceMeta = await resolver.field(sourceField);
      const kind = targetMeta.AttributeType;
      if (!['String','Memo','Integer','Decimal','Money','DateTime','Boolean','Picklist'].includes(kind) || sourceMeta.AttributeType !== kind || targetMeta.IsValidForForm !== true || sourceMeta.IsValidForForm !== true) fail('UNSUPPORTED','Use a standard scalar control template with matching field type and IsValidForForm=true.');
      if (targetMeta.FormatName?.Value !== sourceMeta.FormatName?.Value || targetMeta.Format !== sourceMeta.Format || targetMeta.DateTimeBehavior?.Value !== sourceMeta.DateTimeBehavior?.Value) fail('UNSUPPORTED','The control template format/behavior must match the new field.');
      if (children(template,'parameters').length || template.getAttribute('relationship') || ['true','1'].includes(template.getAttribute('isunbound') || '')) fail('UNSUPPORTED','Lookup/unbound/parameterized templates need a separate control implementation.');
      const uniqueId = template.getAttribute('uniqueid');
      if (elements(root,'controlDescription').some(item => {
        const reference = (item.getAttribute('forControl') || '').replace(/^\{|\}$/g,'').toLowerCase();
        return reference === templateId.toLowerCase() || !!uniqueId && reference === uniqueId.replace(/^\{|\}$/g,'').toLowerCase();
      })) fail('UNSUPPORTED','PCF/custom-control templates cannot be copied by this operation.');
      const classId = template.getAttribute('classid'); if (!classId) fail('UI_XML','The native control class ID was missing.'); xmlGuid(classId);
      const section = unique(elements(root,'section').filter(item => item.getAttribute('id') && xmlGuid(item.getAttribute('id')!) === sectionId),'section');
      const columns = section.getAttribute('columns') || '';
      if (!/^1{1,4}$/.test(columns) || elements(section,'cell').some(cell => Number(cell.getAttribute('rowspan') || '1') !== 1)) fail('UNSUPPORTED','Use an explicitly equal-width section without row-spanning cells.');
      const rows = unique(children(section,'rows'),'section rows'),row = append(document,rows,'row',{});
      const cell = append(document,row,'cell',{id:'{' + randomUUID() + '}',colspan:String(columns.length),rowspan:'1',showlabel:'true'});
      const localized = labels(a.label,'display_name'),labelRoot = append(document,cell,'labels',{});
      for (const item of localized.LocalizedLabels) append(document,labelRoot,'label',{description:item.Label,languagecode:String(item.LanguageCode)});
      append(document,cell,'control',{id:controlId,classid:classId,datafieldname:field,disabled:'false',uniqueid:'{' + randomUUID() + '}'});
      changes.push({action,attributeName:field,controlId,sectionId,templateControlId:templateId,placement:'new_full_width_row'});
    } else if (action === 'add_library') {
      const a = args(rawOperation,['action','library_name']),library = libraryName(a.library_name);
      const resource = await resolver.library(library);
      const libraries = container(document,root,'formLibraries');
      if (children(libraries,'Library').some(item => item.getAttribute('name') === library)) fail('EXISTS','The script library is already on the form.');
      if (children(libraries,'Library').length >= 50) fail('INVALID','The form library limit of 50 was reached.');
      append(document,libraries,'Library',{name:library,libraryUniqueId:'{' + randomUUID() + '}'});
      changes.push({action,libraryName:library,webResourceId:resource.id,webResourcePublication:'not_verified'});
    } else if (action === 'bind_event') {
      const a = args(rawOperation,['action','event_name','attribute_name','library_name','function_name','pass_execution_context']);
      const library = libraryName(a.library_name),eventName = a.event_name;
      if (!['onload','onsave','onchange'].includes(eventName)) fail('INVALID','Supported events: onload, onsave, onchange.');
      if (typeof a.function_name !== 'string' || a.function_name.length > 200 || !/^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/.test(a.function_name)) fail('INVALID','function_name must be a dotted JavaScript identifier.');
      const field = eventName === 'onchange' ? logical(a.attribute_name,'attribute_name') : undefined;
      if (!field && a.attribute_name !== undefined) fail('INVALID','attribute_name is only used with onchange.');
      if (field) { await resolver.field(field); if (!elements(root,'control').some(control => control.getAttribute('datafieldname') === field)) fail('INVALID','An onchange field must already be placed on this form.'); }
      const libraries = unique(children(root,'formLibraries'),'form libraries');
      unique(children(libraries,'Library').filter(item => item.getAttribute('name') === library),'script library');
      const resource = await resolver.library(library);
      const events = container(document,root,'events'),matches = children(events,'event').filter(event => event.getAttribute('name') === eventName && (event.getAttribute('attribute') || undefined) === field);
      if (matches.length > 1) fail('UI_XML','The event is ambiguous.');
      let event = matches[0];
      if (!event) event = append(document,events,'event',{name:eventName,application:'false',active:'false',...(field ? {attribute:field} : {})});
      if (['true','1'].includes(event.getAttribute('application') || '')) fail('UNSUPPORTED','Application/internal events cannot be changed.');
      const handlers = container(document,event,'Handlers');
      if (children(handlers,'Handler').some(handler => handler.getAttribute('functionName') === a.function_name && handler.getAttribute('libraryName') === library)) fail('EXISTS','This event handler is already registered.');
      if (children(handlers,'Handler').length >= 50) fail('INVALID','The event handler limit of 50 was reached.');
      const pass = flag(a.pass_execution_context,'pass_execution_context',true);
      append(document,handlers,'Handler',{functionName:a.function_name,libraryName:library,handlerUniqueId:'{' + randomUUID() + '}',enabled:'true',passExecutionContext:String(pass)});
      changes.push({action,eventName,attributeName:field,libraryName:library,webResourceId:resource.id,webResourcePublication:'not_verified',functionName:a.function_name,passExecutionContext:pass,functionExistence:'not_executed_or_verified'});
    } else fail('INVALID','Unsupported form operation.');
  }
  const after = xml(document); uiXml(after,'form'); return {body:{formxml:after},changes};
}
export function operationList(raw:unknown):Row[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50 || raw.some(item => !item || typeof item !== 'object' || Array.isArray(item))) fail('INVALID','operations requires 1–50 structured operations.');
  if (Buffer.byteLength(JSON.stringify(raw)) > 2 * 1024 * 1024) fail('INVALID','Operation input exceeds 2 MiB.');
  return raw;
}
function viewRoots(fetch:string,layout:string,table:string) {
  const document = uiXml(fetch,'fetch'),grid = uiXml(layout,'grid'),entity = unique(children(document.documentElement!,'entity'),'root entity');
  if (entity.getAttribute('name') !== table) fail('UI_XML','The FetchXML root entity does not match the selected table.');
  const row = unique(children(grid.documentElement!,'row'),'layout row'); return {document,grid,entity,row};
}
export function viewSummary(fetch:string,layout:string,table:string):Row {
  const {document,entity,row} = viewRoots(fetch,layout,table);
  return {rootEntity:table,aggregate:document.documentElement!.getAttribute('aggregate'),distinct:document.documentElement!.getAttribute('distinct'),
    columns:children(row,'cell').map(cell => ({name:cell.getAttribute('name'),width:cell.getAttribute('width')})),
    order:children(entity,'order').map(order => ({attribute:order.getAttribute('attribute'),entity:order.getAttribute('entityname'),descending:order.getAttribute('descending')}))};
}
export async function viewChanges(fetch:string,layout:string,table:Row,raw:unknown,resolver:UiResolver):Promise<{body:Row;changes:Row[]}> {
  const {document,grid,entity,row} = viewRoots(fetch,layout,table.LogicalName),root = document.documentElement!,changes:Row[] = [];
  if (['true','1'].includes(root.getAttribute('aggregate') || '') || ['true','1'].includes(root.getAttribute('distinct') || '')) fail('UNSUPPORTED','Aggregate/distinct views need separate query semantics.');
  if (row.getAttribute('id') !== table.PrimaryIdAttribute || grid.documentElement!.getAttribute('object') !== String(table.ObjectTypeCode)) fail('UI_XML','Layout primary ID/object type does not match native table metadata.');
  const cells = () => children(row,'cell');
  if (new Set(cells().map(cell => cell.getAttribute('name'))).size !== cells().length) fail('UI_XML','Duplicate view columns are ambiguous.');
  for (const rawOperation of operationList(raw)) {
    const action = rawOperation.action;
    if (['add_column','remove_column','set_width'].includes(action)) {
      const a = args(rawOperation,['action','attribute_name',...(action === 'remove_column' ? [] : ['width'])]),field = logical(a.attribute_name,'attribute_name');
      const metadata = await resolver.field(field); if (metadata.IsValidForRead !== true) fail('UNSUPPORTED','This field is not confirmed readable.');
      const existing = cells().filter(cell => cell.getAttribute('name') === field);
      if (action === 'add_column') {
        if (existing.length) fail('EXISTS','The view column already exists.');
        const width = integer(a.width,'width',150,25,2000);
        append(grid,row,'cell',{name:field,width:String(width)});
        if (!children(entity,'all-attributes').length && !children(entity,'attribute').some(attribute => attribute.getAttribute('name') === field && !attribute.getAttribute('alias'))) append(document,entity,'attribute',{name:field});
        changes.push({action,attributeName:field,width});
      } else if (action === 'remove_column') {
        if (field === table.PrimaryIdAttribute || grid.documentElement!.getAttribute('jump') === field || cells().length <= 1) fail('INVALID','The primary/jump/last display column cannot be removed.');
        row.removeChild(unique(existing,'view column'));
        changes.push({action,attributeName:field,fetchAttribute:'preserved_for_filters_orders_and_other_dependencies'});
      } else {
        if (a.width === undefined) fail('INVALID','set_width requires width.');
        const width = integer(a.width,'width',150,25,2000); unique(existing,'view column').setAttribute('width',String(width)); changes.push({action,attributeName:field,width});
      }
    } else if (action === 'set_order') {
      const a = args(rawOperation,['action','order']);
      if (!Array.isArray(a.order) || !a.order.length || a.order.length > 10) fail('INVALID','order requires 1–10 root-field entries.');
      if (children(entity,'order').some(order => order.getAttribute('entityname') || order.getAttribute('alias'))) fail('UNSUPPORTED','Existing linked/alias orders need a separate sorting operation.');
      const seen = new Set<string>(),order:Row[] = [];
      for (const item of a.order) {
        const input = args(item,['attribute_name','descending']),field = logical(input.attribute_name,'attribute_name');
        if (seen.has(field)) fail('INVALID','Duplicate sort field.'); seen.add(field);
        if ((await resolver.field(field)).IsValidForRead !== true) fail('UNSUPPORTED','The sort field is not confirmed readable.');
        order.push({attribute:field,descending:flag(input.descending,'descending')});
      }
      for (const old of children(entity,'order')) entity.removeChild(old);
      for (const item of order) append(document,entity,'order',{attribute:item.attribute,descending:String(item.descending)});
      changes.push({action,order});
    } else fail('INVALID','Unsupported view operation.');
  }
  if (!children(entity,'all-attributes').length && !children(entity,'attribute').some(attribute => attribute.getAttribute('name') === table.PrimaryIdAttribute && !attribute.getAttribute('alias'))) {
    append(document,entity,'attribute',{name:table.PrimaryIdAttribute}); changes.push({action:'ensure_primary_id',attributeName:table.PrimaryIdAttribute});
  }
  const body = {fetchxml:xml(document),layoutxml:xml(grid)}; uiXml(body.fetchxml,'fetch'); uiXml(body.layoutxml,'grid'); return {body,changes};
}
