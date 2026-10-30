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
import { argumentsObject } from './services/recordMutationInput.js';
import { DiagnosticService } from './services/diagnostics.js';
import { SecurityEvidenceService } from './services/securityEvidence.js';
import { AuditEvidenceService } from './services/auditEvidence.js';
import { evidenceTools } from './tools/evidenceTools.js';
import { ModelMetadataService } from './services/modelMetadata.js';
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
import { readConfig, validateConfig } from './config.js';
import type { QueryOptions } from './types/query.js';
import { clearQueryContinuations } from './services/queryPaging.js';

// stdout is reserved for MCP JSON-RPC, including when dotenv debug is enabled outside.
dotenv.config({ quiet: true, debug: false });

export function checkConfig() {
  validateConfig(readConfig());
}

function createServices() {
  const config = readConfig();
  validateConfig(config);
  const cache = CacheService.getInstance(config.cacheTtl);
  const auth = new D365AuthService(config);
  const recordMutationService = new RecordMutationService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
    authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'});
  const pluginStepService = new PluginStepService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
    authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'});
  const diagnosticService = new DiagnosticService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
    authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'},pluginStepService);
  return {
    auth,
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
    apiOperationService:new ApiOperationService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    entitySchemaService: new EntitySchemaService(auth, cache),
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
    modelUiService:new ModelUiService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    securityEvidenceService:new SecurityEvidenceService(auth),
    auditEvidenceService:new AuditEvidenceService(auth,diagnosticService),
    environmentService: new EnvironmentService(auth, config),
    webResourceService: new WebResourceService(auth, {orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online', apiVersion:config.apiVersion || 'v9.2'}),
    pluginStepService,
    pluginAssemblyService:new PluginAssemblyService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
    pluginImageService:new PluginImageService(auth,{orgUrl:config.orgUrl || config.environmentUrl,
      authType:config.authType || 'online',apiVersion:config.apiVersion || 'v9.2'}),
  };
}

let services: ReturnType<typeof createServices> | undefined;

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

export const tools = [
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

export async function handleToolCall(name: string, args: any = {}, context:MutationContext = {}) {
  if (!tools.some(tool => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
  if (name === 'd365_plugin_assembly_inspect') return inspectPluginAssembly(args,context.signal);
  if (name === 'inspect_solution_package') return inspectSolutionPackage(args,context.signal);
  if (name === 'compare_solution_snapshots') return compareSolutionSnapshots(args,context.signal);
  if (name === 'inspect_ribbon_solution') return inspectRibbonSolution(args,context.signal);
  if (name === 'edit_ribbon_solution') return editRibbonSolution(args,context.signal);
  if (name === 'clear_server_cache') {
    CacheService.flushExisting();
    if (services) clearQueryContinuations(services.auth);
    return { success: true, message: 'Server cache cleared' };
  }
  services ??= createServices();
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
    case 'create_web_resource_and_publish': return await webResourceService.create(args);
    case 'update_web_resource_and_publish': return await webResourceService.update(args);
    case 'publish_web_resource': return await webResourceService.publish(args);
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
