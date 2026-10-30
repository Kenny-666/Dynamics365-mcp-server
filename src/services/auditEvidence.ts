import type { CrmRequestClient } from '../types/crmRequest.js';
import { DiagnosticService } from './diagnostics.js';
import { bool,bounded,EvidenceReader,guid,identifier,input,integer,invalid,malformed,pick,protect,query,record,rowGuid,type Row } from './readEvidence.js';

const auditColumns = ['auditid','createdon','operation','action','objecttypecode','_objectid_value','_userid_value','_callinguserid_value','transactionid'];
export class AuditEvidenceService {
  constructor(private readonly client:CrmRequestClient,private readonly diagnostics:DiagnosticService) {}

  history(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = input(raw,['collection_name','record_id','page_size','page_number','paging_cookie','include_values','max_text_chars']);
    const collection = identifier(args.collection_name,'collection_name'),id = guid(args.record_id,'record_id');
    const pageSize = integer(args.page_size,'page_size',20,1,100),page = integer(args.page_number,'page_number',1,1,1000);
    const include = bool(args.include_values,'include_values'),limit = integer(args.max_text_chars,'max_text_chars',2000,100,8000);
    let cookie:string|null = null;
    if (args.paging_cookie !== undefined) {
      if (typeof args.paging_cookie !== 'string' || !args.paging_cookie || Buffer.byteLength(args.paging_cookie) > 16384) invalid('paging_cookie must be a non-empty native cookie of at most 16 KiB.');
      cookie = args.paging_cookie;
    }
    if (page === 1 && cookie !== null) invalid('page_number=1 cannot carry a paging_cookie.');
    if (page > 1 && cookie === null) invalid('Later audit pages require the previous native paging_cookie.');
    const reader = new EvidenceReader(this.client,signal);
    const result = await reader.get('/RetrieveRecordChangeHistory(Target=@target,PagingInfo=@paginginfo)?' + query({
      '@target':JSON.stringify({'@odata.id':collection + '(' + id + ')'}),
      '@paginginfo':JSON.stringify({PageNumber:page,Count:pageSize,PagingCookie:cookie,ReturnTotalRecordCount:false}),
    }));
    const data = record(result.AuditDetailCollection);
    if (!Array.isArray(data.AuditDetails) || data.AuditDetails.length > pageSize || typeof data.MoreRecords !== 'boolean' ||
        (data.PagingCookie != null && typeof data.PagingCookie !== 'string')) malformed();
    const items = data.AuditDetails.map((detail:unknown) => this.detail(record(detail),include,limit));
    const settings = await this.diagnostics.settings({collection_name:collection},signal);
    const nextCookie = data.PagingCookie && Buffer.byteLength(data.PagingCookie) <= 16384 ? data.PagingCookie : null;
    const canContinue = data.MoreRecords && !!nextCookie && nextCookie !== cookie && page < 1000;
    const continuationIssue = !data.MoreRecords ? null : page === 1000 ? 'page_limit' : !nextCookie ? 'cookie_missing_or_over_limit'
      : nextCookie === cookie ? 'cookie_repeated' : null;
    return {success:true,status:items.length ? 'records_found' : 'no_matching_visible_history',target:{collectionName:collection,id},items,count:items.length,
      paging:{pageNumber:page,pageSize,hasMore:data.MoreRecords,complete:!data.MoreRecords,
        next:canContinue ? {page_number:page + 1,paging_cookie:nextCookie} : null,
        canContinue,continuationIssue,
        note:'Reuse the same target and page size. No missing paging cookie is invented; pages are not a database snapshot.'},
      settings,valuesIncluded:include,valuesMayBeTruncated:include,retentionAssessment:'unknown',
      note:'The native history function can omit AuditRecord, including who/when/ID. Empty history does not prove deletion, disabled auditing or no changes. Native details may be received even when values are withheld from output.'};
  }); }

  details(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = input(raw,['audit_id','include_values','max_text_chars']);
    const id = guid(args.audit_id,'audit_id'),include = bool(args.include_values,'include_values');
    const limit = integer(args.max_text_chars,'max_text_chars',2000,100,8000);
    const reader = new EvidenceReader(this.client,signal);
    const result = await reader.get('/audits(' + id + ')/Microsoft.Dynamics.CRM.RetrieveAuditDetails()');
    const detail = this.detail(record(result.AuditDetail),include,limit);
    if (detail.auditRecord?.auditid && rowGuid(detail.auditRecord.auditid) !== id) malformed();
    const metadata = await reader.component('audit_record_metadata',async () => {
      const row = await reader.get('/audits(' + id + ')?$select=' + auditColumns.join(','));
      if (rowGuid(row.auditid) !== id) malformed();
      return pick(row,auditColumns);
    });
    return {success:true,auditId:id,detail,metadata,valuesIncluded:include,valuesMayBeTruncated:include,
      note:'Detail retrieval and audit summary privileges can differ. Missing actor/time metadata is kept unknown. Sensitive field-name masking is heuristic; explicitly included values may contain business data.'};
  }); }

  private detail(value:Row,include:boolean,limit:number):Row {
    let type = value['@odata.type'];
    // Minimal-metadata responses can omit the declared base AuditDetail type (CRM 9.1).
    // Only accept an unambiguous base shape; never reinterpret untyped derived values.
    if (!Object.hasOwn(value,'@odata.type') && value.AuditRecord != null &&
        Object.keys(value).every(key => key === 'AuditRecord' || key.startsWith('@odata.'))) {
      rowGuid(record(value.AuditRecord).auditid);
      type = '#Microsoft.Dynamics.CRM.AuditDetail';
    }
    if (typeof type !== 'string' || !/^#?Microsoft\.Dynamics\.CRM\.(?:[A-Za-z]+)?AuditDetail$/.test(type)) malformed();
    const auditRecord = value.AuditRecord == null ? null : pick(record(value.AuditRecord),auditColumns);
    if (auditRecord?.auditid !== undefined) rowGuid(auditRecord.auditid);
    const result:Row = {detailType:type,auditRecord,metadataStatus:auditRecord ? 'returned' : 'not_returned_by_native_function'};
    if (!type.endsWith('.AttributeAuditDetail')) return {...result,detailFields:'not_projected_for_this_detail_type'};
    const old = value.OldValue == null ? {} : record(value.OldValue),current = value.NewValue == null ? {} : record(value.NewValue);
    const deleted = value.DeletedAttributes?.Keys;
    if (deleted !== undefined && (!Array.isArray(deleted) || deleted.some((name:unknown) => typeof name !== 'string'))) malformed();
    const fields = [...new Set([...Object.keys(old),...Object.keys(current),...(deleted ?? [])].filter(name => !name.includes('@')))];
    if (fields.length > 1000) malformed();
    result.changedFields = fields;
    if (include) { result.oldValue = bounded(old,limit); result.newValue = bounded(current,limit); }
    return result;
  }
}
