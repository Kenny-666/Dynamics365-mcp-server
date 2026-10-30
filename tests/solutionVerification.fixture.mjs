import {fixture as transferFixture,env,ids,solution,reply} from './solutionTransfer.fixture.mjs';
import {SolutionSnapshotService} from '../src/services/solutionSnapshot.ts';
import {SolutionImportLogService} from '../src/services/solutionImportLog.ts';
import {SolutionVerificationService} from '../src/services/solutionVerification.ts';
export {env,ids,reply};
export const guid=(n,variant=0)=>(n+variant*1000).toString(16).padStart(8,'0')+'-2222-4333-8444-555555555555';
export const label=(value,variant=0)=>({LocalizedLabels:[{LanguageCode:1033,Label:value,MetadataId:guid(800,variant),IsManaged:!!variant},
  {LanguageCode:2052,Label:value+' 中文',MetadataId:guid(801,variant)}],UserLocalizedLabel:{Label:'DO_NOT_COMPARE_USER_LABEL',LanguageCode:1033}});
export const logXml=`<importexportxml progress="100"><solutionManifests><solutionManifest id="TransferDemo"><UniqueName>TransferDemo</UniqueName><result result="success" errorcode="0" errortext=""/></solutionManifest></solutionManifests>
<optionSets><optionSet id="demo_choices"><result result="failure" errorcode="-2140000000" errortext="SECRET_BUSINESS password=secret-password client_secret=secret-client Bearer secret-bearer"/></optionSet></optionSets>
<webResources><webResource id="${guid(61)}"><result result="warning" errorcode="0x80040000" errortext="SECRET_WARNING"/></webResource></webResources></importexportxml>`;
export function fixture(options={}) {
  const variant=options.variant??0,target={...solution,solutionid:guid(999,variant),...options.solution};
  const sources={
    1:{MetadataId:guid(1,variant),LogicalName:'demo_table',SchemaName:'demo_Table',EntitySetName:'demo_tables',PrimaryIdAttribute:'demo_tableid',PrimaryNameAttribute:'demo_name',OwnershipType:'UserOwned',IsActivity:false,
      IsAuditEnabled:{Value:true,CanBeChanged:false,ManagedPropertyLogicalName:'ignored'},DisplayName:label('Table',variant),DisplayCollectionName:label('Tables',variant),Description:label('Description',variant),IsManaged:false},
    9:{MetadataId:guid(9,variant),Name:'demo_choices',IsGlobal:true,OptionSetType:'Picklist',DisplayName:label('Choice',variant),Description:label('Description',variant),IsManaged:false,
      Options:[{Value:1,Label:label('One',variant),Description:label('First',variant),Color:null},{Value:2,Label:label('Two',variant),Description:label('Second',variant),Color:'#FFFFFF'}]},
    10:{MetadataId:guid(10,variant),SchemaName:'demo_table_parent',RelationshipType:'OneToManyRelationship',IsManaged:false,ReferencedEntity:'demo_parent',ReferencedAttribute:'demo_parentid',ReferencingEntity:'demo_table',ReferencingAttribute:'demo_parentid',
      CascadeConfiguration:{Assign:'NoCascade',Delete:'Restrict',Merge:'NoCascade',Reparent:'NoCascade',Share:'NoCascade',Unshare:'NoCascade'}},
    61:{webresourceid:guid(61,variant),name:'demo_/main.js',displayname:'Script',webresourcetype:3,content:Buffer.from("console.log('fixture');").toString('base64'),ismanaged:false},
    91:{pluginassemblyid:guid(91,variant),name:'Demo.Plugin',version:'1.2.3.4',culture:'neutral',publickeytoken:'abcdef0123456789',sourcetype:0,isolationmode:2,content:Buffer.from('inert-not-a-DLL-content').toString('base64'),_packageid_value:null,ismanaged:false},
  };
  for(const [type,changes] of Object.entries(options.sources??{}))Object.assign(sources[type],changes);
  const members=options.members??[1,9,10,61,91].map(type=>({solutioncomponentid:guid(type+100,variant),objectid:guid(type,variant),componenttype:type,_solutionid_value:target.solutionid,rootcomponentbehavior:1,rootsolutioncomponentid:null,ismetadata:type<60}));
  let membershipReads=0;
  const base=transferFixture({solutions:[target],identity:{OrganizationId:guid(997,variant),UserId:guid(998,variant),...options.identity},request:async call=>{
    const custom=await options.request?.(call,{members,sources,target,membershipReads});if(custom!==undefined)return custom;
    if(call.path==='/solutions')return reply({value:[target]});
    if(call.path==='/solutioncomponents'){membershipReads++;return reply({value:structuredClone(members)});}
    if(call.path.startsWith('/importjobs('))return reply({importjobid:call.path.slice(12,-1),solutionid:target.solutionid,solutionname:target.uniquename,progress:100,completedon:'2026-10-28T00:00:00Z',data:options.log??logXml,...options.job});
    for(const [type,source] of Object.entries(sources))if(call.path.includes(guid(Number(type),variant)))return reply({...structuredClone(source),configuration:'SECRET_CONFIGURATION',password:'SECRET_PASSWORD',modifiedon:'2026-10-28T00:00:00Z'});
    return undefined;
  }});
  return {...base,members,sources,target,snapshotService:new SolutionSnapshotService(base.client,env),logService:new SolutionImportLogService(base.client,env,options.secrets??[]),verificationService:new SolutionVerificationService(base.client,env)};
}
export const capture=async(f,args={})=>(await f.snapshotService.capture({solution_unique_name:'TransferDemo',...args})).snapshot;
export const writes=f=>f.calls.filter(call=>call.method!=='GET');
