import { createSolution } from './services/solutionCreate.js';
import { prepareCloudFlow } from './services/cloudFlowDefinition.js';
import { CloudFlowService } from './services/cloudFlow.js';
import { inspectFormPackage } from './services/formPackageInspect.js';
import { executeFormPackage } from './services/formPackageExecute.js';
import { readFormLibrary } from './services/formLibrary.js';
import { planFormPackage, inspectFormField, inspectFormLibrary } from './services/formPackagePlan.js';
import { compareFormDefinitions } from './services/formComparison.js';
import { UserUpdateService } from './services/userUpdate.js';
import { RolePrivilegeService } from './services/rolePrivilege.js';
import { RoleDefinitionService } from './services/roleDefinition.js';
import { consultantProject } from './services/consultantProject.js';
import { UserProvisionService } from './services/userProvision.js';
import { RoleAssignmentService } from './services/roleAssignment.js';
import { ChartService } from './services/chart.js';
import { chartTools } from './tools/chartTools.js';
import { WordTemplateService } from './services/wordTemplate.js';
import { wordTemplateTools } from './tools/wordTemplateTools.js';
import { AttachmentService } from './services/attachment.js';
import { attachmentTools } from './tools/attachmentTools.js';
import { CustomizationBackupService } from './services/customizationBackup.js';
import { planSiteMapPublication } from './services/siteMapPlan.js';
import { ToolAuditService } from './services/toolAudit.js';
import { JournalCatalogService } from './services/journalCatalog.js';
import { RecordJournalService } from './services/recordJournal.js';
import { SiteMapJournalService } from './services/siteMapJournal.js';
import { AppPublicationService } from './services/appPublication.js';
import { inspectSiteMapApplications } from './services/siteMapApplications.js';
import { editSiteMap } from './services/siteMapEditor.js';
import { ConfigInspectionService } from './services/configInspection.js';
import dotenv from 'dotenv';
import { D365AuthService } from './services/d365Auth.js';
import { CacheService } from './services/cache.js';
import { EntitySchemaService } from './services/entitySchema.js';
import { OptionSetService } from './services/optionSet.js';
import { RelationshipService } from './services/relationship.js';
import { FetchXmlService } from './services/fetchXml.js';
import { MetadataService } from './services/metadata.js';
import { RecordService } from './services/record.js';
import { EnvironmentService } from './services/environment.js';
import { WebResourceService } from './services/webResource.js';
import { webResourceTools } from './tools/webResourceTools.js';
import { PluginStepService } from './services/pluginStep.js';
import { pluginStepTools } from './tools/pluginStepTools.js';
import { PluginImageService } from './services/pluginImage.js';
import { pluginImageTools } from './tools/pluginImageTools.js';
import { PluginAssemblyService, inspectPluginAssembly } from './services/pluginAssembly.js';
import { pluginAssemblyTools } from './tools/pluginAssemblyTools.js';
import { RecordMutationService } from './services/recordMutation.js';
import { RecordBatchService, type MutationContext } from './services/recordBatch.js';
import { recordMutationTools } from './tools/recordMutationTools.js';
import { argumentsObject, guid } from './services/recordMutationInput.js';
import { DiagnosticService } from './services/diagnostics.js';
import { SecurityEvidenceService } from './services/securityEvidence.js';
import { AuditEvidenceService } from './services/auditEvidence.js';
import { evidenceTools } from './tools/evidenceTools.js';
import { ModelMetadataService, hash } from './services/modelMetadata.js';
import { modelMetadataTools } from './tools/modelMetadataTools.js';
import { ModelStructureService } from './services/modelStructure.js';
import { modelStructureTools } from './tools/modelStructureTools.js';
import { ModelMaintenanceService } from './services/modelMaintenance.js';
import { modelMaintenanceTools } from './tools/modelMaintenanceTools.js';
import { ApiOperationService } from './services/apiOperation.js';
import { apiOperationTools } from './tools/apiOperationTools.js';
import { SolutionService } from './services/solution.js';
import { solutionTools } from './tools/solutionTools.js';
import { SolutionTransferService } from './services/solutionTransfer.js';
import { inspectSolutionPackage } from './services/solutionPackage.js';
import { solutionTransferTools } from './tools/solutionTransferTools.js';
import { SolutionSnapshotService, compareSolutionSnapshots } from './services/solutionSnapshot.js';
import { SolutionImportLogService } from './services/solutionImportLog.js';
import { SolutionVerificationService } from './services/solutionVerification.js';
import { solutionVerificationTools } from './tools/solutionVerificationTools.js';
import { RibbonService, inspectRibbonSolution, editRibbonSolution } from './services/ribbon.js';
import { ribbonTools } from './tools/ribbonTools.js';
import { RibbonDeploymentService } from './services/ribbonDeployment.js';
import { ribbonDeploymentTools } from './tools/ribbonDeploymentTools.js';
import { ModelChoiceService } from './services/modelChoices.js';
import { modelChoiceTools } from './tools/modelChoiceTools.js';
import { ModelUiService } from './services/modelUi.js';
import { modelUiTools } from './tools/modelUiTools.js';
import { SiteMapPublicationService } from './services/siteMapPublication.js';
import { siteMapTools } from './tools/siteMapTools.js';
import { readConfig, validateConfig } from './config.js';
import type { QueryOptions } from './types/query.js';
import { clearQueryContinuations } from './services/queryPaging.js';

// stdout is reserved for MCP JSON-RPC, including when dotenv debug is enabled outside.
dotenv.config({ quiet: true, debug: false });

export function checkConfig() {
  validateConfig(readConfig());
}

function createServices(profile?:string) {
  const config = readConfig(profile === undefined ? process.env : {...process.env,D365_PROFILE:profile});
  validateConfig(config);
  const cache = CacheService.createIsolated(config.cacheTtl);
  const auth = new D365AuthService(config,{cache});
  const recordMutationService = new RecordMutationService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
    authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'});
  const pluginStepService = new PluginStepService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
    authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'});
  const diagnosticService = new DiagnosticService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
    authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'},pluginStepService);
  const apiOperationService=new ApiOperationService(auth,{orgUrl:config.orgUrl || config.environmentUrl,authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'});
  const modelUiService=new ModelUiService(auth,{orgUrl:config.orgUrl || config.environmentUrl,authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'});
  const webResourceService=new WebResourceService(auth,{orgUrl:config.orgUrl || config.environmentUrl,authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'});
  return {
    auth,
    createSolution:(args:Record<string,any>,signal?:AbortSignal)=>createSolution(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || "v9.2",authType:config.authType || "online"},args,signal),
    cloudFlowService:new CloudFlowService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || "v9.2",authType:config.authType || "online"}),
    userUpdateService:new UserUpdateService(auth,recordMutationService,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    rolePrivilegeService:new RolePrivilegeService(auth,apiOperationService,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    roleDefinitionService:new RoleDefinitionService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    userProvisionService:new UserProvisionService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2',authType:config.authType || 'online'}),
    roleAssignmentService:new RoleAssignmentService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    chartService:new ChartService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    wordTemplateService:new WordTemplateService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    attachmentService:new AttachmentService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    customizationBackupService:new CustomizationBackupService(auth,modelUiService,webResourceService,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    toolAuditService:new ToolAuditService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    journalCatalogService:new JournalCatalogService(auth,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    recordJournalService:new RecordJournalService(auth,recordMutationService,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    siteMapJournalService:new SiteMapJournalService(auth,recordMutationService,{orgUrl:config.orgUrl || config.environmentUrl,apiVersion:config.apiVersion || 'v9.2'}),
    appPublicationService:new AppPublicationService(auth,{orgUrl:config.orgUrl || config.environmentUrl,authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    siteMapPublicationService:new SiteMapPublicationService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    ribbonDeploymentService:new RibbonDeploymentService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    ribbonService:new RibbonService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    solutionSnapshotService:new SolutionSnapshotService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    solutionImportLogService:new SolutionImportLogService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'},[config.clientSecret,config.ad?.password,config.ifd?.password,config.ifd?.clientSecret].filter((v):v is string => typeof v === 'string' && !!v)),
    solutionVerificationService:new SolutionVerificationService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    solutionTransferService:new SolutionTransferService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    solutionService:new SolutionService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    apiOperationService,
    entitySchemaService: new EntitySchemaService(auth, cache),
    configInspectionService: new ConfigInspectionService(auth),
    optionSetService: new OptionSetService(auth, cache),
    relationshipService: new RelationshipService(auth, cache),
    fetchXmlService: new FetchXmlService(auth),
    metadataService: new MetadataService(auth, cache),
    recordService: new RecordService(auth,recordMutationService),
    recordMutationService,
    recordBatchService: new RecordBatchService(recordMutationService),
    diagnosticService,
    modelMetadataService:new ModelMetadataService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    modelStructureService:new ModelStructureService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    modelMaintenanceService:new ModelMaintenanceService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    modelChoiceService:new ModelChoiceService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    modelUiService,
    securityEvidenceService:new SecurityEvidenceService(auth),
    auditEvidenceService:new AuditEvidenceService(auth,diagnosticService),
    environmentService: new EnvironmentService(auth, config),
    webResourceService,
    pluginStepService,
    pluginAssemblyService:new PluginAssemblyService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    pluginImageService:new PluginImageService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
  };
}

const servicePool = new Map<string, ReturnType<typeof createServices>>();

const stateProperties = {
  state_mode:{type:'string', enum:['legacy','all','values'], description:'legacy preserves valid implicit statecode=0 filtering; all adds no state filter; values uses state_values validated against this table.'},
  state_values:{type:'array', items:{type:'integer'}, minItems:1, maxItems:100, description:'Explicit numeric state values; requires state_mode=values.'},
  formatted_values:{type:'boolean', description:'Include formatted labels and display values returned by CRM.'},
};
const pagingProperties = {
  page_size:{type:'integer', minimum:1, maximum:5000, description:'Requested server page size, default 500. Cannot be combined with top. FetchXML count is preserved unless the same value is supplied.'},
  max_records:{type:'integer', minimum:1, maximum:50000, description:'Maximum records returned in this call, default 5000. Remaining records can be resumed with continuation.'},
  max_pages:{type:'integer', minimum:1, maximum:100, description:'Maximum server pages read per call, default 10, when fetch_all=true.'},
  fetch_all:{type:'boolean', description:'Follow server paging up to max_records/max_pages. Default false returns one page.'},
  continuation:{type:'string', description:'Opaque cursor from a previous result; valid for five minutes in this server connection. Resumes saved query and buffered records.'},
};
function queryInput(args: any): QueryOptions {
  return {state_mode:args.state_mode, state_values:args.state_values, formatted_values:args.formatted_values,
    page_size:args.page_size, max_records:args.max_records, max_pages:args.max_pages,
    fetch_all:args.fetch_all, continuation:args.continuation};
}

// Individual tool modules define their schemas independently; contract tests compile every schema.
type RegisteredTool = {name:string; description?:string; inputSchema:any; annotations?:{readOnlyHint?:boolean;destructiveHint?:boolean;idempotentHint?:boolean;openWorldHint?:boolean}};
const cloudListQueryProperties={select:{type:'array',minItems:1,maxItems:50,items:{type:'string'}},order_by:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,required:['field','direction'],properties:{field:{type:'string'},direction:{enum:['asc','desc']}}}},filter:{type:'object',additionalProperties:false,required:['conditions'],properties:{conditions:{type:'array',minItems:1,maxItems:10,items:{type:'object',additionalProperties:false,required:['field','operator','value'],properties:{field:{type:'string'},operator:{enum:['eq','ne','gt','ge','lt','le']},value:{type:['string','number','boolean']}}}}}}};
const cloudBranchActionSchema={type:'object',additionalProperties:false,required:['name','kind'],properties:{name:{type:'string'},kind:{enum:['compose','dataverse_list','dataverse_get','dataverse_create','dataverse_update']},entity_set:{type:'string'},record_id:{type:'string'},record_id_from_trigger:{type:'string'},record_id_from_output:{type:'object',additionalProperties:false,required:['action','name'],properties:{action:{type:'string'},name:{type:'string'}}},fields:{type:'object',additionalProperties:{anyOf:[{type:['string','number','boolean']},{type:'object',additionalProperties:false,required:['source','name'],properties:{source:{enum:['trigger','variable','action']},name:{type:'string'},action:{type:'string'}}}]}},top:{type:'integer',minimum:1,maximum:5000},...cloudListQueryProperties,value:{type:['string','number','boolean']}}};
const cloudLoopActionSchema={...cloudBranchActionSchema,properties:{...cloudBranchActionSchema.properties,record_id_from_item:{type:'string'},fields:{type:'object',additionalProperties:{anyOf:[{type:['string','number','boolean']},{type:'object',additionalProperties:false,required:['source','name'],properties:{source:{enum:['trigger','variable','action','item']},name:{type:'string'},action:{type:'string'}}}]}}}};
export const tools:RegisteredTool[] = [
  {name:'update_crm_user_profile',description:'Preview then update selected CRM user profile fields or enabled status with metadata-confirmed ETag and readback. Changing isdisabled requires explicit acknowledgement; roles, business unit, domain and passwords are excluded.',inputSchema:{type:'object',additionalProperties:false,required:['user_id','changes'],properties:{user_id:{type:'string'},changes:{type:'object',additionalProperties:false,minProperties:1,properties:{firstname:{type:['string','null']},lastname:{type:'string'},internalemailaddress:{type:['string','null']},title:{type:['string','null']},telephone1:{type:['string','null']},mobilephone:{type:['string','null']},isdisabled:{type:'boolean'}}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},allow_access_change:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'change_role_privilege',description:'Preview then add or remove one native role privilege with an explicitly supported depth. Uses current CSDL, rereads the role privilege, requires both acknowledgements and does not infer effective access. Existing different depths must be removed separately.',inputSchema:{type:'object',additionalProperties:false,required:['role_id','privilege_id','action'],properties:{role_id:{type:'string'},privilege_id:{type:'string'},action:{enum:['add','remove']},depth:{enum:['Basic','Local','Deep','Global']},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},allow_unprotected_write:{type:'boolean'},allow_role_privilege_change:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'manage_security_role',description:'Preview then create, rename/update, or delete a customizable unmanaged security role in an explicit unmanaged solution. Update/delete require native optimistic concurrency and specific ETag; no privilege changes are performed.',inputSchema:{type:'object',additionalProperties:false,required:['action','solution_unique_name'],properties:{action:{enum:['create','update','delete']},id:{type:'string'},business_unit_id:{type:'string'},name:{type:'string'},description:{type:'string'},solution_unique_name:{type:'string'},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},allow_role_change:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'manage_consultant_project',description:'Optional local consultant workspace: create projects, import material, generate editable DOCX and UAT XLSX or offline HTML prototypes, list assets, compare document versions and restore a generated version. Requires existing D365_CONSULTANT_DIR. No CRM connection or external upload.',inputSchema:{type:'object',additionalProperties:false,required:['action','project_id'],properties:{action:{enum:['create_project','list_assets','import_material','generate_document','generate_uat','generate_prototype','compare_document_versions','restore_asset']},project_id:{type:'string'},name:{type:'string'},title:{type:'string'},file_path:{type:'string'},spec:{type:'object'},asset_id:{type:'string'},from_asset_id:{type:'string'},to_asset_id:{type:'string'}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'list_role_privileges',description:'Read bounded direct native privilege IDs and depth masks for a security role. Does not infer effective user or record access.',inputSchema:{type:'object',additionalProperties:false,required:['role_id'],properties:{role_id:{type:'string'},top:{type:'integer',minimum:1,maximum:100},max_pages:{type:'integer',minimum:1,maximum:20}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}},
  {name:'create_onprem_domain_user',description:'Preview then create a CRM on-premises AD/IFD domain user in a verified active business unit. No passwords or roles are set. Requires preview hash and explicit creation acknowledgement; unknown writes are never retried.',inputSchema:{type:'object',additionalProperties:false,required:['domain_name','business_unit_id','last_name'],properties:{domain_name:{type:'string'},business_unit_id:{type:'string'},last_name:{type:'string'},first_name:{type:'string'},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},allow_user_creation:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'manage_user_roles',description:'Preview then assign or remove up to 20 direct user security roles. Resolves native relationship and business units, requires unprotected-write acknowledgement, and verifies each membership after dispatch. No automatic retries; effective privileges are not inferred.',inputSchema:{type:'object',additionalProperties:false,required:['user_id','role_ids','action'],properties:{user_id:{type:'string'},role_ids:{type:'array',minItems:1,maxItems:20,uniqueItems:true,items:{type:'string'}},action:{enum:['assign','remove']},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},allow_unprotected_write:{type:'boolean'},allow_cross_business_unit:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  ...chartTools,
  ...wordTemplateTools,
  ...attachmentTools,
  {name:'backup_customization',description:'Preview and persist a saved/unpublished Web Resource, main form or public view backup. Requires D365_JOURNAL_DIR. Does not publish.',inputSchema:{type:'object',additionalProperties:false,required:['kind','id'],properties:{kind:{enum:['webresource','form','view']},id:{type:'string'},logical_name:{type:'string'},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'restore_customization_backup',description:'Preview and restore an eligible saved customization backup with native ETag checks and readback; never publishes.',inputSchema:{type:'object',additionalProperties:false,required:['journal_id'],properties:{journal_id:{type:'string'},solution_unique_name:{type:'string'},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'list_change_journal',description:'List recognized persistent journal entries for the active CRM identity and environment without returning original values.',inputSchema:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0,maximum:2000}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}},
  {name:'get_change_journal',description:'Get a safe summary of one journal entry for the active identity and environment; does not return original values.',inputSchema:{type:'object',additionalProperties:false,required:['journal_id'],properties:{journal_id:{type:'string'}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}},
  {name:'update_record_with_journal',description:'Preview and conditionally update simple record fields with a persistent before-image. Requires D365_JOURNAL_DIR and native optimistic concurrency.',inputSchema:{type:'object',additionalProperties:false,required:['collection_name','id','data'],properties:{collection_name:{type:'string'},id:{type:'string'},data:{type:'object',minProperties:1,maxProperties:20,additionalProperties:{type:['string','number','boolean','null']}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'rollback_record_journal',description:'Preview or conditionally restore a verified record-update journal entry; rejects changed records.',inputSchema:{type:'object',additionalProperties:false,required:['journal_id'],properties:{journal_id:{type:'string'},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'resolve_model_name', description:'Resolve an exact logical, schema, collection or localized display name. Ambiguous names return candidates.',
    inputSchema:{type:'object',additionalProperties:false,required:['name'],properties:{name:{type:'string'},entity_logical_name:{type:'string',description:'When present resolve a column in this table; otherwise resolve a table.'}}}},
  {name:'check_model_configuration', description:'Read-only checks for main forms, required fields and public view XML. Results depend on CRM permissions and cannot evaluate all runtime rules.',
    inputSchema:{type:'object',additionalProperties:false,required:['entity_logical_name'],properties:{entity_logical_name:{type:'string'}}}},
  ...siteMapTools,
  ...solutionTools,
  ...solutionTransferTools,
  ...solutionVerificationTools,
  ...ribbonTools,
  ...ribbonDeploymentTools,
  ...apiOperationTools,
  ...modelMaintenanceTools,
  ...pluginAssemblyTools,
  ...pluginImageTools,
  ...modelUiTools,
  {name:'apply_form_solution_package',description:'Recompute a form package plan, preview a selection, then add selected form and candidate components sequentially with fresh preflights. Requires expected_hash and explicit unprotected-write acceptance. Partial results are reported.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','logical_name','source_form_id','target_form_id','solution_unique_name','components'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},logical_name:{type:'string'},source_form_id:{type:'string'},target_form_id:{type:'string'},solution_unique_name:{type:'string'},components:{type:'array',minItems:1,maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',enum:[2,9,60,61]},component_id:{type:'string'}}}},dry_run:{type:'boolean'},expected_hash:{type:'string'},allow_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'create_unmanaged_solution',description:'Preview and create a dedicated unmanaged solution using an existing publisher, then read back its identity. Unknown outcomes are never retried.',inputSchema:{type:'object',additionalProperties:false,required:['unique_name','friendly_name','publisher_id'],properties:{unique_name:{type:'string'},friendly_name:{type:'string'},publisher_id:{type:'string'},version:{type:'string'},dry_run:{type:'boolean'},expected_hash:{type:'string'}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'inspect_form_solution_package',description:'Inspect bounded local ZIP root declarations, selected form XML and Web resource payload hashes. Undeclared items may be nested; dependency completeness is not verified.',inputSchema:{type:'object',additionalProperties:false,required:['components'],properties:{file_path:{type:'string'},content_base64:{type:'string'},components:{type:'array',minItems:1,maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',enum:[2,9,60,61]},component_id:{type:'string'},schema_name:{type:'string'},logical_name:{type:'string'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}}},annotations:{readOnlyHint:true}},
  {name:'set_cloud_flow_state',description:'Preview then enable or disable an Online cloud flow using specific native ETag and independent state readback. Does not establish connection, license or runtime readiness.',inputSchema:{type:'object',additionalProperties:false,required:['id','enabled'],properties:{id:{type:'string'},enabled:{type:'boolean'},dry_run:{type:'boolean'},expected_hash:{type:'string'}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'list_cloud_flow_connections',description:'List visible connection reference metadata without exposing connection IDs. Connection validity, permissions and licensing are not established.',inputSchema:{type:'object',additionalProperties:false,properties:{top:{type:'integer',minimum:1,maximum:100}}},annotations:{readOnlyHint:true}},
  {name:'update_cloud_flow',description:'Preview and replace a stopped Online cloud flow with a supported spec using a specific ETag, then verify its saved definition. Does not enable the flow.',inputSchema:{type:'object',additionalProperties:false,required:['id','spec'],properties:{id:{type:'string'},spec:{type:'object'},dry_run:{type:'boolean'},expected_hash:{type:'string'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'create_cloud_flow',description:'Preview and create a stopped cloud flow in an existing unmanaged solution using a validated local flow spec. Requires preview hash; readback and solution membership are reported separately.',inputSchema:{type:'object',additionalProperties:false,required:['solution_unique_name','spec'],properties:{solution_unique_name:{type:'string'},spec:{type:'object'},dry_run:{type:'boolean'},expected_hash:{type:'string'}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'prepare_cloud_flow',description:'Construct a local manual, scheduled or Dataverse event cloud-flow draft with bounded literals, variables, condition and foreach. Does not contact Power Platform or validate deployment.',inputSchema:{type:'object',additionalProperties:false,required:['name','trigger','actions'],properties:{name:{type:'string',maxLength:120},dataverse_connection:{type:'string'},trigger:{type:'object',additionalProperties:false,required:['kind'],properties:{kind:{enum:['manual','recurrence','dataverse_event']},entity_name:{type:'string'},message:{type:'integer',enum:[1,2,3,4]},scope:{type:'integer',enum:[1,2,3,4]},filtering_attributes:{type:'array',minItems:1,maxItems:50,items:{type:'string'}},frequency:{enum:['Minute','Hour','Day','Week','Month']},interval:{type:'integer',minimum:1,maximum:500}}},actions:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['name','kind'],properties:{name:{type:'string'},kind:{enum:['compose','initialize_variable','condition','for_each','dataverse_list','dataverse_get','dataverse_create','dataverse_update']},entity_set:{type:'string'},record_id:{type:'string'},record_id_from_trigger:{type:'string'},record_id_from_output:{type:'object',additionalProperties:false,required:['action','name'],properties:{action:{type:'string'},name:{type:'string'}}},fields:{type:'object',additionalProperties:{anyOf:[{type:['string','number','boolean']},{type:'object',additionalProperties:false,required:['source','name'],properties:{source:{enum:['trigger','variable','action']},name:{type:'string'},action:{type:'string'}}}]}},top:{type:'integer',minimum:1,maximum:5000},...cloudListQueryProperties,value:{anyOf:[{type:['string','number','boolean']},{type:'array',maxItems:100,items:{type:['string','number','boolean']}}]},variable_name:{type:'string'},items_from_action:{type:'string'},loop_actions:{type:'array',minItems:1,maxItems:5,items:cloudLoopActionSchema},condition_source:{type:'object',additionalProperties:false,required:['source','name'],properties:{source:{enum:['trigger','variable','action']},name:{type:'string'},action:{type:'string'}}},then_value:{type:['string','number','boolean']},else_value:{type:['string','number','boolean']},then_actions:{type:'array',minItems:1,maxItems:5,items:cloudBranchActionSchema},else_actions:{type:'array',minItems:1,maxItems:5,items:cloudBranchActionSchema},after:{type:'array',maxItems:10,items:{type:'string'}}}}}}},annotations:{readOnlyHint:true}},
  {name:'list_cloud_flow_runs',description:'Read bounded Dataverse run metadata for a cloud flow. Results may be delayed, unavailable or incomplete and do not establish full runtime history.',inputSchema:{type:'object',additionalProperties:false,required:['id'],properties:{id:{type:'string'},top:{type:'integer',minimum:1,maximum:100}}},annotations:{readOnlyHint:true}},
  {name:'list_cloud_flows',description:'Read a bounded list of visible cloud flow records in an Online Dataverse environment; no runtime or connection status asserted.',inputSchema:{type:'object',additionalProperties:false,properties:{top:{type:'integer',minimum:1,maximum:100}}},annotations:{readOnlyHint:true}},
  {name:'get_cloud_flow',description:'Read a cloud flow summary including trigger, action and connection-reference names and a definition hash; no secrets or full definition returned.',inputSchema:{type:'object',additionalProperties:false,required:['id'],properties:{id:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'plan_form_solution_package',description:'Read source and target main forms and preview adding the entire source form to an existing unmanaged solution. References are not automatically added or fully analyzed.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','logical_name','source_form_id','target_form_id','solution_unique_name'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},logical_name:{type:'string'},source_form_id:{type:'string'},target_form_id:{type:'string'},solution_unique_name:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'compare_environment_forms',description:'Read saved main forms from two explicitly named environment profiles and compare positional XML. No writes or publication verification.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','logical_name','source_form_id','target_form_id'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},logical_name:{type:'string'},source_form_id:{type:'string'},target_form_id:{type:'string'}}},annotations:{readOnlyHint:true}},
  ...modelChoiceTools,
  ...modelStructureTools,
  ...modelMetadataTools,
  ...evidenceTools,
  ...recordMutationTools,
  ...webResourceTools,
  ...pluginStepTools,
  {
    name:'get_environment_capabilities',
    description:'Read WhoAmI, RetrieveVersion and table definitions to inspect the configured CRM environment. Reports metadata evidence separately from untested permissions and SDK support; does not change the connection or select another API version.',
    inputSchema:{type:'object', properties:{}},
    annotations:{readOnlyHint:true},
  },
  {
    name: 'get_entity_metadata_summary',
    description: 'Get a summary of entity metadata including primary key, name field, and business-relevant attributes. System-redundant fields are excluded.',
    inputSchema: {
      type: 'object',
      properties: {
        logical_name: {
          type: 'string',
          description: 'Logical name of the entity (e.g., account, contact)',
        },
      },
      required: ['logical_name'],
    },
  },
  {
    name: 'get_field_picklist_options',
    description: 'Get OptionSet (enum) definitions for a specific field within an entity. Supports both local and global OptionSets.',
    inputSchema: {
      type: 'object',
      properties: {
        logical_name: {
          type: 'string',
          description: 'Logical name of the entity',
        },
        attribute_name: {
          type: 'string',
          description: 'Logical name of the attribute (field)',
        },
      },
      required: ['logical_name', 'attribute_name'],
    },
  },
  {
    name: 'get_entity_navigation_links',
    description: 'Get navigation properties (relationships) for an entity, including 1:N, N:1, and N:N relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_name: {
          type: 'string',
          description: 'Logical name of the entity',
        },
        related_entity_name: {
          type: 'string',
          description: 'Optional: Filter by a specific related entity',
        },
      },
      required: ['entity_name'],
    },
  },
  {
    name: 'preview_fetchxml_query',
    description: 'Preview the first result using the same FetchXML state/filter logic as query_by_fetchxml. Returns effective query and paging information without claiming the sample is a full result set.',
    inputSchema: {
      type: 'object',
      properties: {
        ...stateProperties,
        fetch_xml: {
          type: 'string',
          description: 'The FetchXML string to preview',
        },
      },
      required: ['fetch_xml'],
    },
  },
  {
    name: 'query_by_fetchxml',
    description: 'Execute FetchXML with explicit state policy and bounded native cookie/simple paging. Defaults to one page. Returns value, effective query, completeness and continuation; use fetch_all for multiple pages.',
    inputSchema: {
      type: 'object',
      properties: {
        ...stateProperties,
        ...pagingProperties,
        fetch_xml: {
          type: 'string',
          description: 'The FetchXML string to execute',
        },
      },
      anyOf:[{required:['fetch_xml']}, {required:['continuation']}],
    },
  },
  {
    name: 'clear_server_cache',
    description: 'Clear local cached metadata and authentication tokens and invalidate query continuations. Does not change CRM data.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_current_user_context',
    description: 'Get information about the currently connected user and organization context.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_all_entity_definitions',
    description: 'List basic definitions (logical name, display name, etc.) for all entities in the system.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'search_records_by_odata',
    description: 'Query records using OData with explicit state policy, stable ordering and bounded server-driven paging. Defaults to one page and legacy statecode=0 where valid; all adds no implicit state filter. Returns completeness and continuation.',
    inputSchema: {
      type: 'object',
      properties: {
        ...stateProperties,
        ...pagingProperties,
        collection_name: { type: 'string', description: 'EntitySetName (Web API collection name), e.g. accounts; use table metadata rather than guessing a plural name.' },
        select: { type: 'string', description: 'Comma-separated list of attributes to retrieve' },
        filter: { type: 'string', description: 'OData filter expression' },
        top: { type: 'integer', minimum:1, maximum:5000, description: 'Native query limit, independent of per-call max_records. Cannot be combined with page_size.' },
        orderby:{type:'string', description:'Comma-separated property paths with optional asc/desc. Primary key is appended as a tie-breaker where available.'},
        expand:{type:'string', description:'OData navigation expansion. Nested child collections are not independently auto-paged.'},
      },
      required: ['collection_name'],
    },
  },
  {
    name: 'get_record_by_id',
    description: 'Retrieve detailed information for a single record by its GUID.',
    inputSchema: {
      type: 'object',
      properties: {
        collection_name: { type: 'string', description: 'Logical collection name' },
        collectionName: {type:'string', 'x-alias-for':'collection_name', description:'Compatibility alias for collection_name; conflicting values are rejected.'},
        id: { type: 'string', description: 'The GUID of the record' },
        select: { type: 'string', description: 'Comma-separated list of attributes to retrieve' },
      },
      required: ['id'],
      anyOf:[{required:['collection_name']},{required:['collectionName']}],
    },
  },
  {
    name: 'get_detailed_field_metadata',
    description: 'Get full metadata details for a specific attribute (field) for deep analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_logical_name: { type: 'string', description: 'Logical name of the entity' },
        attribute_logical_name: { type: 'string', description: 'Logical name of the attribute' },
      },
      required: ['entity_logical_name', 'attribute_logical_name'],
    },
  },
];

/** Select exposed tools without changing the default full inventory. */
export function selectTools(setting = process.env.D365_TOOLSETS ?? 'all') {
  const groups: Record<string, string[]> = {
    query: ['list_role_privileges','resolve_model_name','get_environment_capabilities','get_entity_metadata_summary','get_field_picklist_options',
      'get_entity_navigation_links','preview_fetchxml_query','query_by_fetchxml','get_current_user_context',
      'list_all_entity_definitions','search_records_by_odata','get_record_by_id','get_detailed_field_metadata',
      ...evidenceTools.map(t => t.name)],
    data: ['update_crm_user_profile','change_role_privilege','manage_security_role','create_onprem_domain_user','manage_user_roles',...attachmentTools.map(t => t.name),...recordMutationTools.map(t => t.name),'update_record_with_journal','rollback_record_journal'],
    config: ['list_cloud_flow_runs','create_unmanaged_solution','update_cloud_flow','list_cloud_flow_connections','set_cloud_flow_state','create_cloud_flow','prepare_cloud_flow','list_cloud_flows','get_cloud_flow','inspect_form_solution_package','apply_form_solution_package','plan_form_solution_package','compare_environment_forms',...chartTools.map(t => t.name),'backup_customization','restore_customization_backup','check_model_configuration', ...[...modelMaintenanceTools,...modelUiTools,...modelChoiceTools,...modelStructureTools,
      ...modelMetadataTools,...siteMapTools].map(t => t.name)],
    deploy: [...wordTemplateTools,...solutionTools,...solutionTransferTools,...solutionVerificationTools,...ribbonTools,
      ...ribbonDeploymentTools,...pluginAssemblyTools,...pluginImageTools,...webResourceTools,
      ...pluginStepTools,...apiOperationTools].map(t => t.name),
    consultant: ['manage_consultant_project'],
    diagnostics: ['list_change_journal','get_change_journal','clear_server_cache', ...evidenceTools.map(t => t.name)],
  };
  const requested = setting.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!requested.length || requested.includes('all')) {
    if (requested.some(x => x !== 'all')) throw new Error('D365_TOOLSETS: all cannot be combined with groups');
    return tools.filter(tool => tool.name !== 'manage_consultant_project');
  }
  const invalid = requested.filter(x => !Object.hasOwn(groups, x));
  if (invalid.length) throw new Error(`D365_TOOLSETS: unknown groups: ${invalid.join(', ')}`);
  const names = new Set(requested.flatMap(x => groups[x]));
  return tools.filter(t => names.has(t.name));
}

export async function handleToolCall(name: string, args: any = {}, context:MutationContext & {environmentProfile?:string} = {}) {
  if (!tools.some(tool => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
  if (name === 'compare_environment_forms' || name === 'plan_form_solution_package' || name === 'apply_form_solution_package') {
    const allowed=['source_profile','target_profile','logical_name','source_form_id','target_form_id',...(name!=='compare_environment_forms'?['solution_unique_name']:[])];
    if (!args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).some(k=>!allowed.includes(k) && !(name==='apply_form_solution_package' && ['components','dry_run','expected_hash','allow_unprotected_write'].includes(k))) || allowed.some(k=>typeof args[k]!=='string' || !args[k].trim())) throw new Error('Explicit source and target profiles, table and form IDs are required.');
    if (args.source_profile.toUpperCase()===args.target_profile.toUpperCase()) throw new Error('Source and target profiles must be distinct.');
    const readForm=async (profile:string,id:string) => {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(profile)) throw new Error('Invalid environment profile');
      const key=profile.toUpperCase();let service=servicePool.get(key);
      if (!service) {if(servicePool.size>=16) throw new Error('At most 16 environment profiles may be active per process');service=createServices(profile);servicePool.set(key,service);}
      return service.modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id},context.signal);
    };
    const [source,target]=await Promise.all([readForm(args.source_profile,args.source_form_id),readForm(args.target_profile,args.target_form_id)]);
    const readOrganization=async(profile:string)=>{const service=servicePool.get(profile.toUpperCase());if(!service)throw new Error('Environment was not initialized');try{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});return r.status===200?guid(r.data?.OrganizationId):null;}catch(error){if(context.signal?.aborted)throw error;return null;}};
    const [sourceOrg,targetOrg]=await Promise.all([readOrganization(args.source_profile),readOrganization(args.target_profile)]);
    source.environment={...source.environment,organizationId:sourceOrg};target.environment={...target.environment,organizationId:targetOrg};
    if (name!=='compare_environment_forms') {
      const service=servicePool.get(args.source_profile.toUpperCase());
      if (!service) throw new Error('Source environment was not initialized');
      const destination=servicePool.get(args.target_profile.toUpperCase());
      if (!destination) throw new Error('Target environment was not initialized');
      const readField=(side:'source'|'target',logicalName:string,field:string)=>(side==='source'?service:destination).modelMetadataService.get({logical_name:logicalName,attribute_name:field},context.signal);
      const readLibrary=(side:'source'|'target',libraryName:string)=>readFormLibrary((side==='source'?service:destination).auth,libraryName,context.signal);
      const plan=await planFormPackage(source,target,args.solution_unique_name,a=>service.solutionService.add(a,context.signal),readField,context.signal,readLibrary);
      if(name==='plan_form_solution_package') return plan;
      if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean'||args.allow_unprotected_write!==undefined&&typeof args.allow_unprotected_write!=='boolean')throw new Error('Invalid execution flags');
      const execute=args.dry_run===false;
      if(execute&&args.allow_unprotected_write!==true)throw new Error('Explicit unprotected write acceptance is required.');
      const recheck=async()=>{const [s,t]=await Promise.all([readForm(args.source_profile,args.source_form_id),readForm(args.target_profile,args.target_form_id)]);const result=compareFormDefinitions(s,t);return {sourceXmlHash:result.sourceXmlHash,targetXmlHash:result.targetXmlHash};};
      const recheckComponent=async(item:Record<string,any>)=>{const names=item.component_type===9?item.related_fields:[item.name];if(!Array.isArray(names)||!names.length)throw new Error('Reviewed component evidence is unavailable.');for(const componentName of names){const field=item.component_type===2||item.component_type===9,checks=field?plan.fieldChecks:plan.libraryChecks,expected=checks.filter(x=>x.name===componentName);if(expected.length!==1)throw new Error('Reviewed component evidence is unavailable.');const current=field?await inspectFormField(componentName,source.logicalName,readField,context.signal):await inspectFormLibrary(componentName,readLibrary,context.signal);if(hash(current)!==hash(expected[0]))throw new Error('Component evidence changed after review.');}};
      const run=()=>executeFormPackage(plan,args.components,args.expected_hash,execute,a=>service.solutionService.add(a,context.signal),context.signal,recheck,recheckComponent);
      return execute&&process.env.D365_AUDIT_WRITES==='true'?service.toolAuditService.run(name,run,context.signal):run();
    }
    return compareFormDefinitions(source,target);
  }
  if (name === 'prepare_cloud_flow') return prepareCloudFlow(args);
  if (name === 'inspect_form_solution_package') return inspectFormPackage(args,context.signal);
  if (name === 'manage_consultant_project') return consultantProject(args);
  if (name === 'edit_sitemap_xml') return editSiteMap(args);
  if (name === 'd365_plugin_assembly_inspect') return inspectPluginAssembly(args,context.signal);
  if (name === 'inspect_solution_package') return inspectSolutionPackage(args,context.signal);
  if (name === 'compare_solution_snapshots') return compareSolutionSnapshots(args,context.signal);
  if (name === 'inspect_ribbon_solution') return inspectRibbonSolution(args,context.signal);
  if (name === 'edit_ribbon_solution') return editRibbonSolution(args,context.signal);
  if (name === 'clear_server_cache') {
    CacheService.flushExisting();
    for (const service of servicePool.values()) clearQueryContinuations(service.auth);
    return { success: true, message: 'Server cache cleared' };
  }
  const profile = context.environmentProfile;
  if (profile !== undefined && !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(profile)) throw new Error('Invalid environment_profile');
  const poolKey = profile?.toUpperCase() ?? (process.env.D365_PROFILE?.trim().toUpperCase() || '');
  let services = servicePool.get(poolKey);
  if (!services) {
    if (servicePool.size >= 16) throw new Error('At most 16 environment profiles may be active per process');
    services = createServices(profile);
    servicePool.set(poolKey,services);
  }
  const selected = tools.find(tool => tool.name === name);
  const annotations = selected && 'annotations' in selected ? selected.annotations : undefined;
  if (process.env.D365_AUDIT_WRITES === 'true' && annotations?.readOnlyHint === false) {
    return services.toolAuditService.run(name,() => dispatchCrmTool(name,args,context,services!),context.signal);
  }
  return dispatchCrmTool(name,args,context,services);
}

async function dispatchCrmTool(name:string,args:any,context:MutationContext,services:ReturnType<typeof createServices>) {
  if (name === 'list_cloud_flow_connections') return services.cloudFlowService.listConnections(args,context.signal);
  if (name === 'set_cloud_flow_state') return services.cloudFlowService.setState(args,context.signal);
  if (name === 'update_cloud_flow') return services.cloudFlowService.update(args,context.signal);
  if (name === 'create_cloud_flow') return services.cloudFlowService.create(args,context.signal);
  if (name === 'list_cloud_flow_runs') return services.cloudFlowService.listRuns(args,context.signal);
  if (name === 'list_cloud_flows') return services.cloudFlowService.list(args,context.signal);
  if (name === 'get_cloud_flow') return services.cloudFlowService.get(args,context.signal);
  if (name === 'create_unmanaged_solution') return services.createSolution(args,context.signal);
  if (name === 'resolve_model_name') return services.configInspectionService.resolve(args,context.signal);
  if (name === 'check_model_configuration') return services.configInspectionService.check(args,context.signal);
  if (name === 'plan_sitemap_publication') return planSiteMapPublication(args,{
    publishSiteMap:(a,signal)=>services.siteMapPublicationService.publish(a,signal),
    inspectApplications:(a,signal)=>inspectSiteMapApplications(services.auth,a,signal),
    publishApp:(a,signal)=>services.appPublicationService.publish(a,signal),
    dependencies:(a,signal)=>services.solutionService.getDependencies(a,signal),
  },context.signal);
  if (name === 'inspect_sitemap_applications') return inspectSiteMapApplications(services.auth,args,context.signal);
  if (name === 'update_crm_user_profile') return services.userUpdateService.execute(args,context.signal);
  if (name === 'change_role_privilege') return services.rolePrivilegeService.execute(args,context.signal);
  if (name === 'manage_security_role') return services.roleDefinitionService.execute(args,context.signal);
  if (name === 'create_onprem_domain_user') return services.userProvisionService.create(args,context.signal);
  if (name === 'manage_user_roles') return services.roleAssignmentService.execute(args,context.signal);
  if (name === 'list_crm_charts') return services.chartService.list(args,context.signal);
  if (name === 'get_crm_chart') return services.chartService.get(args,context.signal);
  if (name === 'change_crm_chart') return services.chartService.mutate(args,context.signal);
  if (name === 'list_word_templates') return services.wordTemplateService.list(args,context.signal);
  if (name === 'download_word_template') return services.wordTemplateService.download(args,context.signal);
  if (name === 'change_word_template') return services.wordTemplateService.mutate(args,context.signal);
  if (name === 'list_note_attachments') return services.attachmentService.list(args,context.signal);
  if (name === 'download_note_attachment') return services.attachmentService.download(args,context.signal);
  if (name === 'download_note_attachments') return services.attachmentService.downloadBatch(args,context.signal);
  if (name === 'delete_note_attachments') return services.attachmentService.removeBatch(args,context.signal);
  if (name === 'upload_note_attachments') return services.attachmentService.upload(args,context.signal);
  if (name === 'backup_customization') return services.customizationBackupService.capture(args,context.signal);
  if (name === 'restore_customization_backup') return services.customizationBackupService.restore(args,context.signal);
  if (name === 'list_change_journal') return services.journalCatalogService.list(args,context.signal);
  if (name === 'get_change_journal') return services.journalCatalogService.get(args,context.signal);
  if (name === 'update_record_with_journal') return services.recordJournalService.save(args,context.signal);
  if (name === 'rollback_record_journal') return services.recordJournalService.rollback(args,context.signal);
  if (name === 'save_sitemap_with_journal') return services.siteMapJournalService.save(args,context.signal);
  if (name === 'rollback_sitemap_journal') return services.siteMapJournalService.rollback(args,context.signal);
  if (name === 'publish_appmodule') return services.appPublicationService.publish(args,context.signal);
  if (name === 'publish_sitemap') return services.siteMapPublicationService.publish(args,context.signal);
  const { entitySchemaService, optionSetService, relationshipService,
    fetchXmlService, metadataService, recordService, environmentService, webResourceService, pluginStepService,
    recordMutationService,recordBatchService,diagnosticService,securityEvidenceService,auditEvidenceService,modelMetadataService,modelStructureService,modelChoiceService,modelUiService,pluginImageService,pluginAssemblyService,modelMaintenanceService,apiOperationService,solutionService,solutionTransferService,solutionSnapshotService,solutionImportLogService,solutionVerificationService,ribbonService,ribbonDeploymentService } = services;
  switch (name) {
    case 'import_ribbon_solution': return ribbonDeploymentService.import(args,context.signal);
    case 'publish_ribbon_solution': return ribbonDeploymentService.publish(args,context.signal);
    case 'verify_ribbon_deployment': return ribbonDeploymentService.verify(args,context.signal);
    case 'get_ribbon_definition': return ribbonService.read(args,context.signal);
    case 'get_solution_snapshot': return solutionSnapshotService.capture(args,context.signal);
    case 'get_solution_import_log': return solutionImportLogService.read(args,context.signal);
    case 'verify_solution_deployment': return solutionVerificationService.verify(args,context.signal);
    case 'export_solution': return solutionTransferService.export(args,context.signal);
    case 'import_solution_async': return solutionTransferService.import(args,context.signal);
    case 'get_solution_import_status': return solutionTransferService.status(args,context.signal);
    case 'list_solutions': return solutionService.list(args,context.signal);
    case 'list_solution_components': return solutionService.listComponents(args,context.signal);
    case 'get_solution_component_dependencies': return solutionService.getDependencies(args,context.signal);
    case 'add_solution_component': return solutionService.add(args,context.signal);
    case 'get_api_operation': return apiOperationService.describe(args,context.signal);
    case 'update_model_column_settings': return modelMaintenanceService.updateColumn(args,context.signal);
    case 'update_model_relationship': return modelMaintenanceService.updateRelationship(args,context.signal);
    case 'reactivate_model_key': return modelMaintenanceService.reactivateKey(args,context.signal);
    case 'd365_plugin_assemblies_query': return pluginAssemblyService.query(args,context.signal);
    case 'd365_plugin_assembly_update': return pluginAssemblyService.update(args,context.signal);
    case 'd365_plugin_images_query': return pluginImageService.query(args,context.signal);
    case 'd365_plugin_image_register': return pluginImageService.mutate(args,'register',context.signal);
    case 'd365_plugin_image_update': return pluginImageService.mutate(args,'update',context.signal);
    case 'd365_plugin_image_delete': return pluginImageService.mutate(args,'delete',context.signal);
    case 'list_model_ui_components': return modelUiService.list(args,context.signal);
    case 'get_model_ui_component': return modelUiService.getComponent(args,context.signal);
    case 'edit_model_form': return modelUiService.edit(args,'form',context.signal);
    case 'edit_model_view': return modelUiService.edit(args,'view',context.signal);
    case 'get_model_choices': return modelChoiceService.getChoices(args,context.signal);
    case 'create_model_choices': return modelChoiceService.createChoices(args,context.signal);
    case 'change_model_choice_value': return modelChoiceService.changeValue(args,context.signal);
    case 'publish_model_choices': return modelChoiceService.publishChoices(args,context.signal);
    case 'get_model_relationship': return modelStructureService.getRelationship(args,context.signal);
    case 'create_model_relationship': return modelStructureService.createRelationship(args,context.signal);
    case 'get_model_key': return modelStructureService.getKey(args,context.signal);
    case 'create_model_key': return modelStructureService.createKey(args,context.signal);
    case 'get_model_definition': return modelMetadataService.get(args,context.signal);
    case 'create_model_table': return modelMetadataService.create(args,'table',context.signal);
    case 'create_model_column': return modelMetadataService.create(args,'column',context.signal);
    case 'update_model_labels': return modelMetadataService.updateLabels(args,context.signal);
    case 'publish_model_table': return modelMetadataService.publish(args,context.signal);
    case 'get_diagnostic_settings': return diagnosticService.settings(args,context.signal);
    case 'query_plugin_trace_logs': return diagnosticService.traceLogs(args,context.signal);
    case 'query_failed_system_jobs': return diagnosticService.failedJobs(args,context.signal);
    case 'diagnose_plugin_failure': return diagnosticService.diagnose(args,context.signal);
    case 'list_role_privileges': return securityEvidenceService.privileges(args,context.signal);
    case 'query_security_principals': return securityEvidenceService.principals(args,context.signal);
    case 'get_principal_security_context': return securityEvidenceService.context(args,context.signal);
    case 'get_record_access': return securityEvidenceService.access(args,context.signal);
    case 'get_record_audit_history': return auditEvidenceService.history(args,context.signal);
    case 'get_audit_details': return auditEvidenceService.details(args,context.signal);
    case 'upsert_record_by_key': return recordMutationService.execute('upsert',args,context.signal);
    case 'associate_records': return recordMutationService.execute('associate',args,context.signal);
    case 'disassociate_records': return recordMutationService.execute('disassociate',args,context.signal);
    case 'execute_record_batch': return recordBatchService.execute(args,false,context);
    case 'execute_record_transaction': return recordBatchService.execute(args,true,context);
    case 'd365_plugin_registration_metadata': return await pluginStepService.metadata(args);
    case 'd365_plugin_steps_query': return await pluginStepService.query(args,context.signal);
    case 'd365_plugin_step_register': return await pluginStepService.register(args);
    case 'd365_plugin_step_update': return await pluginStepService.update(args);
    case 'search_web_resources_by_name': return await webResourceService.search(args);
    case 'create_web_resource_and_publish': return await webResourceService.create(args, context.signal);
    case 'update_web_resource_and_publish': return await webResourceService.update(args, context.signal);
    case 'publish_web_resource': return await webResourceService.publish(args, context.signal);
    case 'get_environment_capabilities':
      return await environmentService.getCapabilities();
    case 'get_entity_metadata_summary': {
      const { logical_name } = args as { logical_name: string };
      return await entitySchemaService.getEntityMetadataSummary(logical_name);
    }

    case 'get_field_picklist_options': {
      const { logical_name, attribute_name } = args as { logical_name: string; attribute_name: string; };
      return await optionSetService.getFieldOptionSetValues(logical_name, attribute_name);
    }

    case 'get_entity_navigation_links': {
      const { entity_name, related_entity_name } = args as { entity_name: string; related_entity_name?: string; };
      return await relationshipService.getEntityNavigationRelationships(entity_name, related_entity_name);
    }

    case 'preview_fetchxml_query': {
      const { fetch_xml } = args as { fetch_xml: string };
      return await fetchXmlService.previewFetchXmlData(fetch_xml, queryInput(args));
    }

    case 'query_by_fetchxml': {
      return await fetchXmlService.query(args.fetch_xml, queryInput(args));
    }

    case 'get_current_user_context': {
      return await metadataService.getCurrentUserContext();
    }

    case 'list_all_entity_definitions': {
      return await metadataService.getAllEntityDefinitions();
    }

    case 'search_records_by_odata': {
      const { collection_name, select, filter, top } = args as { collection_name: string; select?: string; filter?: string; top?: number; };
      return await recordService.searchRecords(collection_name, select, filter, top,
        {...queryInput(args), orderby:args.orderby, expand:args.expand});
    }

    case 'get_record_by_id': {
      const { collection_name, id, select } = argumentsObject(args,['collection_name','id','select']);
      return await recordService.getRecordById(collection_name, id, select);
    }

    case 'create_new_record': {
      return recordMutationService.execute('create',args,context.signal);
    }

    case 'update_existing_record': {
      return recordMutationService.execute('update',args,context.signal);
    }

    case 'delete_record_by_id': {
      return recordMutationService.execute('delete',args,context.signal);
    }

    case 'call_d365_api_action': return apiOperationService.invoke(args,context.signal);

    case 'get_detailed_field_metadata': {
      const { entity_logical_name, attribute_logical_name } = args as { entity_logical_name: string; attribute_logical_name: string; };
      return await entitySchemaService.getDetailedFieldMetadata(entity_logical_name, attribute_logical_name);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
