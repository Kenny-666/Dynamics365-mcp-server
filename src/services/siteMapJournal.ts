import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { CrmRequestClient } from '../types/crmRequest.js';
import { CrmRequestError } from '../errors.js';
import { guid, uiXml, xmlHash } from './modelUiXml.js';
import { etag } from './recordMutationInput.js';
import type { RecordMutationService } from './recordMutation.js';
type Row = Record<string,any>;
const digest = (v:unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class SiteMapJournalError extends CrmRequestError {
 constructor(code:string,message:string,readonly data:Row={},details:ConstructorParameters<typeof CrmRequestError>[2]={outcome:'not_sent'}) {super('D365_SITEMAP_JOURNAL_'+code,message,details);}
 override toJSON(){return {...super.toJSON(),data:this.data};}
}
function fail(code:string,message:string):never {throw new SiteMapJournalError(code,message);}
export class SiteMapJournalService {
 constructor(private client:CrmRequestClient,private writer:RecordMutationService,private environment:{orgUrl:string;apiVersion:string}) {}
 private root() {const path=process.env.D365_JOURNAL_DIR; if (!path || !isAbsolute(path)) return fail('CONFIG','D365_JOURNAL_DIR must be an absolute path.'); return path;}
 private path(id:string) {return join(this.root(),guid(id,'journal_id')+'.json');}
 private async identity(signal?:AbortSignal) {
  const who=await this.client.makeRequest<Row>('/WhoAmI','GET',undefined,{signal});
  if (!who) return fail('IDENTITY','CRM identity was not returned.');
  return digest({org:this.environment.orgUrl.replace(/\/+$/,''),api:this.environment.apiVersion,user:guid(who.UserId,'UserId'),organization:guid(who.OrganizationId,'OrganizationId')});
 }
 private async read(id:string,signal?:AbortSignal) {
  const result=await this.client.requestWithResponse<Row>(`/sitemaps(${id})?$select=sitemapid,sitemapxml`,'GET',undefined,{signal,headers:{'Cache-Control':'no-cache'}});
  if (result.status!==200 || !result.data || guid(result.data.sitemapid,'sitemapid')!==id || typeof result.data.sitemapxml!=='string') return fail('READ','SiteMap baseline is incomplete.');
  const version=etag(result.data['@odata.etag'] ?? result.headers.etag); if (!version) return fail('ETAG_REQUIRED','A specific SiteMap ETag is required.');
  const xml=result.data.sitemapxml; uiXml(xml,'SiteMap'); return {xml,version,hash:xmlHash(xml,'SiteMap')};
 }
 private async create(entry:Row) {
  await mkdir(this.root(),{recursive:true,mode:0o700});
  const file=await open(this.path(entry.journalId),'wx',0o600);
  try {await file.writeFile(JSON.stringify(entry),'utf8');await file.sync();} finally {await file.close();}
 }
 private async replace(entry:Row) {
  const path=this.path(entry.journalId), temp=path+'.'+randomUUID()+'.tmp';
  const file=await open(temp,'wx',0o600);
  try {await file.writeFile(JSON.stringify(entry),'utf8');await file.sync();} finally {await file.close();}
  try {await rename(temp,path);} catch(error) {await unlink(temp).catch(()=>{});throw error;}
 }
 private async load(journalId:string):Promise<Row> {
  const raw=await readFile(this.path(journalId),'utf8'); if (Buffer.byteLength(raw)>3_000_000) return fail('INVALID','Journal entry is too large.');
  let j:Row; try {j=JSON.parse(raw);} catch {return fail('INVALID','Journal entry is malformed.');}
  if (!j || j.version!==1 || j.journalId!==journalId || j.kind!=='sitemap_xml' || typeof j.identity!=='string' || typeof j.beforeXml!=='string' || typeof j.afterHash!=='string') return fail('INVALID','Journal entry is invalid.');
  guid(j.targetId,'target_id'); uiXml(j.beforeXml,'SiteMap');
  if (!/^[a-f0-9]{64}$/.test(j.identity) || !/^[a-f0-9]{64}$/.test(j.afterHash) || j.beforeHash !== xmlHash(j.beforeXml,'SiteMap')) return fail('INVALID','Journal integrity check failed.');
  return j;
 }
 async save(input:Row,signal?:AbortSignal) {
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['id','xml','dry_run','expected_hash'].includes(k))) return fail('INVALID','Invalid arguments.');
  const id=guid(input.id,'id'); uiXml(input.xml,'SiteMap');
  if (input.dry_run!==undefined && typeof input.dry_run!=='boolean') return fail('INVALID','dry_run must be boolean.');
  const dry=input.dry_run ?? true, identity=await this.identity(signal), before=await this.read(id,signal), afterHash=xmlHash(input.xml,'SiteMap');
  const planHash=digest({identity,id,beforeHash:before.hash,beforeEtag:before.version,afterHash});
  if (input.expected_hash!==undefined && input.expected_hash!==planHash) return fail('CONFLICT','Baseline changed; preview again.');
  if (!dry && !input.expected_hash) return fail('PREVIEW_REQUIRED','expected_hash from the preview is required.');
  const plan={id,planHash,beforeHash:before.hash,afterHash,concurrencyProtected:true,publicationStatus:'not_requested'};
  if (dry) return {...plan,dryRun:true};
  const entry:Row={version:1,kind:'sitemap_xml',journalId:randomUUID(),identity,targetId:id,beforeXml:before.xml,beforeHash:before.hash,afterHash,status:'pending',createdAt:new Date().toISOString()};
  await this.create(entry);
  let writeResult:Row;
  try {writeResult=await this.writer.execute('update',{collection_name:'sitemaps',id,data:{sitemapxml:input.xml},if_match:before.version},signal);}
  catch(error) {entry.status=error instanceof CrmRequestError && error.details.outcome==='not_sent' ? 'not_sent' : 'unknown';await this.replace(entry).catch(()=>{});throw new SiteMapJournalError('WRITE_FAILED','Save failed or its result is unknown. Inspect before retrying.',{journalId:entry.journalId,status:entry.status},{outcome:entry.status==='not_sent'?'not_sent':'unknown',retryable:false});}
  try {
   const after=await this.read(id,signal);
   if (!writeResult.etag || after.version!==etag(writeResult.etag) || after.hash!==afterHash) throw new Error('readback or write ETag mismatch');
   entry.afterEtag=after.version;entry.status='saved';await this.replace(entry);
  } catch {throw new SiteMapJournalError('READBACK_FAILED','Save was accepted but readback or journal update failed. Inspect before retrying.',{journalId:entry.journalId,status:'unknown'},{outcome:'unknown',retryable:false});}
  return {...plan,dryRun:false,journalId:entry.journalId,saved:true,publicationStatus:'not_requested'};
 }
 async rollback(input:Row,signal?:AbortSignal) {
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['journal_id','dry_run','expected_hash'].includes(k))) return fail('INVALID','Invalid arguments.');
  const journalId=guid(input.journal_id,'journal_id');if (input.dry_run!==undefined && typeof input.dry_run!=='boolean') return fail('INVALID','dry_run must be boolean.');
  const lockPath=this.path(journalId)+'.lock';const lock=await open(lockPath,'wx',0o600);
  try {
   const entry=await this.load(journalId);if (entry.status!=='saved' || !etag(entry.afterEtag)) return fail('NOT_ROLLBACKABLE','Entry is not in a verified saved state.');
   if (await this.identity(signal)!==entry.identity) return fail('IDENTITY','Journal belongs to a different CRM identity or environment.');
   const current=await this.read(entry.targetId,signal); if (current.hash!==entry.afterHash || current.version!==entry.afterEtag) return fail('CONFLICT','SiteMap changed after the saved operation; rollback is blocked.');
   const planHash=digest({journalId,identity:entry.identity,target:entry.targetId,currentHash:current.hash,currentEtag:current.version,restoreHash:xmlHash(entry.beforeXml,'SiteMap')});
   if (input.expected_hash!==undefined && input.expected_hash!==planHash) return fail('CONFLICT','Rollback preview changed.');
   const dry=input.dry_run ?? true;if (!dry && !input.expected_hash) return fail('PREVIEW_REQUIRED','expected_hash from rollback preview is required.');
   const result={journalId,targetId:entry.targetId,planHash,dryRun:dry,publicationStatus:'not_requested'};if (dry) return result;
   entry.status='rollback_pending';await this.replace(entry);
   try {await this.writer.execute('update',{collection_name:'sitemaps',id:entry.targetId,data:{sitemapxml:entry.beforeXml},if_match:current.version},signal);
    const after=await this.read(entry.targetId,signal);if (after.hash!==xmlHash(entry.beforeXml,'SiteMap')) throw new Error('readback mismatch');
    entry.status='rolled_back';entry.rollbackEtag=after.version;await this.replace(entry);
   } catch {throw new SiteMapJournalError('ROLLBACK_UNKNOWN','Rollback failed or could not be verified; inspect before retrying.',{journalId,status:'rollback_pending'},{outcome:'unknown',retryable:false});}
   return {...result,restored:true};
  } finally {await lock.close();await unlink(lockPath).catch(()=>{});}
 }
}
