import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,realpath,readdir} from 'node:fs/promises';
import {basename,dirname,extname,isAbsolute,join,resolve} from 'node:path';
import {implementationDocx,uatWorkbook,prototypeHtml} from './consultantArtifacts.js';
import {guid} from './recordMutationInput.js';
type Row=Record<string,any>;
const MAX_SPEC=2*1024*1024,MAX_MATERIAL=16*1024*1024;
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
function fail(message:string):never{throw new Error(message);}
function projectId(value:unknown):string {if(typeof value!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value))return fail('project_id must be 1–48 letters, numbers, underscores or hyphens and start with a letter.');return value;}
function object(value:unknown,allowed:string[]):Row {if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))return fail('Invalid consultant arguments.');return value as Row;}
function smallText(value:unknown,field:string,max=200):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))return fail(`${field} is invalid.`);return value.trim();}
function root():string{const path=process.env.D365_CONSULTANT_DIR;if(!path||!isAbsolute(path)||path.startsWith('\\\\')||path.startsWith('//'))return fail('D365_CONSULTANT_DIR must identify an existing absolute local directory.');return resolve(path);}
async function rootPath():Promise<string>{const path=root(),info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())return fail('The consultant root must be an existing regular directory.');return realpath(path);}
async function projectPath(id:string):Promise<string>{const base=await rootPath(),path=join(base,id),info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())return fail('The project must be a regular directory.');const actual=await realpath(path);if(dirname(actual).toLowerCase()!==base.toLowerCase())return fail('The project is outside the consultant root.');let project:Row;try{project=JSON.parse((await boundedRead(join(actual,'project.json'),4096)).toString('utf8'));}catch{return fail('The project manifest is missing or invalid.');}if(project?.version!==1||project.id!==id)return fail('The project manifest does not match the project.');return actual;}
async function writeExclusive(path:string,data:string|Buffer){const file=await open(path,'wx',0o600);try{await file.writeFile(data);await file.sync();}finally{await file.close();}}
async function boundedRead(path:string,limit:number):Promise<Buffer>{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>limit)return fail('The source must be a regular file within the size limit.');const file=await open(path,'r');try{const before=await file.stat();if(!before.isFile()||before.size>limit)return fail('The source file is invalid.');const bytes=Buffer.alloc(before.size+1);let n=0;while(n<bytes.length){const result=await file.read(bytes,n,bytes.length-n,n);if(!result.bytesRead)break;n+=result.bytesRead;}const after=await file.stat();if(n!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)return fail('The source file changed during reading.');return bytes.subarray(0,n);}finally{await file.close();}}
async function manifest(project:string,id:string):Promise<Row>{const data=await boundedRead(join(project,'asset-'+guid(id)+'.json'),MAX_SPEC+4096);let value:Row;try{value=JSON.parse(data.toString('utf8'));}catch{return fail('The asset manifest is malformed.');}if(!value||value.version!==1||value.id!==id||!['document','uat','prototype','material'].includes(value.kind)||!/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.filename!=='string'||!new RegExp('^asset-'+id+'\\.(docx|xlsx|html|txt|md|pdf|csv)$').test(value.filename)||typeof value.title!=='string'||value.title.length>200||!Number.isSafeInteger(value.size)||value.size<0||value.size>MAX_MATERIAL||typeof value.createdAt!=='string')return fail('The asset manifest is invalid.');return value;}
function produce(kind:string,spec:unknown):{bytes:Buffer;extension:string}{if(kind==='document')return {bytes:implementationDocx(spec),extension:'.docx'};if(kind==='uat')return {bytes:uatWorkbook(spec),extension:'.xlsx'};if(kind==='prototype')return {bytes:prototypeHtml(spec),extension:'.html'};return fail('Unsupported generated asset type.');}
async function saveAsset(project:string,kind:string,title:string,bytes:Buffer,extension:string,spec?:unknown){
 if(spec!==undefined&&Buffer.byteLength(JSON.stringify(spec))>MAX_SPEC)return fail('The asset specification is too large.');
 const id=randomUUID(),filename='asset-'+id+extension,assetPath=join(project,filename),metaPath=join(project,'asset-'+id+'.json');
 const meta={version:1,id,kind,title,filename,size:bytes.length,sha256:hash(bytes),createdAt:new Date().toISOString(),...(spec===undefined?{}:{spec})};
 await writeExclusive(assetPath,bytes);try{await writeExclusive(metaPath,JSON.stringify(meta));}catch{return fail('The asset was created but its manifest could not be saved; inspect the project directory before retrying.');}
 return {assetId:id,kind,title,path:assetPath,size:bytes.length,sha256:meta.sha256};
}
/** Local, opt-in consultant workspace. No CRM connection or external upload. */
export async function consultantProject(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('Expected consultant arguments.');const action=(raw as Row).action;
 if(action==='create_project'){
  const a=object(raw,['action','project_id','name']),id=projectId(a.project_id),name=smallText(a.name,'name'),base=await rootPath(),path=join(base,id);
  await mkdir(path,{recursive:false,mode:0o700});await writeExclusive(join(path,'project.json'),JSON.stringify({version:1,id,name,createdAt:new Date().toISOString()}));return {projectId:id,name,path};
 }
 const a=raw as Row,id=projectId(a.project_id),project=await projectPath(id);
 if(action==='list_assets'){
  object(raw,['action','project_id']);const names=await readdir(project);if(names.length>3000)return fail('Project has too many files to list safely.');
  const files=names.filter(n=>/^asset-[a-f0-9-]{36}\.json$/.test(n));if(files.length>1000)return fail('Project has too many assets.');
  const items=[];for(const file of files){const assetId=file.slice(6,-5);try{const m=await manifest(project,assetId);items.push({id:m.id,kind:m.kind,title:m.title,size:m.size,sha256:m.sha256,createdAt:m.createdAt,path:join(project,m.filename)});}catch{continue;}}
  items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return {projectId:id,items,count:items.length,note:'Unrecognized or invalid manifests are excluded.'};
 }
 if(action==='import_material'){
  object(raw,['action','project_id','file_path','title']);if(typeof a.file_path!=='string'||!isAbsolute(a.file_path)||a.file_path.startsWith('\\\\')||a.file_path.startsWith('//'))return fail('file_path must be an absolute local path.');
  const extension=extname(a.file_path).toLowerCase();if(!['.txt','.md','.pdf','.docx','.xlsx','.csv'].includes(extension))return fail('Unsupported material extension.');
  const bytes=await boundedRead(a.file_path,MAX_MATERIAL);return saveAsset(project,'material',smallText(a.title??basename(a.file_path),'title'),bytes,extension);
 }
 if(['generate_document','generate_uat','generate_prototype'].includes(action)){
  object(raw,['action','project_id','title','spec']);const kind=action==='generate_document'?'document':action==='generate_uat'?'uat':'prototype',title=smallText(a.title,'title');
  if(Buffer.byteLength(JSON.stringify(a.spec)??'')>MAX_SPEC)return fail('The asset specification is too large.');const generated=produce(kind,a.spec);return saveAsset(project,kind,title,generated.bytes,generated.extension,a.spec);
 }
 if(action==='restore_asset'){
  object(raw,['action','project_id','asset_id']);const old=await manifest(project,guid(a.asset_id));if(!['document','uat','prototype'].includes(old.kind)||old.spec===undefined)return fail('Only generated assets with retained specifications can be restored.');
  const generated=produce(old.kind,old.spec);return {...await saveAsset(project,old.kind,smallText(old.title,'title'),generated.bytes,generated.extension,old.spec),restoredFrom:old.id};
 }
 if(action==='compare_document_versions'){
  object(raw,['action','project_id','from_asset_id','to_asset_id']);const from=await manifest(project,guid(a.from_asset_id)),to=await manifest(project,guid(a.to_asset_id));
  if(from.kind!=='document'||to.kind!=='document'||!Array.isArray(from.spec?.sections)||!Array.isArray(to.spec?.sections))return fail('Both assets must be generated documents.');
  const count=Math.max(from.spec.sections.length,to.spec.sections.length),changes=[];
  for(let i=0;i<count;i++){const left=from.spec.sections[i],right=to.spec.sections[i];if(JSON.stringify(left)!==JSON.stringify(right))changes.push({position:i+1,change:!left?'added':!right?'removed':'modified',beforeHeading:left?.heading??null,afterHeading:right?.heading??null});}
  return {projectId:id,fromAssetId:from.id,toAssetId:to.id,titleChanged:from.spec.title!==to.spec.title,changes,note:'Sections are compared by position; body content is not returned.'};
 }
 return fail('Unknown consultant project action.');
}
