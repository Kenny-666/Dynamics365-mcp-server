import type { CrmDataClient } from '../types/crmRequest.js';
import { CacheService } from './cache.js';
import { identifier } from './queryState.js';
import { EntitySchema, EntityAttribute } from '../types/index.js';

const SYSTEM_FIELDS_TO_EXCLUDE = [
  'createdon',
  'createdby',
  'modifiedon',
  'modifiedby',
  'createdonbehalfby',
  'modifiedonbehalfby',
  'importsequencenumber',
  'overriddencreatedon',
  'ownerid',
  'owningbusinessunit',
  'owningteam',
  'owninguser',
  'statecode',
  'statuscode',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'versionnumber',
  'transactioncurrencyid',
  'exchangerate',
  'stageid',
  'processid',
];

export class EntitySchemaService {
  private auth: CrmDataClient;
  private cache: CacheService;

  constructor(auth: CrmDataClient, cache: CacheService) {
    this.auth = auth;
    this.cache = cache;
  }

  /**
   * Get metadata summary for an entity, including primary key, name field, and a filtered list of business attributes.
   * System-level fields are excluded by default to reduce noise.
   */
  async getEntityMetadataSummary(logicalName: string): Promise<EntitySchema> {
    identifier(logicalName,'logical_name');
    const cacheKey = `entity_metadata_summary_${logicalName}`;
    const cached = this.cache.get<EntitySchema>(cacheKey);
    if (cached) {
      return cached;
    }

    const metadata = await this.auth.makeRequest(
      `/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,SchemaName,PrimaryIdAttribute,PrimaryNameAttribute`
    );

    if (!metadata || !metadata.PrimaryIdAttribute) {
      throw new Error(`Entity not found: '${logicalName}'`);
    }

    const attributesData = await this.auth.makeRequest(
      `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,SchemaName,AttributeType,DisplayName,RequiredLevel,IsCustomAttribute`
    );

    const attributes = this.filterAndMapAttributes(attributesData.value || []);

    const schema: EntitySchema = {
      logicalName: metadata.LogicalName,
      schemaName: metadata.SchemaName,
      primaryKey: metadata.PrimaryIdAttribute,
      attributes,
    };

    this.cache.set(cacheKey, schema);
    return schema;
  }

  private filterAndMapAttributes(attributes: any[]): EntityAttribute[] {
    return attributes
      .filter((attr) => !SYSTEM_FIELDS_TO_EXCLUDE.includes(attr.LogicalName))
      .map((attr) => ({
        logicalName: attr.LogicalName,
        schemaName: attr.SchemaName,
        attributeType: attr.AttributeType,
        displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.DisplayName?.Label,
        requiredLevel: attr.RequiredLevel,
        isCustom: attr.IsCustomAttribute || false,
      }))
      .sort((a, b) => {
        if (a.isCustom && !b.isCustom) return -1;
        if (!a.isCustom && b.isCustom) return 1;
        return a.logicalName.localeCompare(b.logicalName);
      });
  }

  /**
   * Get detailed metadata for a specific attribute of an entity.
   */
  async getDetailedFieldMetadata(entityLogicalName: string, attributeLogicalName: string): Promise<any> {
    identifier(entityLogicalName,'entity_logical_name');
    identifier(attributeLogicalName,'attribute_logical_name');
    const cacheKey = `detailed_field_metadata_${entityLogicalName}_${attributeLogicalName}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const result = await this.auth.makeRequest(
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')`
    );
    this.cache.set(cacheKey, result);
    return result;
  }
}
