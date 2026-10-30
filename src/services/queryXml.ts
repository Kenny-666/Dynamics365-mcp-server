import {validXmlCharacters} from './xmlCharacters.js';
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom';
import { queryError } from './queryState.js';

export function parseXml(source: string, rootName: string): Document {
  if (typeof source !== 'string' || !source.trim() || source.length > 1000000 || !validXmlCharacters(source) || /<!\s*(DOCTYPE|ENTITY)/i.test(source)) {
    throw queryError('XML must be non-empty, at most 1 MB and contain no DTD or entity declarations.');
  }
  try {
    const document = new DOMParser({onError:() => { throw new Error('Invalid XML'); }}).parseFromString(source, 'application/xml');
    if (document.documentElement?.tagName !== rootName || document.doctype) throw new Error('Unexpected root');
    return document;
  } catch {
    throw queryError('XML is malformed or has an unexpected root element.');
  }
}
export function xml(document: Document): string { return new XMLSerializer().serializeToString(document); }
export function children(parent: Node, name: string): Element[] {
  const result: Element[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 && (child as Element).tagName === name) result.push(child as Element);
  }
  return result;
}
export function rootStateInFetch(entity: Element): boolean {
  const aliases = [entity.getAttribute('name'), entity.getAttribute('alias')].filter(Boolean);
  function walk(node: Element, scope: Element): boolean {
    if (node.tagName === 'entity' || node.tagName === 'link-entity') scope = node;
    if (node.tagName === 'condition' && node.getAttribute('attribute') === 'statecode') {
      const qualifier = node.getAttribute('entityname');
      if (qualifier ? aliases.includes(qualifier) : scope === entity) return true;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 && walk(child as Element, scope)) return true;
    }
    return false;
  }
  return walk(entity, entity);
}

/** The Web API annotation wraps a double URL-encoded cookie. DOM serialization escapes it once. */
export function pagingCookie(annotation: unknown): string | undefined {
  if (annotation === undefined || annotation === null || annotation === '') return undefined;
  if (typeof annotation !== 'string') throw queryError('Paging cookie must be XML.', 'D365_QUERY_RESPONSE_INVALID');
  try {
    const wrapper = parseXml(annotation, 'cookie').documentElement!;
    const encoded = wrapper.getAttribute('pagingcookie');
    if (!encoded) throw new Error('Missing pagingcookie');
    const decoded = decodeURIComponent(decodeURIComponent(encoded));
    parseXml(decoded, 'cookie');
    return decoded;
  } catch {
    throw queryError('Server returned an invalid FetchXML paging cookie.', 'D365_QUERY_RESPONSE_INVALID');
  }
}
