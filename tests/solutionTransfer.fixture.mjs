import {deflateRawSync} from 'node:zlib';
import {crc32} from '../src/services/solutionPackage.ts';
import {SolutionTransferService} from '../src/services/solutionTransfer.ts';
export const ids={solution:'11111111-2222-4333-8444-555555555555',async:'22222222-2222-4333-8444-555555555555',job:'33333333-2222-4333-8444-555555555555',
  org:'44444444-2222-4333-8444-555555555555',user:'55555555-2222-4333-8444-555555555555',bu:'66666666-2222-4333-8444-555555555555'};
export const env={orgUrl:'https://crm.invalid/Demo',apiVersion:'v9.1',authType:'ad'};
export const solution={solutionid:ids.solution,uniquename:'TransferDemo',friendlyname:'Transfer demo',version:'1.2.3.4',ismanaged:false,isvisible:true,_parentsolutionid_value:null,modifiedon:'2026-10-28T00:00:00Z'};
export const manifest=`<?xml version="1.0" encoding="utf-8"?><ImportExportXml version="9.1"><SolutionManifest><UniqueName>TransferDemo</UniqueName><Version>1.2.3.4</Version><Managed>0</Managed><Publisher><UniqueName>DemoPublisher</UniqueName><CustomizationPrefix>demo</CustomizationPrefix></Publisher><RootComponents><RootComponent type="1" schemaName="demo_table" behavior="0"/></RootComponents><MissingDependencies/></SolutionManifest></ImportExportXml>`;
export function archive(options={}) {
  const entries=options.entries??[{name:'solution.xml',content:options.manifest??manifest},{name:'customizations.xml',content:'<ImportExportXml/>'},{name:'[Content_Types].xml',content:'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'}];
  const locals=[],centrals=[],records=[];let position=0;
  for(const e of entries){const name=Buffer.from(e.name),payload=Buffer.isBuffer(e.content)?e.content:Buffer.from(e.content??''),method=e.method??8,flags=e.flags??0x800,
    compressed=method===8?deflateRawSync(payload):payload,crc=crc32(payload),extra=e.extra??Buffer.alloc(0),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);
    if(!(flags&8)){local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(payload.length,22);}local.writeUInt16LE(name.length,26);local.writeUInt16LE(extra.length,28);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(payload.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(extra.length,30);central.writeUInt32LE(position,42);
    const descriptor=Buffer.alloc(flags&8?(e.descriptorSignature===false?12:16):0);if(descriptor.length){let p=0;if(descriptor.length===16){descriptor.writeUInt32LE(0x08074b50);p=4;}descriptor.writeUInt32LE(crc,p);descriptor.writeUInt32LE(compressed.length,p+4);descriptor.writeUInt32LE(payload.length,p+8);}
    records.push({local:position,data:position+30+name.length+extra.length,compressedSize:compressed.length,central:0});locals.push(local,name,extra,compressed,descriptor);centrals.push(central,name,extra);position+=local.length+name.length+extra.length+compressed.length+descriptor.length;
  }
  const start=position;let c=start;for(let i=0;i<records.length;i++){records[i].central=c;c+=centrals[i*3].length+centrals[i*3+1].length+centrals[i*3+2].length;}
  const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(start,16);
  const bytes=Buffer.concat([...locals,directory,end]);options.mutate?.(bytes,records,{start,end:bytes.length-22});return bytes;
}
const p=(name,type,nullable=false)=>`<Parameter Name="${name}" Type="${type}" Nullable="${nullable}"/>`;
export const csdl=`<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx" Version="4.0"><edmx:DataServices><Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="Microsoft.Dynamics.CRM" Alias="mscrm">
  <EntityType Name="crmbaseentity" Abstract="true"/>
  <ComplexType Name="ExportSolutionResponse"><Property Name="ExportSolutionFile" Type="Edm.Binary"/></ComplexType>
  <ComplexType Name="ImportSolutionAsyncResponse"><Property Name="AsyncOperationId" Type="Edm.Guid"/><Property Name="ImportJobKey" Type="Edm.String"/></ComplexType>
  <Action Name="ExportSolution">${p('SolutionName','Edm.String')}${p('Managed','Edm.Boolean')}${p('ExportGeneralSettings','Edm.Boolean',true)}<ReturnType Type="mscrm.ExportSolutionResponse"/></Action>
  <Action Name="ImportSolutionAsync">${p('CustomizationFile','Edm.Binary',true)}${p('ImportJobId','Edm.Guid',true)}${p('OverwriteUnmanagedCustomizations','Edm.Boolean')}${p('PublishWorkflows','Edm.Boolean')}
  ${p('ComponentParameters','Collection(mscrm.crmbaseentity)')}${p('HoldingSolution','Edm.Boolean',true)}${p('StageAndUpgrade','Edm.Boolean',true)}${p('SkipProductUpdateDependencies','Edm.Boolean',true)}<ReturnType Type="mscrm.ImportSolutionAsyncResponse"/></Action>
  <EntityContainer Name="DefaultContainer"><ActionImport Name="ExportSolution" Action="mscrm.ExportSolution"/><ActionImport Name="ImportSolutionAsync" Action="mscrm.ImportSolutionAsync"/></EntityContainer>
</Schema></edmx:DataServices></edmx:Edmx>`;
export const reply=(data,status=200)=>({data,status,headers:{}});
export function fixture(options={}) {
  const calls=[],bytes=options.bytes??archive();let submission;
  const client={async makeRequest(...args){return (await this.requestWithResponse(...args)).data;},async requestWithResponse(endpoint,method='GET',body,requestOptions){
    const url=new URL(endpoint.replace(/^\//,''),env.orgUrl+'/api/data/'+env.apiVersion+'/'),path=decodeURIComponent(url.pathname.replace('/Demo/api/data/v9.1',''));
    const call={endpoint,url,path,method,body,options:requestOptions};calls.push(call);const custom=await options.request?.(call);if(custom!==undefined)return custom;
    if(path==='/WhoAmI')return reply({OrganizationId:ids.org,UserId:ids.user,BusinessUnitId:ids.bu,...options.identity});
    if(path==='/$metadata')return reply(options.metadata??csdl);
    if(path==='/solutions')return reply({value:options.solutions??[]});
    if(path==='/ExportSolution')return reply({ExportSolutionFile:bytes.toString('base64')});
    if(path==='/ImportSolutionAsync'){submission=body;return reply(options.receipt??{AsyncOperationId:ids.async,ImportJobKey:body.ImportJobId});}
    if(path===`/asyncoperations(${ids.async})`)return reply({asyncoperationid:ids.async,statecode:3,statuscode:30,operationtype:203,...options.async});
    if(path.startsWith('/importjobs('))return reply({importjobid:path.slice(12,-1),solutionid:ids.solution,solutionname:'TransferDemo',progress:100,...options.job});
    throw Error('Unmocked transfer route '+method+' '+path);
  }};
  return {calls,bytes,client,service:new SolutionTransferService(client,env),get submission(){return submission;}};
}
export const writes=f=>f.calls.filter(c=>c.method!=='GET');
export async function executeImport(f,args={content_base64:f.bytes.toString('base64')}){const preview=await f.service.import(args);return f.service.import({...args,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true});}
