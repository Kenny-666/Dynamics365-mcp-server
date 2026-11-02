import { XMLSerializer } from '@xmldom/xmldom';
import { uiXml, xmlHash } from './modelUiXml.js';

type Edit = {action?:unknown; id?:unknown; parent_id?:unknown; title?:unknown; entity?:unknown; url?:unknown; language_code?:unknown};
function str(value:unknown, field:string):string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f]/.test(value)) throw new Error(`${field} must be a non-empty string of at most 256 characters`);
  return value.trim();
}
function id(value:unknown,field:string):string {
  const result = str(value,field);
  if (!/^[A-Za-z0-9_.-]+$/.test(result)) throw new Error(`${field} contains invalid characters`);
  return result;
}
/** Construct an XML candidate locally. Persist and publish remain separate CRM operations. */
export function editSiteMap(raw:unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected arguments object');
  const input = raw as Record<string,unknown>;
  if (Object.keys(input).some(x => !['xml','edits'].includes(x))) throw new Error('Unknown argument');
  if (!Array.isArray(input.edits) || !input.edits.length || input.edits.length > 50) throw new Error('edits must contain 1 to 50 operations');
  const document = uiXml(input.xml,'SiteMap'), root = document.documentElement!;
  const all = () => Array.from(root.getElementsByTagName('*')).filter(x => ['Area','Group','SubArea'].includes(x.tagName));
  const find = (tag:string, value:unknown) => {
    const target = id(value,'id');
    const result = all().filter(x => x.tagName === tag && x.getAttribute('Id') === target);
    if (result.length !== 1) throw new Error(`${tag} id is missing or ambiguous: ${target}`);
    return result[0];
  };
  for (const rawEdit of input.edits) {
    if (!rawEdit || typeof rawEdit !== 'object' || Array.isArray(rawEdit)) throw new Error('Invalid edit');
    const edit = rawEdit as Edit;
    const allowed:Record<string,string[]> = {add_group:['action','id','parent_id','title'],add_subarea:['action','id','parent_id','title','entity','url'],rename:['action','id','title'],set_localized_title:['action','id','title','language_code'],remove_subarea:['action','id']};
    if (typeof edit.action !== 'string' || !Object.hasOwn(allowed,edit.action) || Object.keys(edit).some(k => !allowed[edit.action as string].includes(k))) throw new Error('Unsupported edit or argument');
    const target = id(edit.id,'id');
    if (edit.action === 'set_localized_title') {
      const matches = all().filter(x => x.getAttribute('Id') === target);
      if (matches.length !== 1) throw new Error('id is missing or ambiguous');
      if (!Number.isInteger(edit.language_code) || (edit.language_code as number) < 1 || (edit.language_code as number) > 65535) throw new Error('language_code must be an LCID between 1 and 65535');
      const label = str(edit.title,'title'),element = matches[0];
      const containers = Array.from(element.childNodes).filter(n => n.nodeType === 1 && (n as import('@xmldom/xmldom').Element).tagName === 'Titles') as import('@xmldom/xmldom').Element[];
      if (containers.length > 1) throw new Error('Multiple Titles containers are ambiguous');
      const titles = containers[0] ?? document.createElement('Titles');
      const language = String(edit.language_code);
      const matchesByLanguage = Array.from(titles.childNodes).filter(n => n.nodeType === 1 && (n as import('@xmldom/xmldom').Element).tagName === 'Title' && (/^\d+$/.test((n as import('@xmldom/xmldom').Element).getAttribute('LCID') ?? '') && Number((n as import('@xmldom/xmldom').Element).getAttribute('LCID')) === edit.language_code)) as import('@xmldom/xmldom').Element[];
      if (matchesByLanguage.length > 1) throw new Error('Duplicate localized titles are ambiguous');
      const localized = matchesByLanguage[0] ?? document.createElement('Title');
      localized.setAttribute('LCID',language);localized.setAttribute('Title',label);
      if (!matchesByLanguage.length) titles.appendChild(localized);
      if (!containers.length) element.insertBefore(titles,element.firstChild);
    } else if (edit.action === 'rename') {
      const matches = all().filter(x => x.getAttribute('Id') === target);
      if (matches.length !== 1) throw new Error('id is missing or ambiguous');
      matches[0].setAttribute('Title',str(edit.title,'title'));
    } else if (edit.action === 'remove_subarea') {
      const item = find('SubArea',target); item.parentNode!.removeChild(item);
    } else {
      if (all().some(x => x.getAttribute('Id') === target)) throw new Error('id already exists');
      const parent = find(edit.action === 'add_group' ? 'Area' : 'Group',edit.parent_id);
      const node = document.createElement(edit.action === 'add_group' ? 'Group' : 'SubArea');
      node.setAttribute('Id',target);
      if (edit.title !== undefined) node.setAttribute('Title',str(edit.title,'title'));
      if (edit.action === 'add_subarea') {
        if ((edit.entity === undefined) === (edit.url === undefined)) throw new Error('Provide exactly one of entity or url');
        if (edit.entity !== undefined) {
          const entity = str(edit.entity,'entity');
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entity)) throw new Error('Invalid entity logical name');
          node.setAttribute('Entity',entity);
        } else node.setAttribute('Url',str(edit.url,'url'));
      }
      parent.appendChild(node);
    }
  }
  const result = new XMLSerializer().serializeToString(document);
  uiXml(result,'SiteMap');
  return {saved:false,published:false,sourceHash:xmlHash(input.xml as string,'SiteMap'),candidateHash:xmlHash(result,'SiteMap'),
    xml:result,steps:['Review candidate XML; Title attributes do not replace localized labels','Save sitemapxml using update_existing_record with conditional concurrency control','Preview and execute publish_sitemap separately']};
}
