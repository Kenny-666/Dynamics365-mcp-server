import {validXmlCharacters} from './xmlCharacters.js';
import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {DOMParser,type Element,type Node} from '@xmldom/xmldom';
import {CrmRequestError} from '../errors.js';
import {fail,protect,type Row} from './solutionSupport.js';

export const PACKAGE_LIMIT = 32 * 1024 * 1024;
const XML_LIMIT = 2 * 1024 * 1024;
export const byteHash = (bytes:Buffer) => createHash('sha256').update(bytes).digest('hex');
const aliases:Record<string,string> = {filePath:'file_path',contentBase64:'content_base64',outputPath:'output_path',
  solutionUniqueName:'solution_unique_name',dryRun:'dry_run',expectedHash:'expected_hash',allowUnprotectedWrite:'allow_unprotected_write',
  asyncOperationId:'async_operation_id',importJobId:'import_job_id'};
export function transferArgs(raw:unknown,allowed:string[]):Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 20) fail('INVALID','Expected bounded solution transfer arguments.');
  const result:Row = {};
  for (const [key,value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const field = Object.hasOwn(aliases,key) ? aliases[key] : key;
    const limit = field === 'content_base64' ? 4 * Math.ceil(PACKAGE_LIMIT / 3) : 4096;
    if (!allowed.includes(field) || !['string','boolean'].includes(typeof value) || typeof value === 'string' && value.length > limit) fail('INVALID','An unknown or invalid transfer argument was supplied.');
    if (Object.hasOwn(result,field) && result[field] !== value) fail('INVALID','Conflicting transfer aliases.');
    result[field] = value;
  }
  return result;
}
export function cancelled(signal?:AbortSignal) {
  if (signal?.aborted) throw new CrmRequestError('D365_REQUEST_ABORTED','The solution transfer was cancelled.',{outcome:'not_sent'});
}
export function localPath(value:unknown):string {
  if (typeof value !== 'string' || !value || value.length > 4096 || !isAbsolute(value) || value.startsWith('\\\\') || value.startsWith('//') || /[\x00-\x1f]/.test(value)) fail('INVALID','An absolute local file path is required; network/device paths are unsupported.');
  return value;
}
export function binary(value:unknown):Buffer {
  if (typeof value !== 'string' || !value || value.length > 4 * Math.ceil(PACKAGE_LIMIT / 3) || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('PACKAGE','Expected canonical base64 within the 32 MiB ZIP limit.');
  const bytes = Buffer.from(value,'base64');
  if (bytes.length > PACKAGE_LIMIT || bytes.toString('base64') !== value) fail('PACKAGE','Expected canonical base64 within the 32 MiB ZIP limit.');
  return bytes;
}
export async function packageBytes(a:Row,signal?:AbortSignal):Promise<Buffer> {
  cancelled(signal);
  if ((a.file_path !== undefined) === (a.content_base64 !== undefined)) fail('INVALID','Supply exactly one file_path or content_base64.');
  if (a.content_base64 !== undefined) return binary(a.content_base64);
  const path = localPath(a.file_path);
  try {
    const file = await open(path,'r');
    try {
      const before = await file.stat();
      if (!before.isFile() || before.size < 22 || before.size > PACKAGE_LIMIT) fail('PACKAGE','The input must be a regular ZIP file within 32 MiB.');
      const bytes = Buffer.alloc(before.size + 1);let count = 0;
      while (count < bytes.length) {cancelled(signal);const read = await file.read(bytes,count,bytes.length-count,count);if (!read.bytesRead) break;count += read.bytesRead;}
      const after = await file.stat();
      if (count !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail('PACKAGE_CHANGED','The input file changed during the bounded read.');
      return bytes.subarray(0,count);
    } finally {await file.close();}
  } catch (error) {
    if (error instanceof CrmRequestError) throw error;
    return fail('PACKAGE_READ','The local package could not be read. Filesystem details are withheld.');
  }
}
const crcTable = Uint32Array.from({length:256},(_,i) => {for (let j = 0;j < 8;j++) i = i & 1 ? 0xedb88320 ^ i >>> 1 : i >>> 1;return i >>> 0;});
export function crc32(bytes:Buffer):number {let crc = 0xffffffff;for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;return (crc ^ 0xffffffff) >>> 0;}
function invalid():never {return fail('PACKAGE','The ZIP is malformed, unsupported or exceeds the bounded package format.');}
function extra(bytes:Buffer) {
  let offset = 0;
  while (offset < bytes.length) {
    if (offset+4 > bytes.length) invalid();const tag = bytes.readUInt16LE(offset),size = bytes.readUInt16LE(offset+2);offset += 4;
    // ZIP64 and alternative Unicode names can change how another reader interprets the archive.
    if ([1,0x7075,0x6375].includes(tag) || offset+size > bytes.length) invalid();offset += size;
  }
}
function entryName(bytes:Buffer,flags:number):string {
  if (!bytes.length || bytes.length > 1024 || !(flags & 0x800) && bytes.some(byte => byte > 127)) return invalid();
  const value = bytes.toString('utf8');if (!Buffer.from(value,'utf8').equals(bytes)) invalid();
  if (/[\\:<>"|?*\x00-\x1f\x7f]/.test(value) || value.startsWith('/') || value !== value.normalize('NFC')) invalid();
  const segments = value.replace(/\/$/,'').split('/');
  if (segments.some(part => !part || part.length > 255 || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) invalid();
  return value;
}
function manifest(bytes:Buffer):Row {
  if (bytes.length > XML_LIMIT) invalid();
  let source:string;
  if (bytes.length >= 2 && bytes.readUInt16LE(0) === 0xfeff) {
    if (bytes.length % 2) invalid();source = bytes.subarray(2).toString('utf16le');
  } else {source = bytes.toString('utf8');if (!Buffer.from(source,'utf8').equals(bytes)) invalid();source = source.replace(/^\ufeff/,'');}
  if (!validXmlCharacters(source) || /<!\s*(?:DOCTYPE|ENTITY)/i.test(source) || (source.match(/</g)?.length ?? 0) > 40000) invalid();
  let root:Element;
  try {const document = new DOMParser({onError:() => {throw new Error();}}).parseFromString(source,'application/xml');root = document.documentElement!;if (document.doctype) invalid();}
  catch {return invalid();}
  let nodes = 0;const visit = (node:Node,depth:number) => {if (++nodes > 50000 || depth > 64 || node.nodeType === 1 && (node as Element).namespaceURI) invalid();for (let child = node.firstChild;child;child = child.nextSibling) visit(child,depth+1);};visit(root,0);
  if (root.tagName !== 'ImportExportXml' || root.namespaceURI) invalid();
  const children = (parent:Element,tag:string) => Array.from(parent.childNodes).filter(node => node.nodeType === 1 && (node as Element).tagName === tag) as Element[];
  const one = (parent:Element,tag:string) => {const found = children(parent,tag);if (found.length !== 1) invalid();return found[0];};
  const text = (parent:Element,tag:string) => {const element = one(parent,tag);if (Array.from(element.childNodes).some(node => node.nodeType === 1)) invalid();return (element.textContent ?? '').trim();};
  const selected = one(root,'SolutionManifest'),uniqueName = text(selected,'UniqueName'),version = text(selected,'Version'),managed = text(selected,'Managed');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(uniqueName) || !/^\d{1,5}(?:\.\d{1,5}){3}$/.test(version) || version.split('.').some(n => Number(n) > 65535) || !['0','1'].includes(managed)) invalid();
  const publisher = one(selected,'Publisher'),publisherName = text(publisher,'UniqueName'),prefix = text(publisher,'CustomizationPrefix');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(publisherName) || !/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(prefix)) invalid();
  const roots = children(selected,'RootComponents'),dependencies = children(selected,'MissingDependencies');
  if (roots.length !== 1 || dependencies.length > 1) invalid();
  const rootComponents = children(roots[0],'RootComponent');
  const parents = children(selected,'ParentSolutionUniqueName');if (parents.length > 1) invalid();
  return {uniqueName,version,managed:managed === '1',publisher:{uniqueName:publisherName,customizationPrefix:prefix},
    rootComponentCount:rootComponents.length,declaredMissingDependencyCount:dependencies.length ? children(dependencies[0],'MissingDependency').length : 0,
    parentSolutionUniqueName:parents.length ? (parents[0].textContent ?? '').trim().slice(0,100) : null};
}
export interface ArchiveEntry {name:string;localBlock:Buffer;centralBlock:Buffer;payloadSha256:string;size:number;}
export interface InspectedArchive {entries:ArchiveEntry[];payloads:Map<string,Buffer>;endRecord:Buffer;size:number;uncompressedSize:number;sha256:string;}
/** ZIP validation without extraction or execution. Collect only explicitly bounded payloads. */
export function inspectArchive(bytes:Buffer,collect:Record<string,number> = {},signal?:AbortSignal):InspectedArchive {
  cancelled(signal);if (bytes.length < 22 || bytes.length > PACKAGE_LIMIT) invalid();
  let end = -1;
  for (let i = bytes.length-22;i >= Math.max(0,bytes.length-65557);i--) if (bytes.readUInt32LE(i) === 0x06054b50 && i+22+bytes.readUInt16LE(i+20) === bytes.length) {end = i;break;}
  if (end < 0 || bytes.readUInt16LE(end+4) || bytes.readUInt16LE(end+6)) invalid();
  const count = bytes.readUInt16LE(end+10),start = bytes.readUInt32LE(end+16),size = bytes.readUInt32LE(end+12);
  if (!count || count > 10000 || count !== bytes.readUInt16LE(end+8) || start+size !== end) invalid();
  const entries:({start:number;finish:number}&ArchiveEntry)[] = [],names = new Set<string>(),payloads = new Map<string,Buffer>();let cursor = start,total = 0;
  for (let index = 0;index < count;index++) {
    cancelled(signal);
    if (cursor+46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) invalid();
    const flags = bytes.readUInt16LE(cursor+8),method = bytes.readUInt16LE(cursor+10),crc = bytes.readUInt32LE(cursor+16),compressed = bytes.readUInt32LE(cursor+20),uncompressed = bytes.readUInt32LE(cursor+24);
    const nameSize = bytes.readUInt16LE(cursor+28),extraSize = bytes.readUInt16LE(cursor+30),commentSize = bytes.readUInt16LE(cursor+32),local = bytes.readUInt32LE(cursor+42);
    if (cursor+46+nameSize+extraSize+commentSize > end || flags & ~0x80e || ![0,8].includes(method) || bytes.readUInt16LE(cursor+34) || bytes.readUInt16LE(cursor+6) > 20 || (bytes.readUInt32LE(cursor+38) >>> 16 & 0xf000) === 0xa000) invalid();
    if (uncompressed > 64 * 1024 * 1024 || (total += uncompressed) > 256 * 1024 * 1024 || compressed > PACKAGE_LIMIT) invalid();
    const nameBytes = bytes.subarray(cursor+46,cursor+46+nameSize),name = entryName(nameBytes,flags),key = name.replace(/\/$/,'').toLowerCase();
    if (names.has(key)) invalid();names.add(key);extra(bytes.subarray(cursor+46+nameSize,cursor+46+nameSize+extraSize));
    if (name === 'solution.xml' && uncompressed > XML_LIMIT || method === 0 && flags & 6) invalid();
    if (Object.hasOwn(collect,name) && uncompressed > collect[name]) invalid();
    if (local+30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local+4) !== bytes.readUInt16LE(cursor+6) || bytes.readUInt16LE(local+6) !== flags || bytes.readUInt16LE(local+8) !== method) invalid();
    const localNameSize = bytes.readUInt16LE(local+26),localExtraSize = bytes.readUInt16LE(local+28),data = local+30+localNameSize+localExtraSize,finish = data+compressed;
    if (localNameSize !== nameSize || finish > start || !bytes.subarray(local+30,local+30+localNameSize).equals(nameBytes)) invalid();
    extra(bytes.subarray(local+30+localNameSize,data));
    for (const [offset,value] of [[14,crc],[18,compressed],[22,uncompressed]]) if (bytes.readUInt32LE(local+offset) !== value && (!(flags & 8) || bytes.readUInt32LE(local+offset) !== 0)) invalid();
    let blockEnd = finish;
    if (flags & 8) {
      if (blockEnd+12 > start) invalid();if (bytes.readUInt32LE(blockEnd) === 0x08074b50) blockEnd += 4;
      if (blockEnd+12 > start || bytes.readUInt32LE(blockEnd) !== crc || bytes.readUInt32LE(blockEnd+4) !== compressed || bytes.readUInt32LE(blockEnd+8) !== uncompressed) invalid();blockEnd += 12;
    }
    let payload:Buffer;
    try {
      if (method === 0) payload = bytes.subarray(data,finish);
      else {
        const inflated = inflateRawSync(bytes.subarray(data,finish),{maxOutputLength:Math.max(1,uncompressed),info:true}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};
        if (inflated.engine.bytesWritten !== compressed) invalid();payload = inflated.buffer;
      }
    }
    catch {return invalid();}
    if (payload.length !== uncompressed || crc32(payload) !== crc || name.endsWith('/') && payload.length) invalid();
    if (Object.hasOwn(collect,name)) payloads.set(name,payload);
    entries.push({name,start:local,finish:blockEnd,localBlock:bytes.subarray(local,blockEnd),centralBlock:bytes.subarray(cursor,cursor+46+nameSize+extraSize+commentSize),payloadSha256:byteHash(payload),size:uncompressed});cursor += 46+nameSize+extraSize+commentSize;
  }
  if (cursor !== end) invalid();
  entries.sort((a,b) => a.start-b.start);let last = 0;
  const files = new Set(entries.filter(e => !e.name.endsWith('/')).map(e => e.name.toLowerCase()));
  for (const entry of entries) {
    if (entry.start !== last) invalid();last = entry.finish;
    const parts = entry.name.toLowerCase().replace(/\/$/,'').split('/');parts.pop();
    while (parts.length) {if (files.has(parts.join('/'))) invalid();parts.pop();}
  }
  if (last !== start) invalid();
  return {sha256:byteHash(bytes),size:bytes.length,uncompressedSize:total,entries,payloads,endRecord:bytes.subarray(end)};
}
export function inspectPackageArchive(bytes:Buffer,collect:Record<string,number> = {},signal?:AbortSignal) {
  const archive = inspectArchive(bytes,{...collect,'solution.xml':XML_LIMIT},signal),solution = archive.payloads.get('solution.xml');
  if (!solution || !archive.entries.some(e => e.name === 'customizations.xml') || !archive.entries.some(e => e.name === '[Content_Types].xml')) invalid();
  const summary = {sha256:archive.sha256,size:archive.size,entryCount:archive.entries.length,uncompressedSize:archive.uncompressedSize,manifest:manifest(solution),
    validation:{archive:'bounded_headers_sizes_paths_and_all_payload_crc',manifest:'identity_only',extracted:false,executed:false,
      dependencyClosureVerified:false,deploymentReady:'not_assessed',signatureVerified:false}};
  return {archive,summary};
}
export function inspectPackage(bytes:Buffer,signal?:AbortSignal):Row {return inspectPackageArchive(bytes,{},signal).summary;}
/** Preserve every unchanged local compressed block; only central offsets and the chosen payload change. */
export function replaceArchiveEntry(archive:InspectedArchive,name:string,payload:Buffer,signal?:AbortSignal):Buffer {
  if (!archive.entries.some(entry => entry.name === name) || payload.length > 4*1024*1024) invalid();
  const localBlocks:Buffer[] = [],centralBlocks:Buffer[] = [];let offset = 0;
  for (const entry of archive.entries) {
    cancelled(signal);let local = entry.localBlock;const central = Buffer.from(entry.centralBlock);
    if (entry.name === name) {
      const original = entry.localBlock,nameSize = original.readUInt16LE(26),extraSize = original.readUInt16LE(28),header = Buffer.from(original.subarray(0,30+nameSize+extraSize)),
        data = deflateRawSync(payload),crc = crc32(payload),flags = original.readUInt16LE(6) & ~0xe;
      header.writeUInt16LE(20,4);header.writeUInt16LE(flags,6);header.writeUInt16LE(8,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(payload.length,22);
      central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(payload.length,24);
      local = Buffer.concat([header,data]);
    }
    central.writeUInt32LE(offset,42);localBlocks.push(local);centralBlocks.push(central);offset += local.length;
  }
  const directory = Buffer.concat(centralBlocks),end = Buffer.from(archive.endRecord);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  if (offset+directory.length+end.length > PACKAGE_LIMIT) invalid();return Buffer.concat([...localBlocks,directory,end]);
}
export function inspectSolutionPackage(raw:unknown,signal?:AbortSignal) {
  return protect(async () => {const a = transferArgs(raw,['file_path','content_base64']);return {success:true,package:inspectPackage(await packageBytes(a,signal),signal)};});
}
