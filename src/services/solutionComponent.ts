import {objectId,name,fail,project,row,type Row,type SolutionReader} from './solutionSupport.js';
export const COMPONENT_TYPES:Record<number,string> = {1:'Entity',2:'Attribute',9:'Option Set',10:'Entity Relationship',14:'Entity Key',26:'Saved Query',
  60:'System Form',61:'Web Resource',90:'Plugin Type',91:'Plugin Assembly',92:'Plugin Step',93:'Plugin Image'};
const records:Record<number,{set:string;key:string;fields:string}> = {
  26:{set:'savedqueries',key:'savedqueryid',fields:'savedqueryid,name,returnedtypecode,querytype,ismanaged,modifiedon'},
  60:{set:'systemforms',key:'formid',fields:'formid,name,objecttypecode,type,ismanaged,modifiedon'},
  61:{set:'webresourceset',key:'webresourceid',fields:'webresourceid,name,displayname,webresourcetype,ismanaged,modifiedon'},
  90:{set:'plugintypes',key:'plugintypeid',fields:'plugintypeid,typename,friendlyname,isworkflowactivity,ismanaged,modifiedon'},
  91:{set:'pluginassemblies',key:'pluginassemblyid',fields:'pluginassemblyid,name,version,sourcetype,ismanaged,modifiedon'},
  92:{set:'sdkmessageprocessingsteps',key:'sdkmessageprocessingstepid',fields:'sdkmessageprocessingstepid,name,stage,mode,statecode,ismanaged,modifiedon'},
  93:{set:'sdkmessageprocessingstepimages',key:'sdkmessageprocessingstepimageid',fields:'sdkmessageprocessingstepimageid,name,entityalias,imagetype,ismanaged,modifiedon'},
};
/** Resolve only identity/display metadata; never retrieve code, XML, credentials or plugin configuration. */
export async function resolveComponent(reader:SolutionReader,id:string,type:number,table?:unknown):Promise<Row> {
  if (!Object.hasOwn(COMPONENT_TYPES,type)) fail('COMPONENT_UNSUPPORTED','This component type is not supported for controlled add.',{supportedTypes:COMPONENT_TYPES});
  if (![2,14].includes(type) && table !== undefined) fail('INVALID','logical_name is accepted only for Attribute and Entity Key components.');
  const record = records[type];
  let endpoint:string,key:string,fields:string,metadata = false;
  if (record) {({key,fields} = record);endpoint = '/' + record.set + '(' + id + ')?$select=' + fields;}
  else {
    metadata = true;key = 'MetadataId';
    if (type === 1) {fields = 'MetadataId,LogicalName,SchemaName,EntitySetName,IsManaged';endpoint = '/EntityDefinitions(' + id + ')?$select=' + fields;}
    else if (type === 9) {fields = 'MetadataId,Name,IsGlobal,OptionSetType,IsManaged';endpoint = '/GlobalOptionSetDefinitions(' + id + ')?$select=' + fields;}
    else if (type === 10) {fields = 'MetadataId,SchemaName,RelationshipType,IsManaged';endpoint = '/RelationshipDefinitions(' + id + ')?$select=' + fields;}
    else {
      const logical = name(table).toLowerCase(),parent = row((await reader.request("/EntityDefinitions(LogicalName='" + logical + "')?$select=MetadataId,LogicalName")).data);
      if (parent.LogicalName !== logical) fail('RESPONSE_INVALID','The parent table identity does not match.');objectId(parent.MetadataId);
      fields = type === 2 ? 'MetadataId,LogicalName,SchemaName,EntityLogicalName,AttributeType,IsManaged' : 'MetadataId,LogicalName,SchemaName,EntityLogicalName,IsManaged';
      endpoint = "/EntityDefinitions(LogicalName='" + logical + "')/" + (type === 2 ? 'Attributes' : 'Keys') + '(' + id + ')?$select=' + fields;
    }
  }
  const source = project((await reader.request(endpoint,'GET',undefined,metadata ? {Consistency:'Strong'} : {})).data,fields!);
  if (objectId(source[key!]) !== id) fail('RESPONSE_INVALID','The source object/metadata GUID does not match the requested component.');
  const display = metadata ? type === 9 ? source.Name : source.SchemaName : type === 90 ? source.typename : source.name;
  if (typeof display !== 'string' || !display.trim() || typeof source[metadata ? 'IsManaged' : 'ismanaged'] !== 'boolean') fail('RESPONSE_INVALID','The source component identity/state is incomplete.');
  if (type === 1 && (typeof source.LogicalName !== 'string' || typeof source.EntitySetName !== 'string')) fail('RESPONSE_INVALID','The table component definition is incomplete.');
  if (type === 10 && ![0,1,'OneToManyRelationship','ManyToManyRelationship'].includes(source.RelationshipType)) fail('COMPONENT_UNSUPPORTED','The relationship component is not a supported native relationship.');
  if ([2,14].includes(type) && source.EntityLogicalName !== name(table).toLowerCase()) fail('RESPONSE_INVALID','The component does not belong to the selected table.');
  if (type === 9 && source.IsGlobal !== true) fail('COMPONENT_UNSUPPORTED','Only global option set components can be added by type 9.');
  return {objectId:id,componentType:type,typeName:COMPONENT_TYPES[type],source};
}
