import type { CrmDataClient } from '../types/crmRequest.js';
import { identifier } from './queryState.js';
import { uiXml } from './modelUiXml.js';
import { children } from './queryXml.js';

type Row = Record<string, any>;
function rows(result: Row | null, source: string): Row[] {
  if (!result || !Array.isArray(result.value) || result['@odata.nextLink'])
    throw new Error(`${source} metadata is incomplete or paginated; no conclusion can be made`);
  return result.value;
}
function labels(value: Row | undefined): string[] {
  return [value?.UserLocalizedLabel, ...(value?.LocalizedLabels ?? [])]
    .map((x: Row | undefined) => x?.Label).filter((x: unknown): x is string => typeof x === 'string');
}
function key(value: string | null | undefined): string { return (value ?? '').trim().toLocaleLowerCase(); }

export class ConfigInspectionService {
  constructor(private readonly crm: CrmDataClient) {}

  async resolve(input: {name?: unknown; entity_logical_name?: unknown}, signal?: AbortSignal) {
    if (typeof input?.name !== 'string' || !input.name.trim() || input.name.length > 200)
      throw new Error('name must be a non-empty string of at most 200 characters');
    const entity = input.entity_logical_name;
    if (entity !== undefined && typeof entity !== 'string') throw new Error('entity_logical_name must be a string');
    if (entity !== undefined) identifier(entity, 'entity_logical_name');
    const endpoint = entity === undefined
      ? '/EntityDefinitions?$select=LogicalName,SchemaName,EntitySetName,DisplayName'
      : `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,SchemaName,DisplayName`;
    const list = rows(await this.crm.makeRequest(endpoint,'GET',undefined,{signal}), 'Name resolution');
    const requested = key(input.name);
    const exact = list.filter(x => [x.LogicalName,x.SchemaName,x.EntitySetName].some(v => typeof v === 'string' && key(v) === requested));
    const matches = exact.length ? exact : list.filter(x => labels(x.DisplayName).some(label => key(label) === requested));
    return {kind: entity === undefined ? 'entity' : 'attribute', match: exact.length ? 'identifier' : 'display_name',
      status: matches.length === 0 ? 'not_found' : matches.length === 1 ? 'resolved' : 'ambiguous',
      candidates: matches.map(x => ({logical_name:x.LogicalName,schema_name:x.SchemaName,
        ...(x.EntitySetName ? {entity_set_name:x.EntitySetName} : {}),display_names:[...new Set(labels(x.DisplayName))]}))};
  }

  async check(input: {entity_logical_name?: unknown}, signal?: AbortSignal) {
    if (typeof input?.entity_logical_name !== 'string') throw new Error('entity_logical_name must be a string');
    const entity = identifier(input.entity_logical_name, 'entity_logical_name');
    const [metadata, forms, views, attributes] = await Promise.all([
      this.crm.makeRequest(`/EntityDefinitions(LogicalName='${entity}')?$select=LogicalName,IsCustomizable`, 'GET', undefined, {signal}),
      this.crm.makeRequest(`/systemforms?$select=formid,name,type,formxml&$filter=objecttypecode eq '${entity}' and type eq 2`, 'GET', undefined, {signal}),
      this.crm.makeRequest(`/savedqueries?$select=savedqueryid,name,querytype,fetchxml,layoutxml&$filter=returnedtypecode eq '${entity}' and statecode eq 0`, 'GET', undefined, {signal}),
      this.crm.makeRequest(`/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,RequiredLevel,IsValidForCreate`, 'GET', undefined, {signal}),
    ]);
    if (!metadata || metadata.LogicalName?.toLowerCase() !== entity.toLowerCase()) throw new Error('Entity metadata was not returned');
    const mainForms = rows(forms,'Forms'), publicViews = rows(views,'Views'), columns = rows(attributes,'Attributes');
    if (columns.some(x => typeof x.LogicalName !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(x.LogicalName))) throw new Error('Attribute metadata is incomplete');
    const columnNames = new Set(columns.map(x => key(x.LogicalName)));
    const required = columns.filter(x => x.RequiredLevel?.Value === 'ApplicationRequired' && x.IsValidForCreate === true).map(x => key(x.LogicalName));
    const findings = [];
    if (!mainForms.length) findings.push({code:'NO_MAIN_FORM',severity:'warning',message:'No main form was returned for this entity.'});
    if (!publicViews.length) findings.push({code:'NO_ACTIVE_PUBLIC_VIEW',severity:'warning',message:'No active public view was returned for this entity.'});
    for (const form of mainForms) {
      let document;
      try { document = uiXml(form.formxml,'form'); } catch { findings.push({code:'FORM_XML_INVALID',severity:'warning',message:`Form ${form.name ?? form.formid ?? '(unknown)'} XML was missing or invalid.`}); continue; }
      const controls = Array.from(document.getElementsByTagName('control'));
      const fields = new Set(controls.map(x => x.getAttribute('datafieldname')).filter(Boolean).map(key));
      for (const field of fields) if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field) && !columnNames.has(field))
        findings.push({code:'FORM_FIELD_NOT_FOUND',severity:'warning',message:`Form ${form.name ?? form.formid ?? '(unknown)'} refers to unreturned field ${field}.`});
      for (const field of required) if (!fields.has(field))
        findings.push({code:'REQUIRED_FIELD_NOT_ON_FORM',severity:'warning',message:`Form ${form.name ?? form.formid ?? '(unknown)'} does not contain required create field ${field}.`});
    }
    for (const view of publicViews) {
      let fetch, layout;
      try {fetch = uiXml(view.fetchxml,'fetch'); layout = uiXml(view.layoutxml,'grid');}
      catch {findings.push({code:'VIEW_XML_INVALID',severity:'warning',message:`View ${view.name ?? view.savedqueryid ?? '(unknown)'} XML was missing or invalid.`});continue;}
      const rootEntities = children(fetch.documentElement!,'entity');
      if (rootEntities.length !== 1 || key(rootEntities[0].getAttribute('name')) !== key(entity)) {
        findings.push({code:'VIEW_ROOT_ENTITY_MISMATCH',severity:'warning',message:`View ${view.name ?? view.savedqueryid ?? '(unknown)'} does not have one matching root entity.`});continue;
      }
      const fields = new Set(children(rootEntities[0],'attribute').map(x => key(x.getAttribute('name'))).filter(Boolean));
      for (const field of fields) if (!columnNames.has(field)) findings.push({code:'VIEW_FIELD_NOT_FOUND',severity:'warning',message:`View ${view.name ?? view.savedqueryid ?? '(unknown)'} fetch references unreturned field ${field}.`});
      const allAttributes = children(rootEntities[0],'all-attributes').length > 0;
      for (const cell of Array.from(layout.getElementsByTagName('cell'))) {
        const field=key(cell.getAttribute('name'));
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field) && columnNames.has(field) && !fields.has(field) && !allAttributes)
          findings.push({code:'VIEW_LAYOUT_FIELD_NOT_SELECTED',severity:'warning',message:`View ${view.name ?? view.savedqueryid ?? '(unknown)'} layout field ${field} is not selected on the root entity.`});
      }
    }
    return {entity_logical_name:entity,findings,counts:{main_forms:mainForms.length,active_public_views:publicViews.length},
      limitations:['Results reflect the current CRM identity and returned components; zero results are not proof of misconfiguration.','Required fields may be set by defaults, scripts or business rules; related-entity and aliased view fields are not fully checked.']};
  }
}
