/**
 * Utility functions to optimize MCP tool responses for LLM consumption.
 * Focus: reducing response size and improving signal-to-noise ratio.
 */

/**
 * Keys to retain in field metadata when truncating.
 * These are the business-relevant properties for an attribute.
 */
const FIELD_META_RETAIN_KEYS = new Set([
  'LogicalName',
  'SchemaName',
  'DisplayName',
  'AttributeType',
  'AttributeTypeName',
  'RequiredLevel',
  'IsCustomAttribute',
  'IsValidForCreate',
  'IsValidForUpdate',
  'IsValidForRead',
  'MaxLength',
  'MinValue',
  'MaxValue',
  'Precision',
  'Format',
  'FormatName',
  'IsPrimaryName',
  'IsPrimaryId',
  'Targets',
  'OptionSet',
  'GlobalOptionSet',
  'DefaultValue',
  'Description',
]);

/**
 * Build a pagination summary object to attach to list responses.
 * Helps LLMs understand the response size and how to get more data.
 */
export function buildPaginatedSummary(
  data: any,
  requestedTop: number,
  toolName: string = 'd365_get_next_page'
): any {
  const items: any[] = data?.value ?? [];
  const nextLink: string | undefined = data?.['@odata.nextLink'];
  const hasMore = Boolean(nextLink);

  const summary: Record<string, any> = {
    returned: items.length,
    has_more: hasMore,
  };

  if (hasMore && nextLink) {
    summary.next_link = nextLink;
    summary.hint = `Results are truncated (top=${requestedTop}). Use '${toolName}' with the next_link value to fetch the next page.`;
  } else {
    summary.hint = `All results returned (${items.length} records).`;
  }

  return {
    _summary: summary,
    value: items,
  };
}

/**
 * Trim an OData field metadata response to only business-relevant keys.
 * Removes @odata.* system annotations and other low-value technical keys.
 */
export function truncateFieldMeta(metadata: any): Record<string, any> {
  if (!metadata || typeof metadata !== 'object') return metadata;

  const result: Record<string, any> = {};

  for (const key of Object.keys(metadata)) {
    // Skip @odata system annotations
    if (key.startsWith('@')) continue;
    // Skip keys not in the retain list
    if (!FIELD_META_RETAIN_KEYS.has(key)) continue;

    const value = metadata[key];

    // Simplify DisplayName and Description objects to just the label string
    if ((key === 'DisplayName' || key === 'Description') && value?.UserLocalizedLabel?.Label) {
      result[key] = value.UserLocalizedLabel.Label;
    } else if (key === 'RequiredLevel' && value?.Value) {
      result[key] = value.Value;
    } else if (key === 'AttributeTypeName' && value?.Value) {
      result[key] = value.Value;
    } else if (key === 'OptionSet' && value?.Options) {
      // Simplify option set to just value/label pairs
      result[key] = {
        IsGlobal: false,
        Options: value.Options.map((o: any) => ({
          Value: o.Value,
          Label: o.Label?.UserLocalizedLabel?.Label || o.Label?.LocalizedLabels?.[0]?.Label || '',
        })),
      };
    } else if (key === 'GlobalOptionSet' && value?.Options) {
      result[key] = {
        IsGlobal: true,
        Name: value.Name,
        Options: value.Options.map((o: any) => ({
          Value: o.Value,
          Label: o.Label?.UserLocalizedLabel?.Label || o.Label?.LocalizedLabels?.[0]?.Label || '',
        })),
      };
    } else {
      result[key] = value;
    }
  }

  return result;
}
