import {SolutionService} from '../src/services/solution.ts';
import {CrmRequestError} from '../src/errors.ts';
import {wrap,parameter} from './apiOperation.fixture.mjs';
export const ids={solution:'11111111-1111-1111-1111-111111111111',object:'22222222-2222-2222-2222-222222222222',parent:'33333333-3333-3333-3333-333333333333',
  membership:'44444444-4444-4444-4444-444444444444',other:'55555555-5555-5555-5555-555555555555',dependency:'66666666-6666-6666-6666-666666666666',
  required:'77777777-7777-7777-7777-777777777777',container:'88888888-8888-8888-8888-888888888888'};
export const env={orgUrl:'https://crm.invalid/Demo',apiVersion:'v9.1',authType:'op_ad'};
export const nativeSolution={solutionid:ids.solution,uniquename:'TestSolution',friendlyname:'Test solution',version:'1.0.0.0',ismanaged:false,isvisible:true,
  _parentsolutionid_value:null,modifiedon:'2026-10-28T01:00:00Z'};
export const edge={dependencyid:ids.dependency,dependencytype:2,dependentcomponentobjectid:ids.object,dependentcomponenttype:61,
  requiredcomponentobjectid:ids.required,requiredcomponenttype:1,requiredcomponentbasesolutionid:ids.solution,dependentcomponentparentid:null,requiredcomponentparentid:null};
const fnNames=['RetrieveRequiredComponents','RetrieveDependentComponents','RetrieveDependenciesForDelete'];
export const csdl=wrap(`<Action Name="AddSolutionComponent">${parameter('ComponentId','Edm.Guid')}${parameter('ComponentType','Edm.Int32')}${parameter('SolutionUniqueName','Edm.String')}${parameter('AddRequiredComponents','Edm.Boolean')}${parameter('DoNotIncludeSubcomponents','Edm.Boolean')}${parameter('IncludedComponentSettingsValues','Collection(Edm.String)')}</Action>`+
  fnNames.map(name=>`<Function Name="${name}">${parameter('ObjectId','Edm.Guid')}${parameter('ComponentType','Edm.Int32')}<ReturnType Type="Collection(mscrm.crmbaseentity)"/></Function>`).join(''),
  '<ActionImport Name="AddSolutionComponent" Action="mscrm.AddSolutionComponent"/>'+fnNames.map(name=>`<FunctionImport Name="${name}" Function="mscrm.${name}"/>`).join(''));
export const addArgs={solution_unique_name:'TestSolution',component_id:ids.object,component_type:61};
export const membership=(overrides={})=>({solutioncomponentid:ids.membership,objectid:ids.object,componenttype:61,_solutionid_value:ids.solution,
  rootcomponentbehavior:1,rootsolutioncomponentid:null,ismetadata:false,...overrides});
function source(type,options){
  const keys={26:'savedqueryid',60:'formid',61:'webresourceid',90:'plugintypeid',91:'pluginassemblyid',92:'sdkmessageprocessingstepid',93:'sdkmessageprocessingstepimageid'};
  return {MetadataId:ids.object,LogicalName:'new_sample',SchemaName:'new_Sample',EntityLogicalName:'new_sample',EntitySetName:'new_samples',IsManaged:false,
    IsGlobal:true,Name:'new_choices',OptionSetType:'Picklist',RelationshipType:'OneToManyRelationship',AttributeType:'String',
    ...(keys[type]?{[keys[type]]:ids.object}:{}),name:'Example',typename:'Company.Plugins.Example',friendlyname:'Example',
    version:'1.0.0.0',ismanaged:false,modifiedon:'2026-10-28T01:00:00Z',configuration:'SECRET_UNSECURE',content:'SECRET_CODE',secureconfig:'SECRET_SECURE',...options.source};
}
export function fixture(options={}){
  const type=options.type ?? 61,calls=[],members=structuredClone(options.members ?? []),target={...structuredClone(nativeSolution),...options.target};let wrote=false;
  const client={validateEndpoint(endpoint){const url=new URL(/^https?:/.test(endpoint)?endpoint:endpoint.replace(/^\//,''),env.orgUrl+'/api/data/v9.1/');
    if(url.origin!=='https://crm.invalid'||!url.pathname.startsWith('/Demo/api/data/v9.1/'))throw new CrmRequestError('D365_ENDPOINT_INVALID','secret-url',{outcome:'not_sent'});return url.href;},
    async requestWithResponse(endpoint,method='GET',data,requestOptions={}){
      const url=new URL(/^https?:/.test(endpoint)?endpoint:endpoint.replace(/^\//,''),env.orgUrl+'/api/data/v9.1/');
      const path=url.pathname.replace('/Demo/api/data/v9.1','');
      const call={endpoint,path,method,data,options:requestOptions,url};calls.push(call);
      const custom=await options.request?.(call,{members,target,wrote});if(custom!==undefined)return custom;
      const ok=data=>({status:200,data:structuredClone(data),headers:{}});
      if(method!=='GET'){
        if(method!=='POST'||path!=='/AddSolutionComponent')throw new Error('Unexpected mutation '+path);
        if(options.writeError)throw options.writeError;
        wrote=true;
        if(!options.noMembership)members.push(membership({componenttype:type,...options.added}));
        if(options.extraMember)members.push(membership({solutioncomponentid:ids.other,objectid:ids.container,componenttype:1,rootcomponentbehavior:2}));
        options.afterWrite?.({members,target});return {status:options.writeStatus ?? 200,data:options.response===undefined?{id:ids.membership}:options.response,headers:{}};
      }
      if(wrote && options.readbackError)throw options.readbackError;
      if(path==='/$metadata')return {status:200,data:options.metadata ?? csdl,headers:{}};
      if(path==='/solutions')return ok({value:options.solutions ?? [target]});
      if(path==='/solutioncomponents')return ok({value:members,...(options.next?{'@odata.nextLink':options.next}:{})});
      if(path.startsWith('/Retrieve'))return ok({value:options.edges ?? [edge],...(options.dependencyNext?{'@odata.nextLink':options.dependencyNext}:{})});
      if(path.startsWith('/EntityDefinitions(LogicalName=')&&!/\/(Attributes|Keys)\(/.test(path))return ok({MetadataId:ids.parent,LogicalName:'new_sample'});
      if(path.startsWith('/EntityDefinitions(')||path.startsWith('/GlobalOptionSetDefinitions(')||path.startsWith('/RelationshipDefinitions(')
        ||['savedqueries','systemforms','webresourceset','plugintypes','pluginassemblies','sdkmessageprocessingsteps','sdkmessageprocessingstepimages'].some(set=>path.startsWith('/'+set+'(')))return ok(source(type,options));
      throw new Error('Unexpected request '+endpoint);
    },async makeRequest(...args){return (await client.requestWithResponse(...args)).data;}};
  return {client,calls,members,target,service:new SolutionService(client,env)};
}
export const writes=f=>f.calls.filter(call=>call.method!=='GET');
export async function execute(f,args=addArgs,signal){const preview=await f.service.add(args,signal);return f.service.add({...args,dry_run:false,expected_hash:preview.planHash,allow_unprotected_write:true},signal);}
