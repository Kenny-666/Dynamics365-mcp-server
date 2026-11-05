import { createSolution } from './services/solutionCreate.js';
import { reviewFormReleaseScope } from './services/formScopeReview.js';
import { reviewFormThreeWay } from './services/formThreeWayReview.js';
import { reviewComponentThreeWay } from './services/componentThreeWayReview.js';
import { captureFormBaseline, verifyFormBaseline } from './services/formBaseline.js';
import { prepareFormCandidate } from './services/formCandidate.js';
import { prepareComponentCandidate } from './services/componentCandidate.js';
import { inspectFormNode, prepareFormNodeCandidate } from './services/formNodeCandidate.js';
import { inspectFormRow, prepareFormRowCandidate } from './services/formRowCandidate.js';
import { inspectCandidateSourceEvidence, inspectFormCandidateScope } from './services/formCandidateScope.js';
import { inspectDependencyGraph, reviewReleaseDependencies } from './services/formDependencyReview.js';
import { auditFormReleasePackage } from './services/formReleasePackageAudit.js';
import { capturePublishedScript, inspectPublishedResources } from './services/publishedResourceReview.js';
import { prepareFieldLabelCandidate } from './services/fieldLabelCandidate.js';
import { inspectFieldSettingsPreview, prepareFieldSettingsCandidate } from './services/fieldSettingsCandidate.js';
import { inspectFieldCreationPreview } from './services/fieldCreationReview.js';
import { prepareChoiceCandidate } from './services/choiceCandidate.js';
import { inspectFormScriptEntry, prepareFormScriptEntryCandidate } from './services/formScriptCandidate.js';
import { prepareCompositeFormCandidate } from './services/formCompositeCandidate.js';
import { xmlHash as formXmlHash } from './services/modelUiXml.js';
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
import { ModelMetadataService, hash, nativeOptions } from './services/modelMetadata.js';
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
  {name:'stage_isolated_field_settings',description:'Preview or apply selected field settings in an isolated organization using three-way review and native metadata validation.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','baseline','baseline_hash','source_hash','target_hash','selections','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},logical_name:{type:'string'},attribute_name:{type:'string'},baseline:{type:'object'},baseline_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},source_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},target_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},selections:{type:'array',minItems:1,maxItems:10,uniqueItems:true,items:{enum:['MaxLength','MinValue','MaxValue','Precision','RequiredLevel','DefaultValue','DefaultFormValue','Format','IsAuditEnabled','IsValidForAdvancedFind']}},current_members:{type:'array',maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',minimum:1},component_id:{type:'string'}}}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'prepare_field_settings_candidate',description:'Prepare explicitly selected field setting changes using reviewed baseline, source and target definitions. No writes.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','selections'],properties:{baseline:{type:'object'},source:{type:'object'},target:{type:'object'},baseline_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},source_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},target_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},selections:{type:'array',minItems:1,maxItems:10,uniqueItems:true,items:{enum:['MaxLength','MinValue','MaxValue','Precision','RequiredLevel','DefaultValue','DefaultFormValue','Format','IsAuditEnabled','IsValidForAdvancedFind']}}}},annotations:{readOnlyHint:true}},
  {name:'stage_isolated_new_field',description:'Preview or create one explicitly specified new field in an isolated organization. Source metadata and solution membership are bound to the preview; no publication.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','source_hash','spec','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},logical_name:{type:'string'},attribute_name:{type:'string'},source_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},spec:{type:'object'},current_members:{type:'array',maxItems:241,items:{type:'object'}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_create:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'prepare_composite_form_candidate',description:'Combine multiple explicitly reviewed form changes into one local candidate. No CRM writes or packaging.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','steps'],properties:{baseline:{type:'string'},source:{type:'string'},target:{type:'string'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},steps:{type:'array',minItems:1,maxItems:50,items:{type:'object',additionalProperties:false,required:['kind','selection'],properties:{kind:{enum:['attributes','nodes','row','script_entry']},selection:{type:'object'}}}}}},annotations:{readOnlyHint:true}},
  {name:'inspect_form_script_entry',description:'Inspect a unique script library or event handler entry from form XML.',inputSchema:{type:'object',additionalProperties:false,required:['formxml','kind','entry_id'],properties:{formxml:{type:'string'},kind:{enum:['library','handler']},entry_id:{type:'string'},event_name:{type:'string'},attribute_name:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'prepare_form_script_entry_candidate',description:'Add or remove one reviewed script library or handler entry in a local candidate, preserving other entries.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','kind','entry_id','action','entry_hash'],properties:{baseline:{type:'string'},source:{type:'string'},target:{type:'string'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},kind:{enum:['library','handler']},entry_id:{type:'string'},event_name:{type:'string'},attribute_name:{type:'string'},action:{enum:['add','remove']},entry_hash:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'publish_isolated_release_component',description:'Preview or publish a reviewed JavaScript web resource or entire shared global choice in an isolated organization. Publication is not atomic.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','kind','component_id','name','definition_hash','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},kind:{enum:['script','choice']},component_id:{type:'string'},name:{type:'string'},definition_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},current_members:{type:'array',maxItems:241,items:{type:'object'}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_scope:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'publish_isolated_release_table',description:'Preview or publish an entire table in an isolated organization after checking a reviewed saved form and solution membership. All pending customizations on the table may be published.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','isolated_form_id','candidate_hash','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},logical_name:{type:'string'},isolated_form_id:{type:'string'},candidate_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},current_members:{type:'array',maxItems:241,items:{type:'object'}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_entire_table:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'inspect_target_dependency',description:'Read a table, field, global choice, JavaScript resource or main form from target and isolated organizations and compare bounded evidence. Does not establish full compatibility.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','kind'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},kind:{enum:['table','field','choice','script','form']},logical_name:{type:'string'},attribute_name:{type:'string'},global_choice_name:{type:'string'},resource_name:{type:'string'},target_form_id:{type:'string'},isolated_form_id:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'inspect_isolated_dependency_graph',description:'Read a bounded native required-dependency graph in a named isolated organization. Does not infer target compatibility or authorize release.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','components'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},components:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',minimum:1},component_id:{type:'string'}}}},max_depth:{type:'integer',minimum:1,maximum:5},max_nodes:{type:'integer',minimum:1,maximum:100}}},annotations:{readOnlyHint:true}},
  {name:'capture_model_baseline',description:'Read a field or global choice definition from a named environment and record its native metadata fingerprint with organization evidence. Publication state is not established.',inputSchema:{type:'object',additionalProperties:false,required:['profile','kind','label'],properties:{profile:{type:'string'},kind:{enum:['field','choice']},logical_name:{type:'string'},attribute_name:{type:'string'},global_choice_name:{type:'string'},label:{type:'string',maxLength:200}}},annotations:{readOnlyHint:true}},
  {name:'capture_published_script_baseline',description:'Read a published UTF-8 JavaScript web resource from a named profile with organization evidence and content hash. No platform signature or lock is provided.',inputSchema:{type:'object',additionalProperties:false,required:['profile','resource_id','label'],properties:{profile:{type:'string'},resource_id:{type:'string'},label:{type:'string',maxLength:200}}},annotations:{readOnlyHint:true}},
  {name:'capture_published_form_baseline',description:'Read the published main form from a named environment and create a portable baseline with organization evidence. No platform signature or lock is provided.',inputSchema:{type:'object',additionalProperties:false,required:['profile','logical_name','form_id','label'],properties:{profile:{type:'string'},logical_name:{type:'string'},form_id:{type:'string'},label:{type:'string',maxLength:200}}},annotations:{readOnlyHint:true}},
  {name:'stage_isolated_choice_candidate',description:'Preview or apply one selected global choice option change in an isolated organization with a reviewed baseline and membership. Native writes are not atomic; does not publish.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','global_choice_name','baseline','baseline_hash','source_hash','target_hash','value','selections','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},global_choice_name:{type:'string'},baseline:{type:'object'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},value:{type:'integer',minimum:0},selections:{type:'array',minItems:1,maxItems:100,items:{type:'object'}},current_members:{type:'array',maxItems:241,items:{type:'object'}},dry_run:{type:'boolean'},expected_hash:{type:'string'},acknowledge_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'prepare_choice_candidate',description:'Prepare one local global Picklist option insertion or selected localized label changes using reviewed definitions. No writes.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','value','selections'],properties:{baseline:{type:'object'},source:{type:'object'},target:{type:'object'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},value:{type:'integer',minimum:0},selections:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['property','language_code'],properties:{property:{enum:['Label','Description']},language_code:{type:'integer',minimum:1,maximum:65535}}}}}},annotations:{readOnlyHint:true}},
  {name:'stage_isolated_field_labels',description:'Preview or merge selected localized field labels in an isolated organization after live metadata and membership checks. Uses an unprotected native PUT; does not publish.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','baseline','baseline_hash','source_hash','target_hash','selections','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},logical_name:{type:'string'},attribute_name:{type:'string'},baseline:{type:'object'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},selections:{type:'array',minItems:1,maxItems:100,items:{type:'object'}},current_members:{type:'array',maxItems:241,items:{type:'object'}},dry_run:{type:'boolean'},expected_hash:{type:'string'},acknowledge_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'prepare_field_label_candidate',description:'Build a local set of explicitly selected localized field label changes using reviewed baseline, source and target definition hashes. No writes.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','selections'],properties:{baseline:{type:'object'},source:{type:'object'},target:{type:'object'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},selections:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['property','language_code'],properties:{property:{enum:['DisplayName','Description']},language_code:{type:'integer',minimum:1,maximum:65535}}}}}},annotations:{readOnlyHint:true}},
  {name:'add_isolated_release_choice',description:'Preview or add an existing reviewed global Picklist using source and isolated field metadata evidence. Does not copy metadata or establish complete equivalence.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','isolated_choice_id','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},logical_name:{type:'string'},attribute_name:{type:'string'},isolated_choice_id:{type:'string'},current_members:{type:'array',maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',minimum:1},component_id:{type:'string'}}}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_dependencies:{type:'boolean'},acknowledge_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'add_isolated_release_field',description:'Preview or add a reviewed field to an isolated solution only when selected source and isolated field metadata match; does not copy metadata or establish full equivalence.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','isolated_field_id','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},logical_name:{type:'string'},attribute_name:{type:'string'},isolated_field_id:{type:'string'},current_members:{type:'array',maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',minimum:1},component_id:{type:'string'}}}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_dependencies:{type:'boolean'},acknowledge_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'add_isolated_release_webresource',description:'Preview or add one reviewed JavaScript resource to a dedicated isolated solution after content and membership checks; native dependencies are not automatically added.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','solution_unique_name','resource_name','resource_id','content_hash','current_members'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},solution_unique_name:{type:'string'},resource_name:{type:'string'},resource_id:{type:'string'},content_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},current_members:{type:'array',maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',minimum:1},component_id:{type:'string'}}}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_dependencies:{type:'boolean'},acknowledge_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'stage_isolated_webresource_candidate',description:'Preview or save a selected text candidate to an isolated organization using three live resource versions and optimistic concurrency; never publishes or adds solution members.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','source_id','target_id','isolated_id','baseline','baseline_hash','source_hash','target_hash','hunks'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},source_id:{type:'string'},target_id:{type:'string'},isolated_id:{type:'string'},baseline:{type:'string'},baseline_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},source_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},target_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},hunks:{type:'array',minItems:1,maxItems:100,items:{type:'object'}},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_isolated_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'export_isolated_form_release',description:'Preview or export an isolated solution after checking organization identities, published content, dependency review and approved visible membership. Audit the saved package.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','logical_name','isolated_form_id','solution_unique_name','candidate_hash','approved_members','resource_hashes','definition_evidence','dependency_review_hash','reviewed_external_dependencies','output_path'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},logical_name:{type:'string'},isolated_form_id:{type:'string'},solution_unique_name:{type:'string'},candidate_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},approved_members:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',minimum:1},component_id:{type:'string'}}}},resource_hashes:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,required:['id','content_hash'],properties:{id:{type:'string'},content_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}}},definition_evidence:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,required:['component_type','component_id','schema_name','expected_hash'],properties:{component_type:{enum:[2,9]},component_id:{type:'string'},schema_name:{type:'string'},logical_name:{type:'string'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}}},dependency_review_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},reviewed_external_dependencies:{type:'array',maxItems:5000,items:{type:'string'}},output_path:{type:'string'},managed:{type:'boolean'},dry_run:{type:'boolean'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_export:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'audit_form_release_package',description:'Inspect an exported solution ZIP against an explicit component and content-hash manifest. Reports unexpected roots and unresolved evidence; does not establish release readiness.',inputSchema:{type:'object',additionalProperties:false,required:['components'],properties:{file_path:{type:'string'},content_base64:{type:'string'},components:{type:'array',minItems:1,maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',enum:[2,9,60,61]},component_id:{type:'string'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},schema_name:{type:'string'},logical_name:{type:'string'}}}}}},annotations:{readOnlyHint:true}},
  {name:'review_release_dependencies',description:'Classify caller-supplied direct dependency reports against selected components and claimed target evidence; does not establish compatibility or transitive closure.',inputSchema:{type:'object',additionalProperties:false,required:['reports','selected_components','target_evidence'],properties:{reports:{type:'array',minItems:1,maxItems:241,items:{type:'object'}},selected_components:{type:'array',maxItems:241,items:{type:'object'}},target_evidence:{type:'array',maxItems:5000,items:{type:'object'}}}},annotations:{readOnlyHint:true}},
  {name:'apply_isolated_form_release',description:'Recompute the isolated form release preview and save only to the isolated organization with ETag protection. Requires preview hash and explicit isolation acknowledgment; no export or publication.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','logical_name','source_form_id','target_form_id','isolated_form_id','solution_unique_name','source_hash','target_hash','candidate_hash','candidate_xml','approved_paths','expected_hash','acknowledge_isolated_write'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},logical_name:{type:'string'},source_form_id:{type:'string'},target_form_id:{type:'string'},isolated_form_id:{type:'string'},solution_unique_name:{type:'string'},source_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},target_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},candidate_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},candidate_xml:{type:'string'},approved_paths:{type:'array',minItems:1,maxItems:3000,items:{type:'string'}},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},acknowledge_isolated_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
  {name:'preview_isolated_form_release',description:'Read three distinct organizations, require an empty isolated solution and matching target form, review candidate scope and preview a concurrency-protected save. No writes, export, or publication.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','isolated_profile','logical_name','source_form_id','target_form_id','isolated_form_id','solution_unique_name','source_hash','target_hash','candidate_hash','candidate_xml','approved_paths'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},isolated_profile:{type:'string'},logical_name:{type:'string'},source_form_id:{type:'string'},target_form_id:{type:'string'},isolated_form_id:{type:'string'},solution_unique_name:{type:'string'},source_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},target_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},candidate_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},candidate_xml:{type:'string'},approved_paths:{type:'array',minItems:1,maxItems:3000,items:{type:'string'}}}},annotations:{readOnlyHint:true}},
  {name:'inspect_form_candidate_scope',description:'Compare complete caller-supplied candidate and target form definitions to explicit reviewed XML paths; flags all unselected observed changes. No write or deployment authorization.',inputSchema:{type:'object',additionalProperties:false,required:['candidate','target','candidate_hash','target_hash','approved_paths'],properties:{candidate:{type:'object'},target:{type:'object'},candidate_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},target_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},approved_paths:{type:'array',maxItems:3000,items:{type:'string'}}}},annotations:{readOnlyHint:true}},
  {name:'inspect_form_row',description:'Inspect an entire form row selected by section and cell IDs.',inputSchema:{type:'object',additionalProperties:false,required:['formxml','section_id','cell_id'],properties:{formxml:{type:'string'},section_id:{type:'string'},cell_id:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'prepare_form_row_candidate',description:'Add or remove one reviewed row in a local candidate with baseline and target conflict checks.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','section_id','cell_id','action','row_hash'],properties:{baseline:{type:'string'},source:{type:'string'},target:{type:'string'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},section_id:{type:'string'},cell_id:{type:'string'},action:{enum:['add','remove']},row_hash:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'inspect_form_node',description:'Read a unique form subtree and its review hash from caller-supplied XML.',inputSchema:{type:'object',additionalProperties:false,required:['formxml','element','id'],properties:{formxml:{type:'string'},element:{enum:['tab','section','control']},id:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'prepare_form_node_candidate',description:'Construct a local candidate by replacing explicitly approved existing form subtrees with conflict checks; no writes or packaging.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','nodes'],properties:{baseline:{type:'string'},source:{type:'string'},target:{type:'string'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},nodes:{type:'array',minItems:1,maxItems:50,items:{type:'object',additionalProperties:false,required:['element','id','source_node_hash'],properties:{element:{enum:['tab','section','control']},id:{type:'string'},source_node_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}}},annotations:{readOnlyHint:true}},
  {name:'prepare_component_candidate',description:'Construct a local text candidate from explicitly selected UTF-16 ranges in reviewed baseline and source; target must equal baseline. No write or packaging.',inputSchema:{type:'object',additionalProperties:false,required:['name','baseline','source','target','baseline_hash','source_hash','target_hash','hunks'],properties:{name:{type:'string',maxLength:300},baseline:{type:'string'},source:{type:'string'},target:{type:'string'},baseline_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},source_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},target_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},hunks:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['baseline_start','baseline_end','source_start','source_end'],properties:{baseline_start:{type:'integer',minimum:0},baseline_end:{type:'integer',minimum:0},source_start:{type:'integer',minimum:0},source_end:{type:'integer',minimum:0}}}}}},annotations:{readOnlyHint:true}},
  {name:'prepare_form_candidate',description:'Construct a local candidate from target XML using explicitly selected supported attributes and reviewed baseline/source/target hashes. Does not write or package.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target','baseline_hash','source_hash','target_hash','operations'],properties:{baseline:{type:'string'},source:{type:'string'},target:{type:'string'},baseline_hash:{type:'string'},source_hash:{type:'string'},target_hash:{type:'string'},operations:{type:'array',minItems:1,maxItems:50,items:{type:'object',additionalProperties:false,required:['element','id','attribute'],properties:{element:{enum:['tab','section','control']},id:{type:'string'},attribute:{enum:['disabled','visible','showlabel','labelid']}}}}}},annotations:{readOnlyHint:true}},
  {name:'capture_form_baseline',description:'Create a caller-supplied saved form baseline snapshot with an integrity hash. Does not verify provenance or publication.',inputSchema:{type:'object',additionalProperties:false,required:['form','label'],properties:{form:{type:'object'},label:{type:'string',maxLength:200}}},annotations:{readOnlyHint:true}},
  {name:'verify_form_baseline',description:'Check a baseline snapshot against an independently retained hash. Does not authenticate provenance or publication.',inputSchema:{type:'object',additionalProperties:false,required:['snapshot','expected_hash'],properties:{snapshot:{type:'object'},expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}},annotations:{readOnlyHint:true}},
  {name:'review_component_three_way',description:'Compare caller-supplied baseline, source and target text contents using whole-file hashes. Reports concurrent changes; does not merge, package or authorize release.',inputSchema:{type:'object',additionalProperties:false,required:['name','baseline','source','target'],properties:{name:{type:'string',maxLength:300},baseline:{type:'string'},source:{type:'string'},target:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'review_form_three_way',description:'Compare caller-supplied baseline, source and target saved main-form definitions. Report positional change overlaps for review; does not merge or authorize release.',inputSchema:{type:'object',additionalProperties:false,required:['baseline','source','target'],properties:{baseline:{type:'object'},source:{type:'object'},target:{type:'object'}}},annotations:{readOnlyHint:true}},
  {name:'review_form_release_scope',description:'Review a previously returned form package plan against explicitly selected XML paths and components. Local review only; does not authorize execution or establish a trusted baseline.',inputSchema:{type:'object',additionalProperties:false,required:['plan','approved_paths','approved_components'],properties:{plan:{type:'object'},approved_paths:{type:'array',maxItems:3000,items:{type:'string'}},approved_components:{type:'array',maxItems:240,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',enum:[2,9,61]},component_id:{type:'string'}}}}}},annotations:{readOnlyHint:true}},
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
  {name:'apply_form_solution_package',description:'Preview selected form and candidate components. Execution is disabled until unrelated changes can be isolated and release scope verified.',inputSchema:{type:'object',additionalProperties:false,required:['source_profile','target_profile','logical_name','source_form_id','target_form_id','solution_unique_name','components'],properties:{source_profile:{type:'string'},target_profile:{type:'string'},logical_name:{type:'string'},source_form_id:{type:'string'},target_form_id:{type:'string'},solution_unique_name:{type:'string'},components:{type:'array',minItems:1,maxItems:241,items:{type:'object',additionalProperties:false,required:['component_type','component_id'],properties:{component_type:{type:'integer',enum:[2,9,60,61]},component_id:{type:'string'}}}},dry_run:{type:'boolean'},expected_hash:{type:'string'},allow_unprotected_write:{type:'boolean'}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
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

// Describe nested inputs so MCP clients can construct valid requests without guessing.
const localizedTextSchema=(maxLength:number)=>({type:'array',minItems:1,maxItems:50,items:{type:'object',additionalProperties:false,required:['language_code','text'],properties:{language_code:{type:'integer',minimum:1,maximum:65535},text:{type:'string',minLength:1,maxLength}}}});
const compositeSchema=tools.find(tool=>tool.name==='prepare_composite_form_candidate')!.inputSchema;
const attributeSelection=tools.find(tool=>tool.name==='prepare_form_candidate')!.inputSchema.properties.operations;
const nodeSelection=tools.find(tool=>tool.name==='prepare_form_node_candidate')!.inputSchema.properties.nodes;
compositeSchema.properties.steps.items={oneOf:[
 {type:'object',additionalProperties:false,required:['kind','selection'],properties:{kind:{const:'attributes'},selection:{type:'object',additionalProperties:false,required:['operations'],properties:{operations:attributeSelection}}}},
 {type:'object',additionalProperties:false,required:['kind','selection'],properties:{kind:{const:'nodes'},selection:{type:'object',additionalProperties:false,required:['nodes'],properties:{nodes:nodeSelection}}}},
 {type:'object',additionalProperties:false,required:['kind','selection'],properties:{kind:{const:'row'},selection:{type:'object',additionalProperties:false,required:['section_id','cell_id','action','row_hash'],properties:{section_id:{type:'string'},cell_id:{type:'string'},action:{enum:['add','remove']},row_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}},
 {type:'object',additionalProperties:false,required:['kind','selection'],properties:{kind:{const:'script_entry'},selection:{type:'object',additionalProperties:false,required:['kind','entry_id','action','entry_hash'],properties:{kind:{enum:['library','handler']},entry_id:{type:'string'},event_name:{type:'string'},attribute_name:{type:'string'},action:{enum:['add','remove']},entry_hash:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}}
]};
const isolatedFieldSchema=tools.find(tool=>tool.name==='stage_isolated_new_field')!.inputSchema;
isolatedFieldSchema.properties.spec={type:'object',additionalProperties:false,required:['schema_name','display_name','type'],properties:{schema_name:{type:'string'},display_name:localizedTextSchema(100),description:localizedTextSchema(2000),type:{enum:['String','Memo','Integer','Decimal','Money','DateTime']},max_length:{type:'integer'},min_value:{type:'number'},max_value:{type:'number'},precision:{type:'integer'},required_level:{enum:['None','Recommended','ApplicationRequired']},format:{enum:['DateAndTime','DateOnly']},date_time_behavior:{enum:['UserLocal','DateOnly','TimeZoneIndependent']}}};
for(const toolName of ['add_isolated_release_field','add_isolated_release_choice']){const tool=tools.find(item=>item.name===toolName)!;tool.description='Preview or add a reviewed isolated component by its exact definition hash; source differences and dependencies require review.';const schema=tool.inputSchema;schema.properties.isolated_definition_hash={type:'string',pattern:'^[a-f0-9]{64}$',description:'Reviewed native definition hash of the isolated field or global choice.'};schema.required.push('isolated_definition_hash');}
for(const toolName of ['stage_isolated_field_labels','stage_isolated_field_settings','stage_isolated_choice_candidate']){const schema=tools.find(item=>item.name===toolName)!.inputSchema;schema.properties.isolated_definition_hash={type:'string',pattern:'^[a-f0-9]{64}$',description:'Current reviewed native component definition hash in the isolated organization.'};schema.required.push('isolated_definition_hash');}
const inspectionSchema={type:'object',additionalProperties:false,required:['kind'],properties:{kind:{enum:['table','field','choice','script','form']},logical_name:{type:'string'},attribute_name:{type:'string'},global_choice_name:{type:'string'},resource_name:{type:'string'},target_form_id:{type:'string'},isolated_form_id:{type:'string'}}};
// The export operation binds every external dependency to a fresh target inspection.
const isolatedExportSchema=tools.find(tool=>tool.name==='export_isolated_form_release')!.inputSchema;
isolatedExportSchema.properties.target_dependency_evidence={type:'array',maxItems:100,items:{type:'object',additionalProperties:false,required:['dependency','inspection','expected_hash'],properties:{dependency:{type:'string',description:'Dependency key in componentType:isolatedComponentId form.'},inspection:inspectionSchema,expected_hash:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Evidence hash returned by inspect_target_dependency.'}}}};
isolatedExportSchema.required.push('target_dependency_evidence');

/** Select exposed tools without changing the default full inventory. */
export function selectTools(setting = process.env.D365_TOOLSETS ?? 'all') {
  const groups: Record<string, string[]> = {
    query: ['list_role_privileges','resolve_model_name','get_environment_capabilities','get_entity_metadata_summary','get_field_picklist_options',
      'get_entity_navigation_links','preview_fetchxml_query','query_by_fetchxml','get_current_user_context',
      'list_all_entity_definitions','search_records_by_odata','get_record_by_id','get_detailed_field_metadata',
      ...evidenceTools.map(t => t.name)],
    data: ['update_crm_user_profile','change_role_privilege','manage_security_role','create_onprem_domain_user','manage_user_roles',...attachmentTools.map(t => t.name),...recordMutationTools.map(t => t.name),'update_record_with_journal','rollback_record_journal'],
    config: ['stage_isolated_new_field','prepare_composite_form_candidate','inspect_form_script_entry','prepare_form_script_entry_candidate','publish_isolated_release_component','publish_isolated_release_table','inspect_target_dependency','inspect_isolated_dependency_graph','capture_model_baseline','capture_published_script_baseline','capture_published_form_baseline','stage_isolated_choice_candidate','prepare_choice_candidate','stage_isolated_field_labels','prepare_field_label_candidate','add_isolated_release_choice','add_isolated_release_field','add_isolated_release_webresource','stage_isolated_webresource_candidate','export_isolated_form_release','audit_form_release_package','review_release_dependencies','apply_isolated_form_release','preview_isolated_form_release','inspect_form_candidate_scope','inspect_form_row','prepare_form_row_candidate','inspect_form_node','prepare_form_node_candidate','prepare_component_candidate','prepare_form_candidate','capture_form_baseline','verify_form_baseline','review_component_three_way','review_form_three_way','review_form_release_scope','list_cloud_flow_runs','create_unmanaged_solution','update_cloud_flow','list_cloud_flow_connections','set_cloud_flow_state','create_cloud_flow','prepare_cloud_flow','list_cloud_flows','get_cloud_flow','inspect_form_solution_package','apply_form_solution_package','plan_form_solution_package','compare_environment_forms',...chartTools.map(t => t.name),'backup_customization','restore_customization_backup','check_model_configuration', ...[...modelMaintenanceTools,...modelUiTools,...modelChoiceTools,...modelStructureTools,
      ...modelMetadataTools,...siteMapTools].map(t => t.name)],
    deploy: [...wordTemplateTools,...solutionTools,...solutionTransferTools,...solutionVerificationTools,...ribbonTools,
      ...ribbonDeploymentTools,...pluginAssemblyTools,...pluginImageTools,...webResourceTools,
      ...pluginStepTools,...apiOperationTools].map(t => t.name),
    consultant: ['manage_consultant_project'],
    diagnostics: ['list_change_journal','get_change_journal','clear_server_cache', ...evidenceTools.map(t => t.name)],
  };
  groups.config.push('prepare_field_settings_candidate','stage_isolated_field_settings');
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

/** Report observed membership changes without masking an already completed write. */
async function membershipAfterWrite(service:any,solutionName:string,before:string[],selected:string|null,signal?:AbortSignal){
 try{const result=await service.solutionService.listComponents({solution_unique_name:solutionName,top:500,max_pages:20},signal);if(!result.paging?.complete)return {status:'incomplete',paging:result.paging};const after=result.items.map((item:any)=>{if(!Number.isSafeInteger(item.componenttype)||!item.objectid)throw new Error('Invalid membership identity.');return item.componenttype+':'+guid(item.objectid);}).sort();if(new Set(after).size!==after.length)throw new Error('Duplicate membership identity.');const old=new Set(before),now=new Set(after),added=after.filter((x:string)=>!old.has(x)),removed=before.filter(x=>!now.has(x)),unexpected=added.filter((x:string)=>x!==selected);return {status:unexpected.length||removed.length?'review_required':'observed',added,removed,unexpected,items:after,paging:result.paging};}catch{return {status:'unknown',note:'The write may have succeeded; inspect membership before retrying.'};}
}

export async function handleToolCall(name: string, args: any = {}, context:MutationContext & {environmentProfile?:string} = {}):Promise<any> {
  if (!tools.some(tool => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
  if(name==='stage_isolated_new_field'){
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','source_hash','spec','current_members'];if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_create'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated field creation request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;if(execute&&(args.acknowledge_create!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('A matching preview hash and explicit creation acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(typeof args.source_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.source_hash)||!args.spec||typeof args.spec!=='object'||Array.isArray(args.spec)||Object.keys(args.spec).some(k=>!['schema_name','display_name','description','type','max_length','min_value','max_value','precision','required_level','format','date_time_behavior'].includes(k))||!['String','Memo','Integer','Decimal','Money','DateTime'].includes(args.spec.type)||typeof args.spec.schema_name!=='string'||args.spec.schema_name.toLowerCase()!==String(args.attribute_name).toLowerCase()||!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('A bounded scalar-field specification, source hash and current membership are required.');
    if(typeof args.logical_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(args.logical_name)||typeof args.attribute_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(args.attribute_name))throw new Error('Valid table and field logical names are required.');
    const approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length)throw new Error('Duplicate approved member.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const isolated=services[2];const readState=async()=>{const query=new URLSearchParams({$select:'LogicalName,MetadataId',$filter:`LogicalName eq '${args.attribute_name.toLowerCase()}'`,$top:'2'});const [source,members,targetField]=await Promise.all([services[0].modelMetadataService.get({logical_name:args.logical_name,attribute_name:args.attribute_name},context.signal),isolated.solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal),services[1].auth.requestWithResponse<Record<string,any>>(`/EntityDefinitions(LogicalName='${args.logical_name.toLowerCase()}')/Attributes?${query}`,'GET',undefined,{signal:context.signal,headers:{'Cache-Control':'no-cache'}})]);if(source.definitionHash!==args.source_hash||String(source.definition.SchemaName).toLowerCase()!==args.spec.schema_name.toLowerCase()||source.definition.AttributeType!==args.spec.type)throw new Error('Source field identity, type or reviewed definition changed.');if(targetField.status!==200||!Array.isArray(targetField.data?.value)||targetField.data['@odata.nextLink']||targetField.data.value.length!==0)throw new Error('The target field must be confirmed absent before creating a new field.');if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {source,members,targetFieldAbsent:true};};
    const state=await readState(),createArgs={...args.spec,logical_name:args.logical_name,solution_unique_name:args.solution_unique_name};const native=await isolated.modelMetadataService.create({...createArgs,dry_run:true},'column',context.signal);
    const propertyReview=inspectFieldCreationPreview(state.source.definition,native.request?.body);if(propertyReview.status!=='selected_properties_match')throw new Error('Field creation parameters differ from the selected source properties.');
    const planHash=hash({profiles,identities,sourceHash:state.source.definitionHash,targetFieldAbsent:state.targetFieldAbsent,solution:state.members.solution,members:state.members.items,spec:args.spec,native,propertyReview});
    if(!execute)return {dryRun:true,planHash,identities,native,propertyReview,sourceDefinition:state.source.definition,limitations:['Only the listed properties and labels are compared; other source metadata still requires review.','Creation is not atomic with duplicate checks and the platform assigns metadata identity.','Publication and dependencies are not verified.']};
    if(args.expected_hash!==planHash)throw new Error('Field creation preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Source definition or solution membership changed before create.');
    const result=await isolated.modelMetadataService.create({...createArgs,dry_run:false},'column',context.signal);const createdId=result.readback?.metadataId,selected=typeof createdId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdId)?'2:'+createdId.toLowerCase():null;const membership=await membershipAfterWrite(isolated,args.solution_unique_name,approved,selected,context.signal);return {dryRun:false,planHash,result,membership,publication:'not_requested',sourceEquivalence:'not_verified',dependencyClosureVerified:false,note:'Inspect created metadata and membership before continuing. Never blindly repeat an unknown create outcome.'};
  }
  if (name === 'prepare_composite_form_candidate') return prepareCompositeFormCandidate(args);
  if (name === 'inspect_form_script_entry') return inspectFormScriptEntry(args);
  if (name === 'prepare_form_script_entry_candidate') return prepareFormScriptEntryCandidate(args);
  if(name==='publish_isolated_release_component'){
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','kind','component_id','name','definition_hash','current_members'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_scope'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('Explicit isolated publication parameters are required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_scope!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('A matching preview hash and explicit publication scope acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(!['script','choice'].includes(args.kind)||typeof args.name!=='string'||!args.name.trim()||typeof args.definition_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.definition_hash)||!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('Component identity, hash and current membership are required.');
    const componentId=guid(args.component_id),type=args.kind==='script'?61:9,approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length||!approved.includes(type+':'+componentId))throw new Error('Current membership must include the selected component exactly once.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const isolated=services[2];const readState=async()=>{const [component,members]=await Promise.all([args.kind==='script'?readFormLibrary(isolated.auth,args.name,context.signal):isolated.modelChoiceService.getChoices({global_choice_name:args.name},context.signal),isolated.solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal)]);if(args.kind==='script'){if(component.status!=='available'||guid(component.id)!==componentId||component.type!==3||component.contentHash!==args.definition_hash)throw new Error('Saved JavaScript identity or content differs.');}else if(guid(component.definition?.MetadataId)!==componentId||component.definitionHash!==args.definition_hash)throw new Error('Saved global choice identity or definition differs.');if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {component,members};};
    const state=await readState(),native=args.kind==='script'?await isolated.webResourceService.publish({id:componentId,dry_run:true},context.signal):await isolated.modelChoiceService.publishChoices({global_choice_name:args.name,dry_run:true},context.signal),planHash=hash({profiles,identities,type,componentId,definitionHash:args.definition_hash,solution:state.members.solution,members:state.members.items,native});
    if(!execute)return {dryRun:true,planHash,identities,native,scope:args.kind==='script'?'single_web_resource':'entire_shared_global_choice_including_pending_changes',limitations:['Publication has no atomic lock.','Global choices can affect every referencing field and include all pending changes.','The tool does not establish all pending changes or runtime compatibility.']};
    if(args.expected_hash!==planHash)throw new Error('Publication preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Component or membership changed before publication.');
    const publication=args.kind==='script'?await isolated.webResourceService.publish({id:componentId,dry_run:false},context.signal):await isolated.modelChoiceService.publishChoices({global_choice_name:args.name,dry_run:false},context.signal);
    if(args.kind==='choice')return {dryRun:false,planHash,publication,readback:'published_definition_not_independently_verified',runtimeVerified:false};
    try{const published=await capturePublishedScript(isolated.auth,componentId,context.signal);return {dryRun:false,planHash,publication,readback:published.contentHash===args.definition_hash?'content_matched':'content_different',runtimeVerified:false};}catch{return {dryRun:false,planHash,publication,readback:'unknown',runtimeVerified:false,note:'Publication was accepted but readback failed; inspect before retrying.'};}
  }
  if(name==='publish_isolated_release_table'){
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','isolated_form_id','candidate_hash','current_members'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_entire_table'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('Explicit isolated publication parameters are required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_entire_table!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('A matching preview hash and explicit entire-table publication acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(typeof args.candidate_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.candidate_hash)||!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('Candidate hash and current membership are required.');
    const approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length||!approved.includes('60:'+guid(args.isolated_form_id)))throw new Error('Current membership must include the selected form exactly once.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const isolated=services[2];const readState=async()=>{const [form,members]=await Promise.all([isolated.modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id:args.isolated_form_id},context.signal),isolated.solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal)]);if(formXmlHash(form.xml.formxml,'form')!==args.candidate_hash)throw new Error('Isolated saved form differs from the reviewed candidate.');if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {form,members};};
    const state=await readState(),native=await isolated.modelMetadataService.publish({logical_name:args.logical_name,dry_run:true},context.signal),planHash=hash({profiles,identities,formHash:args.candidate_hash,formDefinition:state.form.definitionHash,solution:state.members.solution,members:state.members.items,native});
    if(!execute)return {dryRun:true,planHash,identities,native,scope:'entire_table_including_other_pending_customizations',limitations:['The tool cannot enumerate all pending table customizations.','Publication has no atomic lock and can include unrelated pending changes.','Use a dedicated isolated environment and independently review pending work.']};
    if(args.expected_hash!==planHash)throw new Error('Publication preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Form or membership changed before publication.');
    const publication=await isolated.modelMetadataService.publish({logical_name:args.logical_name,dry_run:false},context.signal);
    try{const read=await isolated.auth.requestWithResponse<Record<string,any>>(`/systemforms(${guid(args.isolated_form_id)})?$select=formid,type,formxml`,'GET',undefined,{signal:context.signal,headers:{'Cache-Control':'no-cache'}});if(read.status===200&&read.data&&guid(read.data.formid)===guid(args.isolated_form_id)&&read.data.type===2&&typeof read.data.formxml==='string'&&formXmlHash(read.data.formxml,'form')===args.candidate_hash)return {dryRun:false,planHash,publication,readback:'form_matched',scope:'entire_table',runtimeVerified:false};}catch{}
    return {dryRun:false,planHash,publication,readback:'unknown_or_different',scope:'entire_table',runtimeVerified:false,note:'Publication was accepted but form readback did not match or was unavailable. Inspect before retrying.'};
  }
  if(name==='inspect_target_dependency'){
    const common=['source_profile','target_profile','isolated_profile','kind'];const names:Record<string,string[]>={table:['logical_name'],field:['logical_name','attribute_name'],choice:['global_choice_name'],script:['resource_name'],form:['logical_name','target_form_id','isolated_form_id']};
    if(!args||typeof args!=='object'||Array.isArray(args)||!Object.hasOwn(names,args.kind)||Object.keys(args).some(k=>![...common,...names[args.kind]].includes(k))||[...common,...names[args.kind]].some(k=>typeof args[k]!=='string'||!args[k].trim()))throw new Error('Provide the explicit dependency identity for the selected kind.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const target=services[1],isolated=services[2];let evidence:Record<string,any>;
    if(args.kind==='table'){
      const [left,right]=await Promise.all([isolated.modelMetadataService.get({logical_name:args.logical_name},context.signal),target.modelMetadataService.get({logical_name:args.logical_name},context.signal)]);
      const properties=['LogicalName','SchemaName','PrimaryIdAttribute','OwnershipType','IsActivity'];const complete=properties.every(key=>Object.hasOwn(left.definition,key)&&Object.hasOwn(right.definition,key)&&left.definition[key]!==undefined&&right.definition[key]!==undefined);
      const differingProperties=complete?properties.filter(key=>hash(left.definition[key])!==hash(right.definition[key])):[];
      evidence={componentType:1,isolatedId:guid(left.definition.MetadataId),targetId:guid(right.definition.MetadataId),comparison:!complete?'unknown':differingProperties.length?'selected_properties_differ':'selected_properties_match',checkedProperties:properties,differingProperties,isolatedHash:left.definitionHash,targetHash:right.definitionHash};
    }else if(args.kind==='field'){
      const field=await inspectFormField(args.attribute_name,args.logical_name,(side,table,attribute)=>(side==='source'?isolated:target).modelMetadataService.get({logical_name:table,attribute_name:attribute},context.signal),context.signal);
      evidence={componentType:2,isolatedId:field.source.status==='available'?guid(field.source.metadataId):null,targetId:field.target.status==='available'?guid(field.target.metadataId):null,comparison:field.comparison,details:field};
    }else if(args.kind==='script'){
      const [left,right]=await Promise.all([readFormLibrary(isolated.auth,args.resource_name,context.signal),readFormLibrary(target.auth,args.resource_name,context.signal)]);
      evidence={componentType:61,isolatedId:left.status==='available'?guid(left.id):null,targetId:right.status==='available'?guid(right.id):null,comparison:left.status==='available'&&right.status==='available'?(left.type===right.type&&left.contentHash===right.contentHash?'content_and_type_match':'content_or_type_differ'):'unknown',isolated:left,target:right};
    }else if(args.kind==='choice'){
      const [left,right]=await Promise.all([isolated.modelChoiceService.getChoices({global_choice_name:args.global_choice_name},context.signal),target.modelChoiceService.getChoices({global_choice_name:args.global_choice_name},context.signal)]);
      evidence={componentType:9,isolatedId:guid(left.definition.MetadataId),targetId:guid(right.definition.MetadataId),comparison:left.definitionHash===right.definitionHash?'definition_hash_match':'definition_hash_differ',isolatedHash:left.definitionHash,targetHash:right.definitionHash};
    }else{
      const [left,right]=await Promise.all([isolated.modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id:args.isolated_form_id},context.signal),target.modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id:args.target_form_id},context.signal)]);
      const leftHash=formXmlHash(left.xml.formxml,'form'),rightHash=formXmlHash(right.xml.formxml,'form');evidence={componentType:60,isolatedId:guid(left.id),targetId:guid(right.id),comparison:leftHash===rightHash?'saved_xml_hash_match':'saved_xml_hash_differ',isolatedHash:leftHash,targetHash:rightHash};
    }
    return {identities,evidence,evidenceHash:hash({profiles,identities,evidence}),publication:'not_determined',compatibility:'not_established',limitations:['Only explicitly requested identity and bounded properties are compared.','Saved definitions may be unpublished and reads are non-transactional.','Matching evidence is not a complete dependency, licensing or runtime compatibility proof.']};
  }
  if(name==='inspect_isolated_dependency_graph'){
    const allowed=['source_profile','target_profile','isolated_profile','components','max_depth','max_nodes'];if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k)))throw new Error('An explicit dependency graph request is required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const graph=await inspectDependencyGraph({components:args.components,...(args.max_depth===undefined?{}:{max_depth:args.max_depth}),...(args.max_nodes===undefined?{}:{max_nodes:args.max_nodes})},(id,type)=>services[2].solutionService.getDependencies({component_id:id,component_type:type,direction:'required',top:500,max_pages:10},context.signal),context.signal);
    return {identities,graph,evidenceHash:hash({profiles,identities,reviewHash:graph.reviewHash}),publication:'not_checked'};
  }
  if(name==='capture_model_baseline'){
    const allowed=['profile','kind','label','logical_name','attribute_name','global_choice_name'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k))||typeof args.profile!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(args.profile)||!['field','choice'].includes(args.kind)||typeof args.label!=='string'||!args.label.trim()||args.label.length>200||/[\x00-\x1f]/.test(args.label))throw new Error('A named profile, kind and baseline label are required.');
    const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value);
    if(args.kind==='field'&&(!identifier(args.logical_name)||!identifier(args.attribute_name)||args.global_choice_name!==undefined)||args.kind==='choice'&&(!identifier(args.global_choice_name)||args.logical_name!==undefined||args.attribute_name!==undefined))throw new Error('Supply a table and field for field baselines, or a global choice name for choice baselines.');
    const key=args.profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(args.profile);servicePool.set(key,service);}
    const [identity,record]=await Promise.all([service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal}),args.kind==='field'?service.modelMetadataService.get({logical_name:args.logical_name,attribute_name:args.attribute_name},context.signal):service.modelChoiceService.getChoices({global_choice_name:args.global_choice_name},context.signal)]);
    if(identity.status!==200||!identity.data||!record.definition||typeof record.definitionHash!=='string'||hash(record.definition)!==record.definitionHash)throw new Error('Metadata or organization identity could not be established.');
    const provenance={profile:key,organization:guid(identity.data.OrganizationId),user:guid(identity.data.UserId),kind:args.kind,logicalName:args.logical_name??null,attributeName:args.attribute_name??null,globalChoiceName:args.global_choice_name??null,source:'native_metadata_read',definitionHash:record.definitionHash,publication:'not_determined'};
    return {label:args.label.trim(),definition:record.definition,definitionHash:record.definitionHash,provenance,evidenceHash:hash({label:args.label.trim(),provenance}),note:'Native metadata publication state is not established. Store this unsigned observation in a controlled versioned location.'};
  }
  if(name==='capture_published_script_baseline'){
    const required=['profile','resource_id','label'];if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!required.includes(k))||required.some(k=>!Object.hasOwn(args,k))||typeof args.profile!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(args.profile)||typeof args.label!=='string'||!args.label.trim()||args.label.length>200||/[\x00-\x1f]/.test(args.label))throw new Error('A named profile, resource ID and baseline label are required.');
    const key=args.profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(args.profile);servicePool.set(key,service);}
    const [identity,published,saved]=await Promise.all([service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal}),capturePublishedScript(service.auth,args.resource_id,context.signal),service.webResourceService.getBackup({id:args.resource_id},context.signal)]);
    if(identity.status!==200||!identity.data||saved.id!==published.id||saved.name!==published.name||saved.resourceType!==published.type)throw new Error('Published resource or organization identity could not be established.');
    const provenance={profile:key,organization:guid(identity.data.OrganizationId),user:guid(identity.data.UserId),resourceId:published.id,name:published.name,type:published.type,source:'published_native_read',contentHash:published.contentHash,savedDefinitionHash:saved.definitionHash};
    return {label:args.label.trim(),content:published.content,contentHash:published.contentHash,provenance,evidenceHash:hash({label:args.label.trim(),provenance}),note:'Store this snapshot and evidence in a controlled location. The record is not signed and does not lock the environment.'};
  }
  if(name==='capture_published_form_baseline'){
    const required=['profile','logical_name','form_id','label'];if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!required.includes(k))||required.some(k=>!Object.hasOwn(args,k))||typeof args.profile!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(args.profile))throw new Error('A named profile and form identity are required.');
    const key=args.profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(args.profile);servicePool.set(key,service);}
    const formId=guid(args.form_id);
    const [identity,saved,published]=await Promise.all([service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal}),service.modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id:formId},context.signal),service.auth.requestWithResponse<Record<string,any>>(`/systemforms(${formId})?$select=formid,type,formxml`,'GET',undefined,{signal:context.signal,headers:{'Cache-Control':'no-cache'}})]);
    if(identity.status!==200||!identity.data||published.status!==200||!published.data||guid(published.data.formid)!==formId||published.data.type!==2||typeof published.data.formxml!=='string'||saved.type!==2)throw new Error('Published form or organization identity could not be established.');
    const organization=guid(identity.data.OrganizationId),user=guid(identity.data.UserId),baseline=captureFormBaseline({label:args.label,form:{...saved,xml:{formxml:published.data.formxml}}});
    const provenance={profile:key,organization,user,formId,logicalName:saved.logicalName,source:'published_native_read',publishedXmlHash:baseline.snapshot.xmlHash,savedXmlHash:formXmlHash(saved.xml.formxml,'form')};
    return {...baseline,provenance,evidenceHash:hash({snapshotHash:baseline.snapshotHash,provenance}),note:'A native read records observed state only; retain the snapshot and evidence hash in a controlled location. It is not signed and is not a transactional lock.'};
  }
  if(name==='stage_isolated_choice_candidate'){
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','global_choice_name','baseline','baseline_hash','source_hash','target_hash','isolated_definition_hash','value','selections','current_members'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_unprotected_write'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated choice request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_unprotected_write!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('Matching preview hash and explicit unprotected-write acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(typeof args.global_choice_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(args.global_choice_name)||!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('Valid choice name and explicit membership are required.');
    const approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length)throw new Error('Duplicate approved member.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const readState=async()=>{const [definitions,members]=await Promise.all([Promise.all(services.map(service=>service.modelChoiceService.getChoices({global_choice_name:args.global_choice_name},context.signal))),services[2].solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal)]);if(guid(definitions[1].definition.MetadataId)!==guid(definitions[2].definition.MetadataId)||typeof args.isolated_definition_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.isolated_definition_hash)||definitions[2].definitionHash!==args.isolated_definition_hash||hash(definitions[2].definition)!==args.isolated_definition_hash)throw new Error('Isolated choice identity or reviewed definition differs.');if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {definitions,members};};
    const state=await readState(),options=nativeOptions(state.definitions[2].definition).filter((item:any)=>item.Value===args.value);if(options.length>1)throw new Error('Isolated option identity is ambiguous.');
    const candidate=prepareChoiceCandidate({baseline:args.baseline,source:state.definitions[0].definition,target:state.definitions[1].definition,baseline_hash:args.baseline_hash,source_hash:args.source_hash,target_hash:args.target_hash,value:args.value,selections:args.selections},options.length===1);
    if(candidate.operation.operation==='update'&&options.length!==1)throw new Error('The isolated option is missing.');
    for(const change of candidate.changes){const label=options[0]?.[change.property];if(label==null){if(change.targetBefore!==null)throw new Error('A selected isolated option label differs from the reviewed target.');continue;}if(!Array.isArray(label.LocalizedLabels)||label['LocalizedLabels@odata.nextLink'])throw new Error('Isolated option labels are incomplete.');const found=label.LocalizedLabels.filter((item:any)=>item?.LanguageCode===change.language_code);if(found.length>1||found.length===1&&typeof found[0].Label!=='string'||(found[0]?.Label??null)!==change.targetBefore)throw new Error('A selected isolated option label differs from the reviewed target.');}
    const nativeOperation=candidate.operation.operation==='insert'&&options.length===1?'update':candidate.operation.operation;
    const updateArgs={global_choice_name:args.global_choice_name,solution_unique_name:args.solution_unique_name,...candidate.operation,operation:nativeOperation};const native=await services[2].modelChoiceService.changeValue({...updateArgs,dry_run:true,expected_hash:state.definitions[2].definitionHash},context.signal);
    const planHash=hash({profiles,identities,definitions:state.definitions.map(x=>x.definitionHash),solution:state.members.solution,members:state.members.items,candidate:candidate.reviewHash,native});
    if(!execute)return {dryRun:true,planHash,identities,candidate,native,limitations:['Global choice updates can affect all referencing columns.','Native option actions have no atomic concurrency lock.','Publication and dependency completeness are not verified.']};
    if(args.expected_hash!==planHash)throw new Error('Choice preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Choice definition or membership changed before the write.');
    const saved=await services[2].modelChoiceService.changeValue({...updateArgs,dry_run:false,expected_hash:native.definitionHash,allow_unprotected_write:true},context.signal);
    const membership=await membershipAfterWrite(services[2],args.solution_unique_name,approved,'9:'+guid(state.definitions[2].definition.MetadataId),context.signal);
    return {dryRun:false,planHash,saved,membership,publication:'not_requested',dependencyClosureVerified:false,note:'The native write is not atomic with preflight. Inspect before retrying any unknown outcome.'};
  }
  if (name === 'prepare_choice_candidate') return prepareChoiceCandidate(args);
  if(name==='stage_isolated_field_labels'){
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','baseline','baseline_hash','source_hash','target_hash','isolated_definition_hash','selections','current_members'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_unprotected_write'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated field label request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_unprotected_write!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('A matching preview hash and unprotected-write acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('An explicit current membership is required.');
    const approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length)throw new Error('Duplicate approved member.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const readState=async()=>{const [definitions,matching,members]=await Promise.all([Promise.all(services.map(service=>service.modelMetadataService.get({logical_name:args.logical_name,attribute_name:args.attribute_name},context.signal))),inspectFormField(args.attribute_name,args.logical_name,(side,table,attribute)=>(side==='source'?services[1]:services[2]).modelMetadataService.get({logical_name:table,attribute_name:attribute},context.signal),context.signal),services[2].solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal)]);if(guid(definitions[1].definition.MetadataId)!==guid(definitions[2].definition.MetadataId)||typeof args.isolated_definition_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.isolated_definition_hash)||definitions[2].definitionHash!==args.isolated_definition_hash||hash(definitions[2].definition)!==args.isolated_definition_hash)throw new Error('Isolated field identity or reviewed definition differs.');if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {definitions,matching,members};};
    const state=await readState();const candidate=prepareFieldLabelCandidate({baseline:args.baseline,source:state.definitions[0].definition,target:state.definitions[1].definition,baseline_hash:args.baseline_hash,source_hash:args.source_hash,target_hash:args.target_hash,selections:args.selections});
    for(const change of candidate.changes){const label=state.definitions[2].definition[change.property];if(!label||!Array.isArray(label.LocalizedLabels)||label['LocalizedLabels@odata.nextLink'])throw new Error('Isolated localized labels are unavailable or incomplete.');const found=label.LocalizedLabels.filter((item:any)=>item?.LanguageCode===change.language_code);if(found.length>1||found.length===1&&typeof found[0].Label!=='string'||(found[0]?.Label??null)!==change.targetBefore)throw new Error('A selected isolated label differs from the reviewed target.');}
    const updateArgs={logical_name:args.logical_name,attribute_name:args.attribute_name,solution_unique_name:args.solution_unique_name,...candidate.operations};const native=await services[2].modelMetadataService.updateLabels({...updateArgs,dry_run:true,expected_hash:state.definitions[2].definitionHash},context.signal);
    const planHash=hash({profiles,identities,definitions:state.definitions.map(x=>x.definitionHash),matching:state.matching,solution:state.members.solution,members:state.members.items,candidate:candidate.reviewHash,native});
    if(!execute)return {dryRun:true,planHash,identities,candidate,native,limitations:['Native metadata PUT has no atomic concurrency lock.','Selected properties do not establish complete metadata equivalence.','Publication and dependency completeness are not verified.']};
    if(args.expected_hash!==planHash)throw new Error('Field label preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Metadata or solution membership changed before the write.');
    const saved=await services[2].modelMetadataService.updateLabels({...updateArgs,dry_run:false,expected_hash:native.definitionHash,allow_unprotected_write:true},context.signal);
    const membership=await membershipAfterWrite(services[2],args.solution_unique_name,approved,'2:'+guid(state.definitions[2].definition.MetadataId),context.signal);
    return {dryRun:false,planHash,saved,membership,publication:'not_requested',dependencyClosureVerified:false,note:'The native write is not atomic with preflight. Inspect before retrying any unknown outcome.'};
  }
  if(name==='stage_isolated_field_settings'){
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name','baseline','baseline_hash','source_hash','target_hash','isolated_definition_hash','selections','current_members'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_unprotected_write'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated field settings request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_unprotected_write!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('A matching preview hash and unprotected-write acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('An explicit current membership is required.');
    const approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length)throw new Error('Duplicate approved member.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const readState=async()=>{const [definitions,matching,members]=await Promise.all([Promise.all(services.map(service=>service.modelMetadataService.get({logical_name:args.logical_name,attribute_name:args.attribute_name},context.signal))),inspectFormField(args.attribute_name,args.logical_name,(side,table,attribute)=>(side==='source'?services[1]:services[2]).modelMetadataService.get({logical_name:table,attribute_name:attribute},context.signal),context.signal),services[2].solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal)]);if(guid(definitions[1].definition.MetadataId)!==guid(definitions[2].definition.MetadataId)||typeof args.isolated_definition_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.isolated_definition_hash)||definitions[2].definitionHash!==args.isolated_definition_hash||hash(definitions[2].definition)!==args.isolated_definition_hash)throw new Error('Isolated field identity or reviewed definition differs.');if(!Array.isArray(args.selections))throw new Error('Selected settings are required.');for(const property of args.selections){if(typeof property!=='string'||!Object.hasOwn(definitions[1].definition,property)||!Object.hasOwn(definitions[2].definition,property)||hash(definitions[1].definition[property])!==hash(definitions[2].definition[property]))throw new Error('A selected target and isolated setting differs or is unavailable.');}if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {definitions,matching,members};};
    const state=await readState(),candidate=prepareFieldSettingsCandidate({baseline:args.baseline,source:state.definitions[0].definition,target:state.definitions[1].definition,baseline_hash:args.baseline_hash,source_hash:args.source_hash,target_hash:args.target_hash,selections:args.selections});
    const updateArgs={logical_name:args.logical_name,attribute_name:args.attribute_name,solution_unique_name:args.solution_unique_name,patch:candidate.patch};const native=await services[2].modelMaintenanceService.updateColumn({...updateArgs,dry_run:true},context.signal);
    const nativeReview=inspectFieldSettingsPreview(candidate,native);
    const planHash=hash({profiles,identities,definitions:state.definitions.map(x=>x.definitionHash),matching:state.matching,solution:state.members.solution,members:state.members.items,candidate:candidate.reviewHash,nativeReview,native});
    if(!execute)return {dryRun:true,planHash,identities,candidate,native,nativeReview,limitations:['Native metadata PUT has no atomic concurrency lock.','Native data restrictions apply and existing data is not scanned.','Publication and dependency completeness are not verified.']};
    if(args.expected_hash!==planHash)throw new Error('Field settings preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Metadata or solution membership changed before the write.');
    const saved=await services[2].modelMaintenanceService.updateColumn({...updateArgs,dry_run:false,expected_hash:native.planHash,allow_unprotected_write:true},context.signal);
    const membership=await membershipAfterWrite(services[2],args.solution_unique_name,approved,'2:'+guid(state.definitions[2].definition.MetadataId),context.signal);
    return {dryRun:false,planHash,saved,membership,publication:'not_requested',dependencyClosureVerified:false,note:'The native write is not atomic with preflight. Inspect before retrying any unknown outcome.'};
  }
  if (name === 'prepare_field_settings_candidate') return prepareFieldSettingsCandidate(args);
  if (name === 'prepare_field_label_candidate') return prepareFieldLabelCandidate(args);
  if(name==='add_isolated_release_field'||name==='add_isolated_release_choice'){
    const choice=name==='add_isolated_release_choice';
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','logical_name','attribute_name',choice?'isolated_choice_id':'isolated_field_id','isolated_definition_hash','current_members'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_dependencies','acknowledge_unprotected_write'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated field request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_dependencies!==true||args.acknowledge_unprotected_write!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('Matching preview hash and explicit acknowledgments are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(typeof args.logical_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(args.logical_name)||typeof args.attribute_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(args.attribute_name)||typeof args.isolated_definition_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.isolated_definition_hash)||!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('Valid field identity, isolated definition hash and current membership are required.');
    const approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length)throw new Error('Duplicate approved member.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const isolated=services[2],componentId=guid(choice?args.isolated_choice_id:args.isolated_field_id);
    const readState=async()=>{const [field,isolatedField,members]=await Promise.all([inspectFormField(args.attribute_name,args.logical_name,(side,table,attribute)=>(side==='source'?services[0]:isolated).modelMetadataService.get({logical_name:table,attribute_name:attribute},context.signal),context.signal),isolated.modelMetadataService.get({logical_name:args.logical_name,attribute_name:args.attribute_name},context.signal),isolated.solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal)]);if(field.source.status!=='available'||field.target.status!=='available')throw new Error('Source and isolated field evidence must be available.');let definition=isolatedField;if(choice){const c=field.target.globalChoice;if(!c||c.type!=='Picklist'||guid(c.id)!==componentId)throw new Error('Global choice identity does not match the isolated field.');definition=await isolated.modelChoiceService.getChoices({global_choice_name:c.name},context.signal);if(guid(definition.definition?.MetadataId)!==componentId)throw new Error('Isolated global choice identity does not match.');}else if(guid(isolatedField.definition?.MetadataId)!==componentId)throw new Error('Isolated field identity does not match.');if(definition.definitionHash!==args.isolated_definition_hash||hash(definition.definition)!==args.isolated_definition_hash)throw new Error('Isolated definition changed since review.');if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {field,definitionHash:definition.definitionHash,members};};
    const nativeArgs={solution_unique_name:args.solution_unique_name,component_id:componentId,component_type:choice?9:2,...(choice?{}:{logical_name:args.logical_name})};
    const state=await readState(),native=await isolated.solutionService.add({...nativeArgs,dry_run:true},context.signal);
    if(choice&&(guid(native.component?.objectId)!==componentId||native.component?.source?.Name!==state.field.target.globalChoice?.name))throw new Error('Native global choice identity does not match field evidence.');
    const planHash=hash({profiles,identities,field:state.field,definitionHash:state.definitionHash,solution:state.members.solution,members:state.members.items,native});
    if(!execute)return {dryRun:true,planHash,identities,field:state.field,isolatedDefinitionHash:state.definitionHash,native,limitations:['The isolated definition may intentionally differ from the source; review all differences and target compatibility.','Metadata must already exist in the isolated environment; this tool does not create or update it.','Native add is not atomic and dependencies are not automatically included.']};
    if(args.expected_hash!==planHash)throw new Error('Field preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Field or membership changed before adding.');
    const result=await isolated.solutionService.add({...nativeArgs,dry_run:false,expected_hash:native.planHash,allow_unprotected_write:true},context.signal);
    return {dryRun:false,planHash,result,dependencyClosureVerified:false,exportContentsVerified:false,note:'Inspect observed membership changes and the exported package; do not blindly retry unknown outcomes.'};
  }
  if(name==='add_isolated_release_webresource'){
    const required=['source_profile','target_profile','isolated_profile','solution_unique_name','resource_name','resource_id','content_hash','current_members'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_dependencies','acknowledge_unprotected_write'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated solution member request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_dependencies!==true||args.acknowledge_unprotected_write!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('Matching preview hash and explicit dependency and unprotected-write acknowledgments are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(typeof args.content_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.content_hash)||!Array.isArray(args.current_members)||args.current_members.length>241)throw new Error('Resource content hash and current membership are required.');
    const approved=args.current_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();if(new Set(approved).size!==approved.length)throw new Error('Duplicate approved member.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const service=services[2],resourceId=guid(args.resource_id);
    const readState=async()=>{const [resource,members]=await Promise.all([readFormLibrary(service.auth,args.resource_name,context.signal),service.solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal)]);if(resource.status!=='available'||guid(resource.id)!==resourceId||resource.type!==3||resource.contentHash!==args.content_hash)throw new Error('Isolated JavaScript identity or content does not match the reviewed candidate.');if(!members.paging?.complete)throw new Error('Complete visible membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Solution membership differs from the reviewed set.');return {resource,members};};
    const state=await readState(),native=await service.solutionService.add({solution_unique_name:args.solution_unique_name,component_id:resourceId,component_type:61,dry_run:true},context.signal);
    const planHash=hash({profiles,identities,resource:state.resource,solution:state.members.solution,members:state.members.items,native});
    if(!execute)return {dryRun:true,planHash,identities,resource:state.resource,native,limitations:['Review every dependency and target-side compatibility independently.','The native add is not protected by an atomic lock and may introduce platform parent shells.','Saved content is not necessarily published or present in the final export.']};
    if(args.expected_hash!==planHash)throw new Error('Member preview changed; review again.');const fresh=await readState();if(hash(fresh)!==hash(state))throw new Error('Resource or membership changed before adding.');
    const result=await service.solutionService.add({solution_unique_name:args.solution_unique_name,component_id:resourceId,component_type:61,dry_run:false,expected_hash:native.planHash,allow_unprotected_write:true},context.signal);
    return {dryRun:false,planHash,result,dependencyClosureVerified:false,exportContentsVerified:false,note:'Inspect observed membership changes and the actual exported package; do not blindly repeat an unknown outcome.'};
  }
  if(name==='stage_isolated_webresource_candidate'){
    const required=['source_profile','target_profile','isolated_profile','source_id','target_id','isolated_id','baseline','baseline_hash','source_hash','target_hash','hunks'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'dry_run','expected_hash','acknowledge_isolated_write'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated resource request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean')throw new Error('Invalid dry_run flag.');const execute=args.dry_run===false;
    if(execute&&(args.acknowledge_isolated_write!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('The reviewed plan hash and isolated-write acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(guid(args.target_id)!==guid(args.isolated_id))throw new Error('Target and isolated resource identities must match.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const [identities,resources]=await Promise.all([Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};})),Promise.all(services.map((service,i)=>service.webResourceService.getBackup({id:[args.source_id,args.target_id,args.isolated_id][i]},context.signal)))]);
    if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');const [source,target,isolated]=resources;
    if(source.name!==target.name||isolated.name!==target.name||source.resourceType!==target.resourceType||isolated.resourceType!==target.resourceType||target.resourceType!==3)throw new Error('All versions must be the same JavaScript web resource.');
    const text=(content:string)=>{const bytes=Buffer.from(content,'base64'),value=bytes.toString('utf8');if(!Buffer.from(value,'utf8').equals(bytes))throw new Error('Only valid UTF-8 web resources are supported.');return value;};
    const sourceText=text(source.data.content),targetText=text(target.data.content),isolatedText=text(isolated.data.content);
    if(isolatedText!==targetText)throw new Error('Isolated resource differs from target.');
    const candidate=prepareComponentCandidate({name:target.name,baseline:args.baseline,source:sourceText,target:targetText,baseline_hash:args.baseline_hash,source_hash:args.source_hash,target_hash:args.target_hash,hunks:args.hunks});
    const data={...isolated.data,content:Buffer.from(candidate.candidate,'utf8').toString('base64')};
    const preview=await services[2].webResourceService.restoreBackup({id:args.isolated_id,data,dry_run:true,expected_hash:isolated.definitionHash},context.signal);
    const planHash=hash({profiles,identities,ids:[source.id,target.id,isolated.id],definitions:resources.map(x=>x.definitionHash),candidate:candidate.reviewHash,preview});
    if(!execute)return {dryRun:true,planHash,candidateHash:candidate.candidateHash,selection:candidate.selection,preview,identities,limitations:['Selected ranges must be reviewed for requirement ownership and behavior.','No publication or solution membership is performed.']};
    if(args.expected_hash!==planHash)throw new Error('Resource preview changed; review again.');
    const fresh=await Promise.all(services.map((service,i)=>service.webResourceService.getBackup({id:[args.source_id,args.target_id,args.isolated_id][i]},context.signal)));
    if(fresh.some((x,i)=>x.definitionHash!==resources[i].definitionHash)||fresh[2].etag!==preview.etag)throw new Error('A reviewed resource changed before the isolated write.');
    const saved=await services[2].webResourceService.restoreBackup({id:args.isolated_id,data,dry_run:false,expected_hash:preview.definitionHash,if_match:preview.etag},context.signal);
    return {dryRun:false,planHash,candidateHash:candidate.candidateHash,saved,publication:'not_requested',solutionMembership:'not_checked',note:'A failed or unknown readback must be inspected before retrying. Add the resource to the dedicated solution separately after review.'};
  }
  if(name==='export_isolated_form_release'){
    const required=['source_profile','target_profile','isolated_profile','logical_name','isolated_form_id','solution_unique_name','candidate_hash','approved_members','resource_hashes','definition_evidence','dependency_review_hash','reviewed_external_dependencies','target_dependency_evidence','output_path'];
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>![...required,'managed','dry_run','expected_hash','acknowledge_export'].includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('An explicit isolated export request is required.');
    if(args.dry_run!==undefined&&typeof args.dry_run!=='boolean'||args.managed!==undefined&&typeof args.managed!=='boolean')throw new Error('Invalid export flags.');
    const execute=args.dry_run===false;if(execute&&(args.acknowledge_export!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('Export requires the reviewed plan hash and acknowledgment.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(typeof args.candidate_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.candidate_hash)||!Array.isArray(args.approved_members)||!args.approved_members.length||args.approved_members.length>100||typeof args.dependency_review_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.dependency_review_hash)||!Array.isArray(args.reviewed_external_dependencies)||args.reviewed_external_dependencies.length>5000||args.reviewed_external_dependencies.some((v:unknown)=>typeof v!=='string'||!/^\d+:[0-9a-f-]{36}$/.test(v)))throw new Error('Candidate hash, dependency review and approved membership are required.');
    const approved=args.approved_members.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id'].includes(k))||!Number.isSafeInteger(x.component_type)||x.component_type<1)throw new Error('Invalid approved member.');return x.component_type+':'+guid(x.component_id);}).sort();
    if(new Set(approved).size!==approved.length||!approved.includes('60:'+guid(args.isolated_form_id)))throw new Error('Approved members must contain the isolated form exactly once.');
    if(approved.some((key:string)=>![2,9,60,61].includes(Number(key.split(':')[0]))))throw new Error('This export workflow cannot audit one or more selected component types.');
    if(approved.some((key:string)=>key.startsWith('60:')&&key!=='60:'+guid(args.isolated_form_id)))throw new Error('Other forms need their own reviewed content and are outside this export workflow.');
    if(!Array.isArray(args.definition_evidence)||args.definition_evidence.length>241)throw new Error('Definition evidence must be an array.');
    const definitions=args.definition_evidence.map((x:any)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!['component_type','component_id','schema_name','logical_name','expected_hash'].includes(k))||![2,9].includes(x.component_type)||typeof x.schema_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(x.schema_name)||typeof x.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(x.expected_hash)||x.component_type===2&&(typeof x.logical_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(x.logical_name))||x.component_type===9&&x.logical_name!==undefined)throw new Error('Invalid field or choice definition evidence.');return {component_type:x.component_type,component_id:guid(x.component_id),schema_name:x.schema_name,...(x.logical_name?{logical_name:x.logical_name}:{}),expected_hash:x.expected_hash};});
    const definitionKeys=definitions.map((x:any)=>x.component_type+':'+x.component_id).sort();const expectedDefinitionKeys=approved.filter((x:string)=>x.startsWith('2:')||x.startsWith('9:'));if(new Set(definitionKeys).size!==definitionKeys.length||hash(definitionKeys)!==hash(expectedDefinitionKeys))throw new Error('Exactly one definition evidence entry is required for each selected field and choice.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 profiles may be active.');service=createServices(profile);servicePool.set(key,service);}return service;});
    const identities=await Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};}));
    if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Three distinct organizations are required.');
    const readDefinitionBindings=async()=>Promise.all(definitions.map(async(entry:any)=>{const record=entry.component_type===2?await services[2].modelMetadataService.get({logical_name:entry.logical_name,attribute_name:entry.schema_name},context.signal):await services[2].modelChoiceService.getChoices({global_choice_name:entry.schema_name},context.signal);if(!record.definition||guid(record.definition.MetadataId)!==entry.component_id||typeof record.definitionHash!=='string'||hash(record.definition)!==record.definitionHash)throw new Error('A selected field or choice name does not match its isolated component identity.');return {componentType:entry.component_type,componentId:entry.component_id,schemaName:entry.schema_name,logicalName:entry.logical_name??null,definitionHash:record.definitionHash};}));
    const readState=async()=>{const [form,members,published]=await Promise.all([services[2].modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id:args.isolated_form_id},context.signal),services[2].solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal),services[2].auth.requestWithResponse<Record<string,any>>(`/systemforms(${guid(args.isolated_form_id)})?$select=formid,type,formxml`,'GET',undefined,{signal:context.signal,headers:{'Cache-Control':'no-cache'}})]);if(formXmlHash(form.xml.formxml,'form')!==args.candidate_hash)throw new Error('Isolated saved form does not match the reviewed candidate.');if(published.status!==200||!published.data||guid(published.data.formid)!==guid(args.isolated_form_id)||published.data.type!==2||typeof published.data.formxml!=='string'||formXmlHash(published.data.formxml,'form')!==args.candidate_hash)throw new Error('Published isolated form is unavailable or does not match the reviewed candidate.');if(!members.paging?.complete)throw new Error('Complete visible solution membership is required.');const observed=members.items.map((x:any)=>{if(!x.objectid||!Number.isSafeInteger(x.componenttype))throw new Error('A membership identity is unavailable.');return x.componenttype+':'+guid(x.objectid);}).sort();if(new Set(observed).size!==observed.length||hash(observed)!==hash(approved))throw new Error('Visible solution membership differs from the approved set.');return {form,members,observed,publishedHash:formXmlHash(published.data.formxml,'form')};};
    const readGraph=()=>inspectDependencyGraph({components:args.approved_members,max_depth:5,max_nodes:100},(id,type)=>services[2].solutionService.getDependencies({component_id:id,component_type:type,direction:'required',top:500,max_pages:10},context.signal),context.signal);
    const graph=await readGraph();if(!graph.completeVisibleGraph||graph.reviewHash!==args.dependency_review_hash)throw new Error('Dependency graph is incomplete or changed; review again.');
    const external=[...new Set(graph.edges.filter(x=>x.classification==='not_selected').map(x=>x.required))].sort(),reviewed=[...new Set(args.reviewed_external_dependencies)].sort();if(reviewed.length!==args.reviewed_external_dependencies.length||hash(external)!==hash(reviewed))throw new Error('Every unselected dependency must be explicitly reviewed.');
    if(!Array.isArray(args.target_dependency_evidence)||args.target_dependency_evidence.length!==external.length||args.target_dependency_evidence.length>100)throw new Error('Target evidence is required for each external dependency.');
    const readTargetEvidence=async()=>{const found=new Map<string,Record<string,any>>();for(const entry of args.target_dependency_evidence){if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['dependency','inspection','expected_hash'].includes(k))||typeof entry.dependency!=='string'||!external.includes(entry.dependency)||found.has(entry.dependency)||typeof entry.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(entry.expected_hash)||!entry.inspection||typeof entry.inspection!=='object'||Array.isArray(entry.inspection))throw new Error('Invalid target dependency evidence.');
      if(['source_profile','target_profile','isolated_profile'].some(k=>Object.hasOwn(entry.inspection,k)))throw new Error('Dependency inspection cannot override release profiles.');
      const result=await handleToolCall('inspect_target_dependency',{...entry.inspection,source_profile:profiles[0],target_profile:profiles[1],isolated_profile:profiles[2]},context);const dependency=result.evidence.componentType+':'+result.evidence.isolatedId;
      if(dependency!==entry.dependency||result.evidenceHash!==entry.expected_hash||!['selected_properties_match','content_and_type_match','definition_hash_match','saved_xml_hash_match'].includes(result.evidence.comparison)||!result.evidence.targetId||hash(result.identities)!==hash(identities))throw new Error('A target dependency is unverified, changed or does not match.');found.set(dependency,{evidenceHash:result.evidenceHash,evidence:result.evidence,publication:result.publication,compatibility:result.compatibility,limitations:result.limitations});
    }return [...found.entries()].sort((a,b)=>a[0].localeCompare(b[0]));};
    const targetEvidence=await readTargetEvidence();
    const state=await readState();const definitionBindings=await readDefinitionBindings();const publishedResources=await inspectPublishedResources(services[2].auth,args.resource_hashes,approved,context.signal);const native=await services[2].solutionTransferService.export({solution_unique_name:args.solution_unique_name,managed:args.managed??false,output_path:args.output_path,dry_run:true},context.signal);
    const planHash=hash({profiles,identities,formHash:args.candidate_hash,formDefinition:state.form.definitionHash,members:state.members.items,solution:state.members.solution,approved,publishedResources,definitions,definitionBindings,dependencyReview:graph.reviewHash,reviewedExternal:reviewed,targetEvidence,native});
    if(!execute)return {dryRun:true,planHash,identities,approved,native,dependencyGraph:graph,targetEvidence,definitionBindings,publishedResources,publication:'form_definition_matched',limitations:['Selected field properties do not establish full dependency compatibility; inspect each evidence record.','The published form read is independent of the export and does not establish publication of other components.','Visible membership and platform root behavior do not prove archive contents or dependency closure.','Export is not atomic with membership reads; audit the actual package before use.']};
    if(args.expected_hash!==planHash)throw new Error('Export preview changed; review again.');const fresh=await readState();const freshBindings=await readDefinitionBindings();const freshResources=await inspectPublishedResources(services[2].auth,args.resource_hashes,approved,context.signal);const freshGraph=await readGraph();const freshEvidence=await readTargetEvidence();if(!freshGraph.completeVisibleGraph||freshGraph.reviewHash!==graph.reviewHash||hash(freshEvidence)!==hash(targetEvidence)||hash(fresh.members.items)!==hash(state.members.items)||hash(fresh.members.solution)!==hash(state.members.solution)||fresh.form.definitionHash!==state.form.definitionHash||hash(freshBindings)!==hash(definitionBindings)||hash(freshResources)!==hash(publishedResources))throw new Error('Isolated state or dependency graph changed before export.');
    const result=await services[2].solutionTransferService.export({solution_unique_name:args.solution_unique_name,managed:args.managed??false,output_path:args.output_path,dry_run:false,expected_hash:native.planHash},context.signal);
    const resources=new Map(publishedResources.map((r:any)=>[r.id,r.contentHash]));
    const components=approved.map((key:string)=>{const [type,id]=key.split(':');const component_type=Number(type);const evidence=definitions.find((x:any)=>x.component_type===component_type&&x.component_id===id);return {component_type,component_id:id,...(component_type===60?{expected_hash:args.candidate_hash}:component_type===61?{expected_hash:resources.get(id)}:evidence??{})};}).filter((x:any)=>[2,9,60,61].includes(x.component_type));
    try{const audit=await auditFormReleasePackage({file_path:args.output_path,components},context.signal);const exportedHash='package' in result&&result.package&&typeof result.package==='object'&&'sha256' in result.package&&typeof result.package.sha256==='string'?result.package.sha256:null;if(!exportedHash||audit.package.sha256!==exportedHash)return {dryRun:false,planHash,result,publication:'form_definition_matched_before_export',packageAudit:{status:'artifact_changed',releaseReady:false},limitations:['The audited file differs from the exported artifact; inspect the file before proceeding.']};return {dryRun:false,planHash,result,publication:'form_definition_matched_before_export',packageAudit:audit,releaseReady:false,limitations:['Review every audit issue and unrecognized or nested component; no import or publication was performed.']};}
    catch{return {dryRun:false,planHash,result,publication:'form_definition_matched_before_export',packageAudit:{status:'failed_or_cancelled',releaseReady:false},limitations:['Export succeeded but package audit was not completed. Inspect the existing file rather than blindly repeating export.']};}
  }
  if (name === 'audit_form_release_package') return auditFormReleasePackage(args,context.signal);
  if (name === 'review_release_dependencies') return reviewReleaseDependencies(args);
  if (name === 'preview_isolated_form_release' || name === 'apply_isolated_form_release') {
    const required=['source_profile','target_profile','isolated_profile','logical_name','source_form_id','target_form_id','isolated_form_id','solution_unique_name','source_hash','target_hash','candidate_hash','candidate_xml','approved_paths'];
    const execute=name==='apply_isolated_form_release';
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!required.includes(k)&&!(execute&&['expected_hash','acknowledge_isolated_write'].includes(k)))||required.some(k=>!Object.hasOwn(args,k)))throw new Error('Explicit profiles, form identities, hashes, candidate and approved paths are required.');
    if(execute&&(args.acknowledge_isolated_write!==true||typeof args.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_hash)))throw new Error('A matching preview hash and explicit isolated-write acknowledgment are required.');
    const profiles=[args.source_profile,args.target_profile,args.isolated_profile];
    if(profiles.some(p=>typeof p!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(p))||new Set(profiles.map(p=>p.toUpperCase())).size!==3)throw new Error('Three distinct named profiles are required.');
    if(typeof args.candidate_xml!=='string'||formXmlHash(args.candidate_xml,'form')!==args.candidate_hash)throw new Error('Candidate XML hash mismatch.');
    const services=profiles.map(profile=>{const key=profile.toUpperCase();let service=servicePool.get(key);if(!service){if(servicePool.size>=16)throw new Error('At most 16 environment profiles may be active per process');service=createServices(profile);servicePool.set(key,service);}return service;});
    const [identities,forms]=await Promise.all([
      Promise.all(services.map(async service=>{const r=await service.auth.requestWithResponse<Record<string,any>>('/WhoAmI','GET',undefined,{signal:context.signal});if(r.status!==200)throw new Error('Organization identity unavailable.');return {organization:guid(r.data?.OrganizationId),user:guid(r.data?.UserId)};})),
      Promise.all(services.map((service,i)=>service.modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id:[args.source_form_id,args.target_form_id,args.isolated_form_id][i]},context.signal)))
    ]);
    if(new Set(identities.map(x=>x.organization)).size!==3)throw new Error('Source, target and isolated profiles must resolve to three distinct organizations.');
    if(guid(args.target_form_id)!==guid(args.isolated_form_id))throw new Error('Target and isolated form identities must match.');
    const [source,target,isolated]=forms;
    if(formXmlHash(source.xml.formxml,'form')!==args.source_hash||formXmlHash(target.xml.formxml,'form')!==args.target_hash||formXmlHash(isolated.xml.formxml,'form')!==args.target_hash)throw new Error('Source, target or isolated form changed or does not match the reviewed baseline.');
    const scope=inspectFormCandidateScope({candidate:{...target,xml:{formxml:args.candidate_xml}},target,candidate_hash:args.candidate_hash,target_hash:args.target_hash,approved_paths:args.approved_paths});
    if(scope.scopeStatus!=='selected_paths_only'||!scope.changes.length)throw new Error('Candidate changes do not match the approved scope.');
    const sourceEvidence=inspectCandidateSourceEvidence({...target,xml:{formxml:args.candidate_xml}},source,target);
    if(sourceEvidence.status!=='selected_values_observed')throw new Error('Some selected candidate changes cannot be traced to the observed source: '+JSON.stringify(sourceEvidence.issues.slice(0,10)));
    const members=await services[2].solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal);
    if(!members.paging?.complete||members.items.length!==0)throw new Error('The isolated solution must have a complete empty visible membership.');
    const save=await services[2].modelUiService.restoreBackup({kind:'form',id:args.isolated_form_id,logical_name:args.logical_name,solution_unique_name:args.solution_unique_name,xml:{formxml:args.candidate_xml},dry_run:true,expected_hash:isolated.definitionHash},context.signal);
    // Bind every reviewed form version and its table to the preview. In particular,
    // a changed source must not be accepted by merely supplying its new hash at apply time.
    const planHash=hash({profiles,identities,logicalName:args.logical_name,formIds:[args.source_form_id,args.target_form_id,args.isolated_form_id],sourceHash:args.source_hash,targetHash:args.target_hash,candidateHash:args.candidate_hash,isolatedDefinitionHash:isolated.definitionHash,solution:members.solution,scope:scope.reportHash,sourceEvidence:sourceEvidence.reportHash,save});
    const limitations=['Organization identity and visible empty membership do not prove isolation or exclude invisible components.','Candidate provenance, selected scope, dependencies and platform solution layering require independent review.','No export, publication or deployment is performed.'];
    if(!execute)return {dryRun:true,planHash,identities,scope,sourceEvidence,save,solution:members.solution,limitations};
    if(args.expected_hash!==planHash)throw new Error('The isolated release preview changed; review it again.');
    const current=await Promise.all(services.map((service,i)=>service.modelUiService.getComponent({kind:'form',logical_name:args.logical_name,id:[args.source_form_id,args.target_form_id,args.isolated_form_id][i]},context.signal)));
    if(formXmlHash(current[0].xml.formxml,'form')!==args.source_hash||formXmlHash(current[1].xml.formxml,'form')!==args.target_hash||current[2].definitionHash!==isolated.definitionHash||current[2].etag!==save.etag)throw new Error('A reviewed form changed before the isolated write.');
    const lastMembers=await services[2].solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal);
    if(!lastMembers.paging?.complete||lastMembers.items.length!==0||hash(lastMembers.solution)!==hash(members.solution))throw new Error('Isolated solution changed before the write.');
    const saved=await services[2].modelUiService.restoreBackup({kind:'form',id:args.isolated_form_id,logical_name:args.logical_name,solution_unique_name:args.solution_unique_name,xml:{formxml:args.candidate_xml},dry_run:false,expected_hash:save.definitionHash,if_match:save.etag},context.signal);
    let membership:Record<string,any>;try{const after=await services[2].solutionService.listComponents({solution_unique_name:args.solution_unique_name,top:500,max_pages:20},context.signal);membership={status:after.paging?.complete?'observed':'incomplete',items:after.items,paging:after.paging};}catch{membership={status:'unknown'};}
    return {dryRun:false,planHash,identities,scope,sourceEvidence,saved,membership,limitations:[...limitations,'The save affects the whole isolated form and is not atomic with membership readback. Inspect before retrying any unknown outcome.']};
  }
  if (name === 'inspect_form_candidate_scope') return inspectFormCandidateScope(args);
  if (name === 'inspect_form_row') return inspectFormRow(args);
  if (name === 'prepare_form_row_candidate') return prepareFormRowCandidate(args);
  if (name === 'inspect_form_node') return inspectFormNode(args);
  if (name === 'prepare_form_node_candidate') return prepareFormNodeCandidate(args);
  if (name === 'prepare_component_candidate') return prepareComponentCandidate(args);
  if (name === 'prepare_form_candidate') return prepareFormCandidate(args);
  if (name === 'capture_form_baseline') return captureFormBaseline(args);
  if (name === 'verify_form_baseline') return verifyFormBaseline(args);
  if (name === 'review_component_three_way') return reviewComponentThreeWay(args);
  if (name === 'review_form_three_way') return reviewFormThreeWay(args);
  if (name === 'review_form_release_scope') return reviewFormReleaseScope(args);
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
