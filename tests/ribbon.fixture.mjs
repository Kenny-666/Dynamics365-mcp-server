import {archive,manifest,fixture as baseFixture,env,ids,reply} from './solutionTransfer.fixture.mjs';
import {RibbonService} from '../src/services/ribbon.ts';
export {env,ids,reply};
export const existingId='demo.table.Existing';
export const diff=`<RibbonDiffXml><CustomActions><CustomAction Id="demo.table.Existing.Action" Location="Mscrm.HomepageGrid.demo_table.MainTab.Actions.Controls._children" Sequence="100"><CommandUIDefinition><Button Id="${existingId}" Command="demo.table.Existing.Command" LabelText="$LocLabels:${existingId}.Label" Sequence="100" TemplateAlias="o1"/></CommandUIDefinition></CustomAction><HideCustomAction HideActionId="foreign.Preserved.Hide" Location="Mscrm.OldButton"/></CustomActions>
<Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates><CommandDefinitions><CommandDefinition Id="demo.table.Existing.Command"><EnableRules/><DisplayRules><DisplayRule Id="demo.table.OtherRule"/></DisplayRules><Actions><JavaScriptFunction Library="$webresource:demo_/buttons.js" FunctionName="Demo.existing"><StringParameter Value="SECRET_PARAMETER_LITERAL"/></JavaScriptFunction></Actions></CommandDefinition></CommandDefinitions>
<RuleDefinitions><TabDisplayRules/><DisplayRules><DisplayRule Id="demo.table.OtherRule"><CrmClientTypeRule Type="Web"/></DisplayRule></DisplayRules><EnableRules/></RuleDefinitions><LocLabels><LocLabel Id="${existingId}.Label"><Titles><Title languagecode="1033" description="Existing"/><Title languagecode="2052" description="原按钮"/></Titles></LocLabel></LocLabels></RibbonDiffXml>`;
export const customization=`<?xml version="1.0" encoding="utf-8"?><ImportExportXml><Entities><Entity><Name>demo_table</Name><EntityInfo><entity Name="demo_table"><attributes><attribute Name="demo_preserved"/></attributes></entity></EntityInfo>${diff}<FormXml><forms type="main"><systemform><formxml>&lt;form&gt;untouched&lt;/form&gt;</formxml></systemform></forms></FormXml></Entity><Entity><Name>demo_other</Name><RibbonDiffXml/><PreservedOther>other entity</PreservedOther></Entity></Entities>
<WebResources><WebResource><Name>demo_/buttons.js</Name><WebResourceType>3</WebResourceType><FileName>/WebResources/buttons.js</FileName></WebResource><WebResource><Name>demo_/icon.png</Name><WebResourceType>5</WebResourceType><FileName>/WebResources/icon.png</FileName></WebResource></WebResources><Preserved setting="unrelated">unchanged &amp; safe</Preserved></ImportExportXml>`;
export function solutionZip(options={}) {
  const entries=[{name:'solution.xml',content:options.manifest??manifest},{name:'customizations.xml',content:options.customization??customization},
    {name:'[Content_Types].xml',content:'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'},
    {name:'WebResources/buttons.js',content:"throw new Error('RIBBON_FIXTURE_MUST_NOT_EXECUTE');"},{name:'WebResources/icon.png',content:Buffer.from('inert image fixture')},
    {name:'Plugins/preserved.dll',content:Buffer.from('opaque-preserved-payload')}];
  return archive({entries:options.entries??entries.map(e=>({...e,method:options.method??8,flags:options.descriptor?0x808:0x800})),mutate:options.mutate});
}
export const add={operation:'add_button',button_id:'demo.table.New',command_id:'demo.table.New.Command',custom_action_id:'demo.table.New.Action',
  location:'Mscrm.Form.demo_table.MainTab.Actions.Controls._children',sequence:200,labels:[{language_code:1033,text:'New button'},{language_code:2052,text:'新按钮'}],
  library:'demo_/buttons.js',function_name:'Demo.run',parameters:[{type:'crm',value:'PrimaryControl'},{type:'string',value:'literal < & "'},{type:'bool',value:true},{type:'int',value:-2147483648}],image_16:'demo_/icon.png',image_32:'demo_/icon.png'};
export const nativeXml=`<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs><Tab Id="Mscrm.Form.demo_table.MainTab"><Groups><Group Id="Mscrm.Form.demo_table.MainTab.Actions"><Controls Id="Mscrm.Form.demo_table.MainTab.Actions.Controls"><Button Id="Mscrm.Form.demo_table.Save" Command="Mscrm.Save" LabelText="$Resources:Save"/></Controls></Group></Groups></Tab></Tabs></Ribbon></UI><CommandDefinitions><CommandDefinition Id="Mscrm.Save"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:demo_/buttons.js" FunctionName="Demo.run"><StringParameter Value="SECRET_PARAMETER_LITERAL"/></JavaScriptFunction></Actions></CommandDefinition></CommandDefinitions></RibbonDefinition></RibbonDefinitions>`;
export const csdl=`<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx" Version="4.0"><edmx:DataServices><Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="Microsoft.Dynamics.CRM" Alias="mscrm">
<EnumType Name="RibbonLocationFilters" IsFlags="true"><Member Name="Form" Value="1"/><Member Name="HomepageGrid" Value="2"/><Member Name="SubGrid" Value="4"/><Member Name="All" Value="7"/></EnumType>
<ComplexType Name="RetrieveEntityRibbonResponse"><Property Name="CompressedEntityXml" Type="Edm.Binary"/></ComplexType>
<Function Name="RetrieveEntityRibbon"><Parameter Name="EntityName" Type="Edm.String" Nullable="false"/><Parameter Name="RibbonLocationFilter" Type="mscrm.RibbonLocationFilters" Nullable="false"/><ReturnType Type="mscrm.RetrieveEntityRibbonResponse"/></Function>
<EntityContainer Name="DefaultContainer"><FunctionImport Name="RetrieveEntityRibbon" Function="mscrm.RetrieveEntityRibbon" IncludeInServiceDocument="true"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
export function fixture(options={}) {
  const zipped=options.ribbonZip??archive({entries:[{name:'RibbonXml.xml',content:options.xml??nativeXml},{name:'[Content_Types].xml',content:'<Types/>'}]}),f=baseFixture({request:async c=>{
    const custom=await options.request?.(c);if(custom!==undefined)return custom;
    if(c.path.startsWith('/EntityDefinitions('))return reply({MetadataId:ids.solution,LogicalName:'demo_table',...options.table});
    if(c.path==='/$metadata')return reply(options.metadata??csdl);
    if(c.path.startsWith('/RetrieveEntityRibbon('))return reply({CompressedEntityXml:zipped.toString('base64')});
  }});
  return {...f,service:new RibbonService(f.client,env)};
}
