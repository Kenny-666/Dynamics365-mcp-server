import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CrmRequestError} from '../src/errors.ts';
import {buildRibbonCandidate,packageRibbon} from '../src/services/ribbon.ts';
import {serializeRibbon} from '../src/services/ribbonXml.ts';
import {RibbonDeploymentService} from '../src/services/ribbonDeployment.ts';
import {fixture as baseFixture,csdl as transferCsdl,env,ids,solution,reply,archive,manifest} from './solutionTransfer.fixture.mjs';
import {solutionZip,csdl as ribbonCsdl,add} from './ribbon.fixture.mjs';
export {env,ids,reply,solutionZip,archive,manifest,add};
const transferSchema=transferCsdl.match(/<Schema\b[^>]*>([\s\S]*?)<\/Schema>/)[1],transferTypes=transferSchema.replace(/<EntityContainer\b[\s\S]*?<\/EntityContainer>/,''),actionImports=transferSchema.match(/<ActionImport\b[^>]*\/>/g).join('');
export const csdl=ribbonCsdl.replace('<EntityContainer Name="DefaultContainer">',transferTypes+'<Action Name="PublishXml"><Parameter Name="ParameterXml" Type="Edm.String" Nullable="false"/></Action><EntityContainer Name="DefaultContainer">'+actionImports+'<ActionImport Name="PublishXml" Action="mscrm.PublishXml"/>');
export const tableId='77777777-2222-4333-8444-555555555555',publisherId='88888888-2222-4333-8444-555555555555';
export const successLog='<importexportxml progress="100"><solutionManifests><solutionManifest><UniqueName>TransferDemo</UniqueName><result result="success" errorcode="0" errortext=""/></solutionManifest></solutionManifests><rootComponents><rootComponent><result result="success" errorcode="0"/></rootComponent></rootComponents></importexportxml>';
export function effective(bytes){const view=packageRibbon(bytes,'demo_table'),root=view.ribbon;
  const section=tag=>{const value=Array.from(root.childNodes).find(n=>n.nodeType===1&&n.nodeName===tag);return value?serializeRibbon(value):'<'+tag+'/>';};
  const buttons=Array.from(root.getElementsByTagName('Button')).map(serializeRibbon).join('');
  return '<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs><Tab Id="Mscrm.Form.demo_table.MainTab"><Groups><Group Id="Mscrm.Form.demo_table.MainTab.Actions"><Controls Id="Mscrm.Form.demo_table.MainTab.Actions.Controls">'+buttons+'</Controls></Group></Groups></Tab></Tabs></Ribbon></UI>'+section('CommandDefinitions')+section('RuleDefinitions')+section('LocLabels')+'</RibbonDefinition></RibbonDefinitions>';
}
export async function withFixture(options,run){
  const dir=await mkdtemp(join(tmpdir(),'d365-ribbon-deploy-'));
  try{
    const source=options.source??solutionZip(),changes=options.changes??[add],built=buildRibbonCandidate(source,'demo_table',changes),candidate=options.candidate??built.candidate;
    const sourcePath=join(dir,'source.zip'),candidatePath=join(dir,'candidate.zip');await writeFile(sourcePath,source);await writeFile(candidatePath,candidate);
    const target={...solution,...options.target},members=options.members??[{solutioncomponentid:ids.bu,objectid:tableId,componenttype:1,_solutionid_value:target.solutionid,rootcomponentbehavior:1,rootsolutioncomponentid:null,ismetadata:true}];
    const state={imported:false,published:false,importJobId:ids.job,importBody:null,exportBytes:options.exportBytes??source};
    const base=baseFixture({request:async call=>{
      const custom=await options.request?.(call,state);if(custom!==undefined)return custom;
      const p=call.path;
      if(p==='/WhoAmI')return reply({OrganizationId:ids.org,UserId:ids.user,BusinessUnitId:ids.bu,...options.identity});
      if(p==='/$metadata')return reply(options.metadata??csdl);
      if(p==='/solutions')return reply({value:options.solutions??[target]});
      if(p===`/solutions(${target.solutionid})`)return reply({solutionid:target.solutionid,_publisherid_value:publisherId,...options.solutionLookup});
      if(p===`/publishers(${publisherId})`)return reply({publisherid:publisherId,uniquename:'DemoPublisher',customizationprefix:'demo',...options.publisher});
      if(p.startsWith('/EntityDefinitions('))return reply({MetadataId:tableId,LogicalName:'demo_table',IsCustomizable:{Value:true},...options.table});
      if(p==='/solutioncomponents')return reply({value:members,...options.memberPage});
      if(p==='/ExportSolution')return reply({ExportSolutionFile:state.exportBytes.toString('base64')});
      if(p==='/ImportSolutionAsync'){
        state.importBody=call.body;state.importJobId=call.body.ImportJobId;
        if(options.importError)throw options.importError;
        if(options.importStatus)return reply({message:'SECRET_IMPORT'},options.importStatus);
        state.imported=true;return reply(options.importResponse??{AsyncOperationId:ids.async,ImportJobKey:state.importJobId});
      }
      if(p===`/asyncoperations(${ids.async})`)return reply({asyncoperationid:ids.async,statecode:3,statuscode:30,operationtype:203,...options.async});
      if(p.startsWith('/importjobs('))return reply({importjobid:p.slice(12,-1),solutionid:target.solutionid,solutionname:target.uniquename,progress:100,completedon:'2026-10-29T00:00:00Z',data:options.log??successLog,...options.job});
      if(p==='/PublishXml'){
        if(options.publishError)throw options.publishError;
        if(options.publishStatus)return reply({message:'SECRET_PUBLISH'},options.publishStatus);
        state.published=true;return reply(null,204);
      }
      if(p.startsWith('/RetrieveEntityRibbon(')){
        if(state.published&&options.readbackError)throw options.readbackError;
        const xml=state.published?(options.publishedXml??effective(candidate)):effective(source);
        return reply({CompressedEntityXml:archive({entries:[{name:'RibbonXml.xml',content:xml},{name:'[Content_Types].xml',content:'<Types/>'}]}).toString('base64')});
      }
      throw new CrmRequestError('UNMOCKED','Unmocked fixture route',{outcome:'not_sent'});
    }});
    const args={source_file_path:sourcePath,candidate_file_path:candidatePath,logical_name:'demo_table',changes},f={...base,args,state,source,candidate,built,dir,target,members,service:new RibbonDeploymentService(base.client,env)};
    return await run(f);
  }finally{await rm(dir,{recursive:true,force:true});}
}
export const imports=f=>f.calls.filter(c=>c.path==='/ImportSolutionAsync');
export const publishes=f=>f.calls.filter(c=>c.path==='/PublishXml');
export async function submit(f,service=f.service){const preview=await service.import(f.args);return service.import({...f.args,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true,allow_full_solution_import:true});}
export async function publish(f,receipt,service=f.service){const args={...f.args,import_receipt:receipt},preview=await service.publish(args);return service.publish({...args,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true,allow_full_table_publish:true});}
