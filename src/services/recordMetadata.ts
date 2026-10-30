import type { CrmRequestClient } from '../types/crmRequest.js';
import type { Row } from '../types/recordMutation.js';
import { GUID, identifier, invalid, RecordMutationError } from './recordMutationInput.js';

export const literal = (value:string) => "'" + value.replace(/'/g,"''") + "'";
export const query = (values:Record<string,string>) => new URLSearchParams(values).toString();
export function metadataError(): never {
  throw new RecordMutationError('D365_RECORD_METADATA_INVALID','Required native record metadata was incomplete or ambiguous.');
}
export class RecordMetadata {
  private readonly tables = new Map<string,Promise<Row>>();
  constructor(private readonly client:CrmRequestClient, private readonly signal?:AbortSignal) {}

  async rows(endpoint:string, max = 1000):Promise<Row[]> {
    const rows:Row[] = [], seen = new Set<string>();
    let next:string | undefined = endpoint;
    while (next) {
      const key = this.client.validateEndpoint?.(next) ?? next;
      if (seen.has(key) || seen.size >= 10) metadataError();
      seen.add(key);
      const page:Row | null = await this.client.makeRequest(next,'GET',undefined,{signal:this.signal});
      if (!page || !Array.isArray(page.value) || page.value.some((row:unknown) => !row || typeof row !== 'object' || Array.isArray(row))) metadataError();
      rows.push(...page.value);
      if (rows.length > max) metadataError();
      next = page['@odata.nextLink'];
      if (next !== undefined && (typeof next !== 'string' || !next)) metadataError();
    }
    return rows;
  }
  table(collection:string):Promise<Row> {
    if (!this.tables.has(collection)) this.tables.set(collection,this.readTable(collection));
    return this.tables.get(collection)!;
  }
  private async readTable(collection:string):Promise<Row> {
    identifier(collection,'collection_name');
    const rows = await this.rows('/EntityDefinitions?' + query({
      // No new-version-only property in $select: legacy CE metadata can omit TableType.
      '$filter':'EntitySetName eq ' + literal(collection),
    }),2);
    if (rows.length !== 1 || rows[0].EntitySetName !== collection) metadataError();
    for (const field of ['LogicalName','EntitySetName','PrimaryIdAttribute']) identifier(rows[0][field],'metadata ' + field);
    return rows[0];
  }
  async alternate(table:Row, values:Row):Promise<{selector:string; keyFields:string[]}> {
    const root = '/EntityDefinitions(LogicalName=' + literal(table.LogicalName) + ')';
    const keys = await this.rows(root + '/Keys?$select=SchemaName,KeyAttributes,EntityKeyIndexStatus');
    const matching = keys.filter(key => Array.isArray(key.KeyAttributes) && key.KeyAttributes.length === Object.keys(values).length &&
      key.KeyAttributes.every((name:unknown) => typeof name === 'string' && (Object.hasOwn(values,name) || Object.hasOwn(values,'_' + name + '_value'))));
    const active = matching.filter(key => key.EntityKeyIndexStatus === 2 || key.EntityKeyIndexStatus === 'Active');
    if (!active.length) invalid('alternate_key must exactly match a declared active native alternate key.');
    const parts:string[] = [], keyFields:string[] = [];
    for (const name of [...active[0].KeyAttributes].sort()) {
      identifier(name,'metadata key column');
      const attr = await this.client.makeRequest(root + '/Attributes(LogicalName=' + literal(name) + ')?$select=LogicalName,AttributeType',
        'GET',undefined,{signal:this.signal});
      if (!attr || attr.LogicalName !== name || typeof attr.AttributeType !== 'string') metadataError();
      const property = attr.AttributeType === 'Lookup' ? '_' + name + '_value' : name;
      const supplied = Object.hasOwn(values,name) ? values[name] : values[property];
      let value:string;
      if (attr.AttributeType === 'String') {
        if (typeof supplied !== 'string' || !supplied || /[\/<>*%&:\\?+#\u0000-\u001f\u007f]/.test(supplied)) invalid('String alternate keys must be non-empty and cannot contain reserved path characters.');
        value = literal(supplied);
      } else if (['Integer','Picklist'].includes(attr.AttributeType)) {
        if (typeof supplied !== 'number' || !Number.isSafeInteger(supplied) || supplied < -2147483648 || supplied > 2147483647) invalid('Integer/choice alternate keys require a 32-bit integer.');
        value = String(supplied);
      } else if (attr.AttributeType === 'Decimal') {
        if (typeof supplied === 'number' && Math.abs(supplied) > Number.MAX_SAFE_INTEGER) invalid('Large decimal alternate keys must be supplied as exact decimal strings.');
        const decimal = String(supplied);
        if (!/^-?\d+(?:\.\d+)?$/.test(decimal)) invalid('Decimal alternate keys require a decimal string or a non-exponential finite number.');
        value = decimal;
      } else if (attr.AttributeType === 'Lookup') {
        if (typeof supplied !== 'string' || !GUID.test(supplied)) invalid('Lookup alternate keys require a GUID.');
        value = supplied.toLowerCase();
      } else if (attr.AttributeType === 'DateTime') {
        if (typeof supplied !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(supplied) || !Number.isFinite(Date.parse(supplied))) invalid('DateTime alternate keys require an ISO UTC timestamp.');
        value = new Date(supplied).toISOString();
        const normalized = supplied.replace(/(?:\.(\d{1,3}))?Z$/,(_match:string,fraction:string | undefined) => '.' + (fraction ?? '').padEnd(3,'0') + 'Z');
        if (value !== normalized) invalid('DateTime alternate key contains an invalid calendar date.');
      } else invalid('This alternate key attribute type is not supported by this tool.');
      parts.push(property + '=' + encodeURIComponent(value).replace(/'/g,"'"));
      keyFields.push(name,property);
    }
    return {selector:parts.join(','), keyFields:[...new Set(keyFields)]};
  }
  async navigation(table:Row, target:Row, name:string):Promise<{single:boolean; attribute?:string}> {
    const root = '/EntityDefinitions(LogicalName=' + literal(table.LogicalName) + ')';
    const candidates:{single:boolean; attribute?:string; target:string}[] = [];
    const manyToOne = await this.rows(root + '/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencingAttribute,ReferencedEntity');
    for (const row of manyToOne) if (row.ReferencingEntityNavigationPropertyName === name) {
      candidates.push({single:true,attribute:identifier(row.ReferencingAttribute,'metadata lookup attribute'),target:row.ReferencedEntity});
    }
    const oneToMany = await this.rows(root + '/OneToManyRelationships?$select=ReferencedEntityNavigationPropertyName,ReferencingEntity');
    for (const row of oneToMany) if (row.ReferencedEntityNavigationPropertyName === name) candidates.push({single:false,target:row.ReferencingEntity});
    const manyToMany = await this.rows(root + '/ManyToManyRelationships?$select=Entity1LogicalName,Entity2LogicalName,Entity1NavigationPropertyName,Entity2NavigationPropertyName');
    for (const row of manyToMany) {
      if (row.Entity1LogicalName === table.LogicalName && row.Entity1NavigationPropertyName === name) candidates.push({single:false,target:row.Entity2LogicalName});
      if (row.Entity2LogicalName === table.LogicalName && row.Entity2NavigationPropertyName === name) candidates.push({single:false,target:row.Entity1LogicalName});
    }
    const matches = candidates.filter(row => row.target === target.LogicalName);
    if (matches.length !== 1) invalid('navigation_property must resolve uniquely to a relationship with the related collection.');
    return matches[0];
  }
}
