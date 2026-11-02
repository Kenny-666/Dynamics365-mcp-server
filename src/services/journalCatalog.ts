import { createHash } from 'node:crypto';
import { lstat, open, opendir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { CrmDataClient } from '../types/crmRequest.js';
import { CrmRequestError } from '../errors.js';
import { guid, identifier } from './recordMutationInput.js';

type Row = Record<string, any>;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const states = new Set(['pending','not_sent','unknown','saved','rollback_pending','rolled_back','call_pending','call_completed','call_failed','backup_ready','restore_pending','restored']);
export class JournalCatalogService {
  constructor(private client:CrmDataClient,private environment:{orgUrl:string;apiVersion:string}) {}
  private root():string {
    const path=process.env.D365_JOURNAL_DIR;
    if (!path || !isAbsolute(path)) throw new CrmRequestError('D365_JOURNAL_CONFIG','D365_JOURNAL_DIR must be an absolute path.',{outcome:'not_sent'});
    return path;
  }
  private async identity(signal?:AbortSignal):Promise<string> {
    const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});
    if (!who) throw new CrmRequestError('D365_JOURNAL_IDENTITY','CRM identity was not returned.',{outcome:'not_sent'});
    return createHash('sha256').update(JSON.stringify({org:this.environment.orgUrl.replace(/\/+$/,''),api:this.environment.apiVersion,user:guid(who.UserId),organization:guid(who.OrganizationId)})).digest('hex');
  }
  private async entry(id:string,identity:string):Promise<Row|null> {
    const path=join(this.root(),id+'.json');
    try {
      const info=await lstat(path);if(!info.isFile() || info.isSymbolicLink() || info.size>16_000_000) return null;
      const file=await open(path,'r');let raw:string;
      try {const now=await file.stat();if(!now.isFile() || now.size>16_000_000) return null;raw=await file.readFile('utf8');} finally {await file.close();}
      if(Buffer.byteLength(raw)>16_000_000)return null;
      const e=JSON.parse(raw);
      if(!e || e.version!==1 || e.journalId!==id || e.identity!==identity || !states.has(e.status) || !['record_update','sitemap_xml','tool_call','customization_backup'].includes(e.kind))return null;
      if (e.kind==='tool_call') {
        if(typeof e.toolName!=='string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(e.toolName) || !/^call_(pending|completed|failed)$/.test(e.status) || typeof e.createdAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.createdAt))return null;
        return {journalId:id,kind:e.kind,toolName:e.toolName,status:e.status,createdAt:e.createdAt,rollbackEligibility:'unavailable',outcome:['not_sent','rejected','unknown'].includes(e.outcome)?e.outcome:null};
      }
      if(e.kind==='customization_backup'){
        if(!['form','view','webresource'].includes(e.componentKind)||!['backup_ready','restore_pending','restored'].includes(e.status)||typeof e.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.createdAt))return null;
        const targetId=guid(e.targetId);if(e.componentKind!=='webresource')identifier(e.logicalName,'logicalName');
        return {journalId:id,kind:e.kind,componentKind:e.componentKind,targetId,status:e.status,createdAt:e.createdAt,rollbackEligibility:e.status==='backup_ready'?'requires_preview':'unavailable',rollbackTool:'restore_customization_backup'};
      }
      const targetId=guid(e.targetId);
      if(typeof e.createdAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.createdAt))return null;
      const collection=e.kind==='sitemap_xml'?'sitemaps':identifier(e.collection,'collection');
      return {journalId:id,kind:e.kind,collectionName:collection,targetId,status:e.status,createdAt:e.createdAt,
        rollbackEligibility:e.status==='saved' && typeof e.afterEtag==='string' ? 'requires_preview' : 'unavailable',
        rollbackTool:e.kind==='sitemap_xml'?'rollback_sitemap_journal':'rollback_record_journal'};
    } catch {return null;}
  }
  async list(input:unknown,signal?:AbortSignal) {
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['limit','offset'].includes(k))) throw new CrmRequestError('D365_JOURNAL_INVALID','Expected limit and offset only.',{outcome:'not_sent'});
    const a=input as Row,limit=a.limit??50,offset=a.offset??0;
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>2000) throw new CrmRequestError('D365_JOURNAL_INVALID','limit must be 1–100 and offset must be 0–2000.',{outcome:'not_sent'});
    const identity=await this.identity(signal),ids:string[]=[];let dir;
    try {dir=await opendir(this.root());} catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT')return {items:[],total:0,nextOffset:null};throw error;}
    for await(const file of dir) {
      if(signal?.aborted)throw new CrmRequestError('D365_REQUEST_ABORTED','Journal listing was cancelled.',{outcome:'not_sent'});
      if(!file.isFile()||!file.name.endsWith('.json'))continue;
      const id=file.name.slice(0,-5);if(!idPattern.test(id))continue;
      ids.push(id);if(ids.length>2000)throw new CrmRequestError('D365_JOURNAL_LIMIT','Journal directory exceeds the supported 2000 entries.',{outcome:'not_sent'});
    }
    const entries:Row[]=[];for(const id of ids){if(signal?.aborted)throw new CrmRequestError('D365_REQUEST_ABORTED','Journal listing was cancelled.',{outcome:'not_sent'});const item=await this.entry(id,identity);if(item)entries.push(item);}
    entries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.journalId.localeCompare(b.journalId));
    return {items:entries.slice(offset,offset+limit),total:entries.length,nextOffset:offset+limit<entries.length?offset+limit:null,
      note:'Only recognized entries belonging to the current CRM identity and environment are shown. Call completion does not establish CRM write success; rollback eligibility requires a fresh preview.'};
  }
  async get(input:unknown,signal?:AbortSignal) {
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>k!=='journal_id')) throw new CrmRequestError('D365_JOURNAL_INVALID','Expected journal_id only.',{outcome:'not_sent'});
    const id=guid((input as Row).journal_id),identity=await this.identity(signal),result=await this.entry(id,identity);
    if(!result)throw new CrmRequestError('D365_JOURNAL_NOT_FOUND','Journal entry was not found for the current identity and environment.',{outcome:'not_sent'});
    return {...result,note:'Original field values and XML are intentionally omitted. Eligibility requires a fresh rollback preview.'};
  }
}
