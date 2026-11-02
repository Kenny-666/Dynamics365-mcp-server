import {deflateRawSync} from 'node:zlib';
import {crc32} from './solutionPackage.js';
/** Small, bounded ZIP writer for generated Office documents; never handles user-provided archive paths. */
export function generatedZip(parts:Record<string,string>):Buffer {
 const entries=Object.entries(parts);if(!entries.length||entries.length>50)throw new Error('Invalid generated archive parts');
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0,total=0;
 for(const [path,text] of entries){
  if(!/^[A-Za-z0-9_./\[\]-]+$/.test(path)||path.startsWith('/')||path.split('/').includes('..'))throw new Error('Invalid generated archive path');
  const name=Buffer.from(path,'utf8'),data=Buffer.from(text,'utf8');total+=data.length;if(total>10*1024*1024)throw new Error('Generated archive is too large');
  const compressed=deflateRawSync(data),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,name,compressed);centrals.push(central,name);offset+=local.length+name.length+compressed.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
