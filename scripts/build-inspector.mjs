import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=join(root,'.cache','assembly-inspector-build');
const result=spawnSync(process.env.D365_DOTNET_PATH || 'dotnet',['build',join(root,'tools/assembly-inspector/AssemblyInspector.csproj'),
  '-c','Release','-o',output,'--nologo','-p:BaseIntermediateOutputPath='+join(root,'.cache','assembly-inspector-obj')+'/'],
  {cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,DOTNET_NOLOGO:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1'}});
if(result.error || result.status!==0){console.error('Assembly inspector build requires .NET 10 SDK.');process.exit(1);}
const target=join(root,'bin','assembly-inspector');mkdirSync(target,{recursive:true});
for(const file of ['AssemblyInspector.dll','AssemblyInspector.runtimeconfig.json','AssemblyInspector.deps.json'])copyFileSync(join(output,file),join(target,file));
