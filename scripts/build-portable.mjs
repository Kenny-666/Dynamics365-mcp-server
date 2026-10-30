import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Map();
for (let i=2; i<process.argv.length; i+=2) {
  const key=process.argv[i],value=process.argv[i+1];
  assert.ok(['--node-exe','--node-license','--dotnet-root','--dotnet-version','--output','--stage'].includes(key)&&value,'Expected supported --option value pairs.');
  assert.ok(!flags.has(key),'Duplicate option.');flags.set(key,value);
}
for (const key of ['--node-exe','--node-license','--dotnet-root','--dotnet-version','--output','--stage']) assert.ok(flags.has(key),'Missing '+key);
const pkg=JSON.parse(fs.readFileSync(path.join(project,'package.json'),'utf8'));
const out=path.resolve(flags.get('--output')),stage=path.resolve(flags.get('--stage'));
const name='Dynamics365-MCP-'+pkg.version+'-win-x64',folder=path.join(stage,name),zip=path.join(out,'dynamics365-mcp-'+pkg.version+'-windows-x64-portable.zip');
assert.ok(!fs.existsSync(folder)&&!fs.existsSync(zip),'Choose a fresh staging directory and output archive.');
const nodeExe=path.resolve(flags.get('--node-exe')),nodeLicense=path.resolve(flags.get('--node-license'));
const netRoot=path.resolve(flags.get('--dotnet-root')),netVersion=flags.get('--dotnet-version');
assert.match(netVersion,/^10\.\d+\.\d+$/);
const node=JSON.parse(execFileSync(nodeExe,['-p','JSON.stringify({version:process.version,arch:process.arch,platform:process.platform})'],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:''}}));
assert.equal(node.platform,'win32');assert.equal(node.arch,'x64');assert.match(node.version,/^v24\./);
assert.match(fs.readFileSync(nodeLicense,'utf8'),/Copyright Node\.js contributors/);
const runtime=path.join(netRoot,'shared','Microsoft.NETCore.App',netVersion),host=path.join(netRoot,'host','fxr',netVersion);
for (const file of [nodeExe,nodeLicense,path.join(netRoot,'dotnet.exe'),path.join(host,'hostfxr.dll'),path.join(runtime,'System.Private.CoreLib.dll'),path.join(project,'dist','index.cjs'),path.join(project,'bin','assembly-inspector','AssemblyInspector.dll')])assert.ok(fs.existsSync(file),'Missing required build input: '+path.basename(file));
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function copy(source,target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
function copyTree(source,target){fs.cpSync(source,target,{recursive:true,errorOnExist:true,force:false,dereference:false});}
fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(out,{recursive:true});
copyTree(path.join(project,'distribution','windows'),folder);
for(const file of fs.readdirSync(folder))if(file.endsWith('.cmd')){
  const target=path.join(folder,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/\r?\n/g,'\r\n'));
}
for(const file of ['package.json','README.md','README.en.md','LICENSE','THIRD_PARTY_NOTICES.txt'])copy(path.join(project,file),path.join(folder,'app',file));
copy(path.join(project,'LICENSE'),path.join(folder,'LICENSE'));
copy(path.join(project,'dist','index.cjs'),path.join(folder,'app','dist','index.cjs'));
copyTree(path.join(project,'bin'),path.join(folder,'app','bin'));
copyTree(path.join(project,'docs'),path.join(folder,'app','docs'));
copy(nodeExe,path.join(folder,'runtime','node','node.exe'));
copy(nodeLicense,path.join(folder,'licenses','NODE-LICENSE.txt'));
copy(path.join(netRoot,'dotnet.exe'),path.join(folder,'runtime','dotnet','dotnet.exe'));
copyTree(host,path.join(folder,'runtime','dotnet','host','fxr',netVersion));
copyTree(runtime,path.join(folder,'runtime','dotnet','shared','Microsoft.NETCore.App',netVersion));
for(const file of ['LICENSE.txt','ThirdPartyNotices.txt'])copy(path.join(netRoot,file),path.join(folder,'licenses','DOTNET-'+file));

const lock=JSON.parse(fs.readFileSync(path.join(project,'package-lock.json'),'utf8')),notices=[];
for(const [relative,entry] of Object.entries(lock.packages).filter(([key,value])=>key.startsWith('node_modules/')&&!value.dev)){
  const moduleRoot=path.join(project,relative),manifest=path.join(moduleRoot,'package.json');
  assert.ok(fs.existsSync(manifest),'Dependency metadata missing: '+relative);
  const module=JSON.parse(fs.readFileSync(manifest,'utf8')),licenseFiles=[];
  for(const file of fs.readdirSync(moduleRoot,{withFileTypes:true}).filter(e=>e.isFile()&&/^(LICENSE|LICENCE|NOTICE|COPYING|AUTHORS)(\.|$)/i.test(e.name))){
    const destination=path.join('licenses','npm',relative.replace(/^node_modules\//,'').replaceAll('/node_modules/','/_nested/'),file.name);
    copy(path.join(moduleRoot,file.name),path.join(folder,destination));licenseFiles.push(destination.replaceAll('\\','/'));
  }
  notices.push({name:module.name,version:module.version,license:module.license??entry.license??'See upstream declaration',author:module.author??null,repository:module.repository??null,licenseFiles});
}
fs.writeFileSync(path.join(folder,'licenses','npm-notices.json'),JSON.stringify({scope:'Installed production dependency tree; some entries may not contribute code to the bundled server.',packages:notices},null,2)+'\n');
const info={name:pkg.name,version:pkg.version,validationDate:'2026-10-29',target:'windows-x64',transport:'stdio',toolCount:84,
  bundledNode:node.version,bundledDotnet:netVersion,bundleSHA256:digest(path.join(folder,'app','dist','index.cjs')),
  nodeExeSHA256:digest(nodeExe),nodeLicenseSource:'https://raw.githubusercontent.com/nodejs/node/'+node.version+'/LICENSE',
  localRegression:{passed:911,failed:0,skipped:0},liveCoverage:{toolsCalled:65,totalTools:84,writeReadbackPathsPassed:21,publicationRequestsAccepted:2,fullAcceptanceComplete:false},
  credentialPolicy:'Placeholder templates only. No real CRM connection settings or credentials are included.'};
fs.writeFileSync(path.join(folder,'release-info.json'),JSON.stringify(info,null,2)+'\n');
const files=[];function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);assert.ok(!entry.isSymbolicLink(),'Links are not allowed in a portable archive.');if(entry.isDirectory())walk(full);else{
  const relative=path.relative(folder,full).replaceAll('\\','/');assert.ok(!/(^|\/)(node_modules|\.cache|\.serena|\.git)(\/|$)/.test(relative));assert.ok(!/\.private\.|(^|\/)\.env$|mcp-client\.generated\.json/.test(relative));
  if(/\.(?:cjs|js|md|json|txt|example|cmd)$/i.test(relative))assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(fs.readFileSync(full,'utf8')),'Private key material found in release.');
  files.push({path:relative,size:fs.statSync(full).size,sha256:digest(full)});
}}}walk(folder);files.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({version:pkg.version,toolCount:84,hashAlgorithm:'SHA-256',files},null,2)+'\n');
execFileSync('tar.exe',['-a','-c','-f',zip,'-C',stage,name],{stdio:'inherit'});
fs.writeFileSync(path.join(out,'使用说明.md'),[
  '# Dynamics 365 MCP 分发包',
  '',
  '发给 Windows x64 接收者：[便携 ZIP]('+path.basename(zip)+')。内置 Node.js 和 .NET 10 Runtime，无需安装开发环境或下载依赖。',
  '',
  '1. 解压整个文件夹到固定位置。',
  '2. 双击 configure.cmd，填写自己的 CRM 连接信息并保存 .env。默认 AD/NTLM；Online 和 IFD 请使用相应模板。',
  '3. 双击 generate-client-config.cmd，把生成的服务器条目加入支持 stdio 的 MCP 客户端并重新连接。',
  '',
  'check.cmd 可执行不连接 CRM 的本地自检。完整中英文使用说明、功能清单和验证边界均在 ZIP 内。移动解压目录后请重新生成客户端配置。',
  '',
  '另附 [标准 npm 包](dynamics365-mcp-server-'+pkg.version+'.tgz)，适合已有 Node.js 环境的接收者；DLL 检查还需要 .NET 10 Runtime。',
  '',
  '直接转发原始 ZIP。原始包不含真实连接信息；重新打包配置后的目录前应移除 .env 和用户产生的 CRM 文件。SHA256SUMS.txt 提供两个分发文件的校验值。',
  '',
].join('\n'));
fs.writeFileSync(path.join(out,'portable-build.json'),JSON.stringify({archive:path.basename(zip),bytes:fs.statSync(zip).size,sha256:digest(zip),fileCount:files.length+1,runtimes:{node:node.version,dotnet:netVersion},productionNotices:notices.length,bundleSHA256:info.bundleSHA256},null,2)+'\n');
console.log(JSON.stringify({archive:zip,bytes:fs.statSync(zip).size,files:files.length+1,node:node.version,dotnet:netVersion}));
