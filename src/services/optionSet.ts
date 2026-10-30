import type { CrmDataClient } from '../types/crmRequest.js';
import { CacheService } from './cache.js';
import { identifier } from './queryState.js';
import { OptionSetDefinition, OptionSetValue } from '../types/index.js';

export class OptionSetService {
  private auth: CrmDataClient;
  private cache: CacheService;

  constructor(auth: CrmDataClient, cache: CacheService) {
    this.auth = auth;
    this.cache = cache;
  }

  /**
   * Get the list of OptionSet (enum value) mappings for a specific entity field.
   * Supports both Local OptionSets and Global OptionSets.
   */
  async getFieldOptionSetValues(
    entityLogicalName: string,
    attributeName: string
  ): Promise<OptionSetDefinition> {
    identifier(entityLogicalName,'logical_name');
    identifier(attributeName,'attribute_name');
    const cacheKey = `field_optionset_${entityLogicalName}_${attributeName}`;
    const cached = this.cache.get<OptionSetDefinition>(cacheKey);
    if (cached) {
      return cached;
    }

    const baseAttr = await this.auth.makeRequest(
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeName}')?$select=AttributeType`
    );

    if (!baseAttr || !baseAttr.AttributeType) {
      throw new Error(`Attribute '${attributeName}' not found in entity '${entityLogicalName}'`);
    }

    let castType = '';
    const attrType = baseAttr.AttributeType;
    if (attrType === 'Picklist') castType = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
    else if (attrType === 'State') castType = 'Microsoft.Dynamics.CRM.StateAttributeMetadata';
    else if (attrType === 'Status') castType = 'Microsoft.Dynamics.CRM.StatusAttributeMetadata';
    else if (attrType === 'Boolean') castType = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
    else {
      throw new Error(`Attribute '${attributeName}' is not an OptionSet type`);
    }

    // Now query with cast to expand options on the attributes collection and filter
    const collectionData = await this.auth.makeRequest(
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes/${castType}?$filter=LogicalName eq '${attributeName}'&$select=LogicalName,DisplayName&$expand=OptionSet,GlobalOptionSet`
    );

    const metadata = collectionData.value && collectionData.value.length > 0 ? collectionData.value[0] : null;

    if (!metadata) {
       throw new Error(`Attribute '${attributeName}' could not be cast to metadata type ${castType}`);
    }

    const booleanOptions = metadata.OptionSet ?? metadata.GlobalOptionSet;
    const optionsData = attrType === 'Boolean'
      ? [booleanOptions?.FalseOption,booleanOptions?.TrueOption].filter(Boolean)
      : metadata.OptionSet?.Options || metadata.GlobalOptionSet?.Options || [];
    const options = this.mapOptions(optionsData);

    const definition: OptionSetDefinition = {
      logicalName: metadata.LogicalName,
      displayName: metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.DisplayName?.Label,
      options,
    };

    this.cache.set(cacheKey, definition);
    return definition;
  }

  private mapOptions(options: any[]): OptionSetValue[] {
    return options
      .map((opt) => ({
        value: opt.Value,
        label: opt.Label?.UserLocalizedLabel?.Label || opt.Label?.Label || '',
      }))
      .sort((a, b) => a.value - b.value);
  }
}
