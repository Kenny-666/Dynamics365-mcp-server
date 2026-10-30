// Test-only signed assemblies. The generated key is public test material, never a production signing key.
import {generateKeyPairSync} from 'node:crypto';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'.cache','assembly-fixtures');
const target=join(root,'tests','fixtures','assemblies');mkdirSync(cache,{recursive:true});mkdirSync(target,{recursive:true});
const dotnet=process.env.D365_DOTNET_PATH || 'dotnet';
const sdks=spawnSync(dotnet,['--list-sdks'],{encoding:'utf8',windowsHide:true});
const sdk=sdks.stdout.trim().split(/\r?\n/).at(-1).match(/^(\S+) \[(.+)\]$/);
if(!sdk)throw new Error('.NET SDK required to regenerate fixtures');
const csc=join(sdk[2],sdk[1],'Roslyn','bincore','csc.dll');
const reference=process.env.D365_FRAMEWORK_REFERENCE_DIR || join(process.env.WINDIR || 'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319');
function key() {
  const jwk=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'jwk'});
  const size=256,header=Buffer.alloc(20);header[0]=7;header[1]=2;header.writeUInt32LE(0x2400,4);header.writeUInt32LE(0x32415352,8);header.writeUInt32LE(2048,12);
  const exponent=Buffer.from(jwk.e,'base64url');header.writeUInt32LE(Number(BigInt('0x'+exponent.toString('hex'))),16);
  const little=(value,length)=>{const out=Buffer.alloc(length),bytes=Buffer.from(value,'base64url').reverse();bytes.copy(out);return out;};
  return Buffer.concat([header,little(jwk.n,size),...['p','q','dp','dq','qi'].map(name=>little(jwk[name],size/2)),little(jwk.d,size)]);
}
writeFileSync(join(cache,'test.snk'),key());writeFileSync(join(cache,'other.snk'),key());
function compile(name,source,options={}) {
  const folder=join(cache,name);mkdirSync(folder,{recursive:true});const file=join(folder,'Fixture.cs');writeFileSync(file,source);
  const output=join(folder,(options.assembly || 'FixturePlugin')+'.dll');
  const args=[csc,'/nologo','/target:library','/nostdlib','/deterministic+','/debug-','/r:'+join(reference,'mscorlib.dll'),'/out:'+output];
  if(options.sign!==false)args.push('/keyfile:'+join(cache,options.otherKey?'other.snk':'test.snk'));
  if(options.sdk)args.push('/r:'+options.sdk);
  if(options.platform)args.push('/platform:'+options.platform);
  const result=spawnSync(dotnet,[...args,file],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error(result.stdout+result.stderr);
  copyFileSync(output,join(target,name+'.dll'));return output;
}
const sdkStub=compile('sdk-stub','namespace Microsoft.Xrm.Sdk { public interface IPlugin { void Execute(System.IServiceProvider provider); } }',{assembly:'Microsoft.Xrm.Sdk'});
const prefix=(version,framework,culture='')=>`[assembly:System.Reflection.AssemblyVersion("${version}")][assembly:System.Runtime.Versioning.TargetFramework("${framework}")]${culture?'[assembly:System.Reflection.AssemblyCulture("'+culture+'")]':''}`;
const plugin='namespace Example { public class AccountPlugin : Microsoft.Xrm.Sdk.IPlugin { static AccountPlugin(){throw new System.Exception("DO_NOT_EXECUTE_TEST_ASSEMBLY");} public void Execute(System.IServiceProvider p){} } }';
for(const [name,version,extra] of [['original','1.2.0.0',{}],['updated','1.2.1.0',{}],['major','2.0.0.0',{}],
  ['minor','1.3.0.0',{}],['lower','1.1.9.0',{}],['other-key','1.2.1.0',{otherKey:true}],['unsigned','1.2.1.0',{sign:false}],
  ['renamed','1.2.1.0',{assembly:'OtherPlugin'}],['x86','1.2.1.0',{platform:'x86'}]]) {
  compile(name,prefix(version,'.NETFramework,Version=v4.6.2')+plugin,{sdk:sdkStub,...extra});
}
compile('removed',prefix('1.2.1.0','.NETFramework,Version=v4.6.2')+'namespace Example { public class Helper{} }',{sdk:sdkStub});
compile('added',prefix('1.2.1.0','.NETFramework,Version=v4.6.2')+plugin+'namespace Example { public class AddedPlugin: AccountPlugin {} }',{sdk:sdkStub});
compile('framework',prefix('1.2.1.0','.NETFramework,Version=v4.8')+plugin,{sdk:sdkStub});
compile('core',prefix('1.2.1.0','.NETCoreApp,Version=v10.0')+plugin,{sdk:sdkStub});
compile('culture',prefix('1.2.1.0','.NETFramework,Version=v4.6.2','fr-FR')+plugin,{sdk:sdkStub});
compile('inherited',prefix('1.2.1.0','.NETFramework,Version=v4.6.2')+'namespace Example { public abstract class Base:Microsoft.Xrm.Sdk.IPlugin {public void Execute(System.IServiceProvider p){}} public class AccountPlugin:Base{} }',{sdk:sdkStub});
compile('native-import',prefix('1.2.1.0','.NETFramework,Version=v4.6.2')+plugin+'public class Native { [System.Runtime.InteropServices.DllImport("never-call")] public static extern void No(); }',{sdk:sdkStub});
compile('nested',prefix('1.2.1.0','.NETFramework,Version=v4.6.2')+plugin+'public class Container { public class NestedPlugin: Example.AccountPlugin {} }',{sdk:sdkStub});
writeFileSync(join(target,'README.md'),'These DLLs are offline test fixtures compiled from scripts/build-assembly-fixtures.mjs. They reference a test stub, not the genuine Microsoft SDK. Their signing keys are disposable test data. Do not deploy them. No fixture or initializer is executed by the metadata reader. Regeneration requires .NET SDK and a .NET Framework mscorlib reference; D365_FRAMEWORK_REFERENCE_DIR can supply the reference directory.\n');
console.log('Built 18 real managed PE fixtures; no fixture executed.');
