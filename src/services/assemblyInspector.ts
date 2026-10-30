import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PluginStepError, type Row} from './pluginStepValidation.js';

export const ASSEMBLY_LIMIT = 16 * 1024 * 1024;
export function assemblyError(code:string,message:string):never {
  throw new PluginStepError('D365_ASSEMBLY_' + code,message);
}
export function decodeAssembly(value:unknown):Buffer {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(ASSEMBLY_LIMIT / 3) * 4
    || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) assemblyError('CONTENT_INVALID','Assembly content must be canonical base64 within 16 MiB.');
  const bytes = Buffer.from(value,'base64');
  if (bytes.length > ASSEMBLY_LIMIT || bytes.toString('base64') !== value) assemblyError('CONTENT_INVALID','Assembly content must be canonical base64 within 16 MiB.');
  return bytes;
}
export const assemblyHash = (bytes:Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function assemblyBytes(args:Row):Promise<Buffer> {
  if ((args.file_path !== undefined) === (args.content_base64 !== undefined)) assemblyError('SOURCE_REQUIRED','Supply exactly one file_path or content_base64.');
  if (args.content_base64 !== undefined) return decodeAssembly(args.content_base64);
  if (typeof args.file_path !== 'string' || !args.file_path.trim()) assemblyError('SOURCE_REQUIRED','file_path must be a non-empty local path.');
  try {
    const file = await open(args.file_path,'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > ASSEMBLY_LIMIT) assemblyError('FILE_INVALID','Assembly input must be a regular file within 16 MiB.');
      // Bounded read even if the file grows after stat.
      const buffer = Buffer.alloc(Math.min(stat.size + 1,ASSEMBLY_LIMIT + 1));
      let offset = 0;
      while (offset < buffer.length) { const read = await file.read(buffer,offset,buffer.length-offset,offset); if (!read.bytesRead) break; offset += read.bytesRead; }
      const after = await file.stat();
      if (offset !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) assemblyError('FILE_CHANGED','Assembly input changed while being read.');
      return buffer.subarray(0,offset);
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof PluginStepError) throw error;
    return assemblyError('FILE_INVALID','The local assembly file could not be read.');
  }
}
export interface AssemblyMetadata {protocol:1;name:string;version:string;culture:string;publicKeyToken:string;framework:string|null;
  ilOnly:boolean;library:boolean;signed:boolean;machine:string;requires32Bit:boolean;nativeImports:boolean;
  types:{name:string;concrete:boolean;generic:boolean;nested:boolean;unresolvedInheritance:boolean;plugin:boolean;workflow:boolean}[];
  references:{name:string;version:string;culture:string;publicKeyToken:string}[];}
export type InspectAssembly = (bytes:Buffer,signal?:AbortSignal)=>Promise<AssemblyMetadata>;
const directory = dirname(fileURLToPath(import.meta.url));
const bundled = resolve(directory,'../bin/assembly-inspector/AssemblyInspector.dll');
const helper = existsSync(bundled) ? bundled : resolve(directory,'../../bin/assembly-inspector/AssemblyInspector.dll');

/** Spawn a fixed metadata reader; never invoke the inspected PE or pass it as a command. */
export async function inspectAssembly(bytes:Buffer,signal?:AbortSignal,options:{command?:string;helper?:string;timeoutMs?:number} = {}):Promise<AssemblyMetadata> {
  if (!bytes.length || bytes.length > ASSEMBLY_LIMIT) assemblyError('CONTENT_INVALID','Assembly input must be within 16 MiB.');
  if (signal?.aborted) assemblyError('CANCELLED','Assembly inspection was cancelled.');
  const command = options.command ?? process.env.D365_DOTNET_PATH ?? 'dotnet';
  const env:NodeJS.ProcessEnv = {};
  for (const [key,value] of Object.entries(process.env)) if (/^(path|systemroot|windir|home|userprofile|tmp|temp|tmpdir|dotnet_root(?:_x64|_arm64)?|lang|lc_all)$/i.test(key)) env[key] = value;
  Object.assign(env,{DOTNET_NOLOGO:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_GCHeapHardLimit:'0x10000000'});
  return new Promise((resolveResult,reject) => {
    const child = spawn(command,[options.helper ?? helper],{windowsHide:true,stdio:['pipe','pipe','pipe'],env});
    let output = '', stderrBytes = 0, done = false;
    const finish = (error?:PluginStepError,result?:AssemblyMetadata) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort',cancel);
      if (error) { child.kill(); reject(error); } else resolveResult(result!);
    };
    const failure = (code:string,message:string) => finish(new PluginStepError('D365_ASSEMBLY_' + code,message));
    const cancel = () => failure('CANCELLED','Assembly inspection was cancelled.');
    const timer = setTimeout(() => failure('INSPECTOR_TIMEOUT','The metadata reader exceeded its time limit.'),options.timeoutMs ?? 15000);
    signal?.addEventListener('abort',cancel,{once:true});
    child.on('error',() => failure('INSPECTOR_UNAVAILABLE','Assembly inspection requires the packaged reader and .NET 10 Runtime. Configure D365_DOTNET_PATH if dotnet is not on PATH.'));
    child.stdin.on('error',() => {}); // Process exit/error determines the bounded, sanitized result.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk => { output += chunk; if (output.length > 4 * 1024 * 1024) failure('INSPECTOR_OUTPUT','The metadata reader output exceeded its limit.'); });
    child.stderr.on('data',chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) failure('INSPECTOR_OUTPUT','The metadata reader error output exceeded its limit.'); });
    child.on('close',code => {
      if (done) return;
      if (code !== 0) return failure(code === 2 ? 'INVALID' : 'INSPECTOR_UNAVAILABLE',code === 2 ? 'The file is not a supported managed assembly.' : 'The packaged metadata reader could not run; .NET 10 Runtime is required.');
      try {
        const metadata = JSON.parse(output);
        if (metadata.protocol !== 1 || typeof metadata.name !== 'string' || typeof metadata.version !== 'string'
          || !Array.isArray(metadata.types) || metadata.types.length > 5000 || !Array.isArray(metadata.references)
          || metadata.references.length > 1000 || typeof metadata.culture !== 'string' || typeof metadata.publicKeyToken !== 'string'
          || !['ilOnly','library','signed','requires32Bit','nativeImports'].every(key => typeof metadata[key] === 'boolean')
          || typeof metadata.machine !== 'string' || (metadata.framework !== null && typeof metadata.framework !== 'string')
          || !metadata.types.every((item:Row) => typeof item?.name === 'string' && ['concrete','generic','nested','unresolvedInheritance','plugin','workflow'].every(key => typeof item[key] === 'boolean'))
          || !metadata.references.every((item:Row) => ['name','version','culture','publicKeyToken'].every(key => typeof item?.[key] === 'string'))) throw new Error();
        finish(undefined,metadata);
      } catch { failure('INSPECTOR_OUTPUT','The metadata reader returned an invalid result.'); }
    });
    if (signal?.aborted) cancel();
    if (!done) child.stdin.end(bytes.toString('base64'));
  });
}
