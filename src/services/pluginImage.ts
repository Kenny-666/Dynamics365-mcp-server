import { createHash, randomUUID } from 'node:crypto';
import type { CrmRequestClient } from '../types/crmRequest.js';
import { CrmRequestError } from '../errors.js';
import { PluginStepError, object, guid, text, bool, integer, etag, attributes, logical, invalid, protect, evidence, type Row } from './pluginStepValidation.js';

const ID = 'sdkmessageprocessingstepimageid';
const SET = '/sdkmessageprocessingstepimages';
const SELECT = [ID,'name','description','entityalias','imagetype','attributes','messagepropertyname',
  'relatedattributename','_sdkmessageprocessingstepid_value','ismanaged','iscustomizable'].join(',');
const properties:Record<string,string> = {create:'Target',update:'Target',delete:'Target',assign:'Target',setstate:'EntityMoniker'};
const fields = ['name','description','entity_alias','image_type','attributes'];
const aliases:Record<string,string> = {imageId:'image_id',entityAlias:'entity_alias',imageType:'image_type',expectedFingerprint:'expected_fingerprint'};
function input(raw:unknown, allowed:string[]):Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('Expected an image argument object.');
  const normalized:Row = {};
  for (const [key,value] of Object.entries(raw)) {
    const mapped = aliases[key] ?? key;
    if (Object.hasOwn(normalized,mapped) && JSON.stringify(normalized[mapped]) !== JSON.stringify(value)) invalid('Conflicting image aliases.');
    normalized[mapped] = value;
  }
  return object(normalized,allowed);
}
function fail(code:string,message:string,data:Row = {}):never {
  throw new PluginStepError('D365_PLUGIN_IMAGE_' + code,message,data);
}
function bounded(value:unknown,field:string,empty = false):string {
  const result = text(value,field,empty);
  if (result.length > 256 || /[\x00-\x1f]/.test(result)) invalid(field + ' must contain at most 256 characters and no control characters.');
  return result.trim();
}
function type(value:unknown):number {
  const result = ({PreImage:0,PostImage:1,Both:2} as Row)[String(value)] ?? value;
  if (![0,1,2].includes(result)) invalid('image_type must be 0/PreImage, 1/PostImage or 2/Both.');
  return result;
}
function patch(raw:unknown):Row {
  const values = input(raw,fields), result:Row = {};
  for (const key of ['name','description','entity_alias']) if (values[key] !== undefined) {
    result[key === 'entity_alias' ? 'entityalias' : key] = bounded(values[key],key,key === 'description');
  }
  if (values.image_type !== undefined) result.imagetype = type(values.image_type);
  if (values.attributes !== undefined) {
    const list = attributes(values.attributes)!;
    if (!list.length) invalid('Image attributes must explicitly select at least one field; all-column images are not supported.');
    result.attributes = list.sort().join(',');
  }
  return result;
}
function fingerprint(value:unknown):string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function row(value:unknown):Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RESPONSE_INVALID','The native image response is not an object.');
  return value as Row;
}

/** Native entity-image operations. No step configuration or assembly content is requested. */
export class PluginImageService {
  constructor(private readonly client:CrmRequestClient, private readonly environment:{orgUrl:string;authType:string;apiVersion:string},
    private readonly newId:()=>string = randomUUID) {}

  private async get(endpoint:string, signal?:AbortSignal):Promise<Row> {
    return row((await this.client.requestWithResponse(endpoint,'GET',undefined,{signal})).data);
  }
  private item(value:Row):Row {
    const result:Row = {};
    for (const field of SELECT.split(',')) if (value[field] !== undefined) result[field] = value[field];
    result[ID] = guid(value[ID],'image_id');
    result['@odata.etag'] = value['@odata.etag'] ?? null;
    return result;
  }
  private async images(stepId:string, top:number, signal?:AbortSignal) {
    const result = await this.get(SET + '?$select=' + SELECT + '&$filter=_sdkmessageprocessingstepid_value eq ' + stepId + '&$orderby=' + ID + '&$top=' + top,signal);
    if (!Array.isArray(result.value) || result.value.length > top) fail('RESPONSE_INVALID','The native image collection is invalid.');
    const items = result.value.map((value:unknown) => {
      const image = this.item(row(value));
      if (guid(image._sdkmessageprocessingstepid_value,'parent step') !== stepId) fail('RESPONSE_INVALID','An image belongs to another step.');
      return image;
    });
    return {items,complete:!result['@odata.nextLink'] && items.length < top};
  }
  query(raw:unknown, signal?:AbortSignal) {
    return protect(async () => {
      const args = input(raw,['step_id','top']);
      const stepId = guid(args.step_id,'step_id'), top = args.top === undefined ? 100 : integer(args.top,'top',500);
      const result = await this.images(stepId,top,signal);
      return {success:true,environment:this.environment,stepId,...result,count:result.items.length,limit:top};
    });
  }

  mutate(raw:unknown, operation:'register'|'update'|'delete', signal?:AbortSignal) {
    return protect(async () => {
      const args = input(raw,operation === 'register' ? ['step_id',...fields,'dry_run','expected_fingerprint']
        : ['image_id',...(operation === 'update' ? ['patch'] : []),'dry_run','expected_fingerprint','if_match','allow_unprotected_update']);
      const dryRun = bool(args.dry_run,'dry_run',true);
      const suppliedMatch = etag(args.if_match);
      const allow = bool(args.allow_unprotected_update,'allow_unprotected_update');
      if (args.expected_fingerprint !== undefined && (typeof args.expected_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(args.expected_fingerprint))) invalid('expected_fingerprint must be a preview SHA-256.');
      let existing:Row | null = null;
      if (operation !== 'register') {
        const requested = guid(args.image_id,'image_id');
        existing = this.item(await this.get(SET + '(' + requested + ')?$select=' + SELECT,signal));
        if (existing[ID] !== requested) fail('RESPONSE_INVALID','The returned image does not match the requested ID.');
      }
      const stepId = guid(existing?._sdkmessageprocessingstepid_value ?? args.step_id,'step_id');
      const step = await this.get('/sdkmessageprocessingsteps(' + stepId + ')?$select=sdkmessageprocessingstepid,stage,mode,_eventhandler_value,_sdkmessageid_value,_sdkmessagefilterid_value&$expand=eventhandler_plugintype($select=plugintypeid),sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)',signal);
      if (guid(step.sdkmessageprocessingstepid,'step_id') !== stepId || !step.eventhandler_plugintype?.plugintypeid) fail('STEP_INVALID','An exact plugin-type step is required.');
      const context = {stepId,stage:step.stage,mode:step.mode,pluginType:guid(step.eventhandler_plugintype.plugintypeid),
        message:step.sdkmessageid?.name,entity:step.sdkmessagefilterid?.primaryobjecttypecode ?? null};
      if (existing && (existing.ismanaged !== false || existing.iscustomizable?.Value !== true)) fail('MANAGED','Only confirmed unmanaged, customizable images can be changed.');
      if (operation === 'update' && args.patch === undefined) invalid('patch is required.');
      const payload = operation === 'delete' ? {} : patch(operation === 'register' ? Object.fromEntries(fields.filter(key => args[key] !== undefined).map(key => [key,args[key]])) : args.patch);
      if (operation === 'register') for (const field of ['name','entityalias','imagetype','attributes']) if (payload[field] === undefined) invalid('Registration requires name, entity_alias, image_type and attributes.');
      if (operation === 'update' && !Object.keys(payload).length) invalid('The image patch must not be empty.');
      const desired = {...existing,...payload};
      if (operation !== 'delete') {
        const property = properties[String(context.message).toLowerCase()];
        if (!property) fail('MESSAGE_UNSUPPORTED','Image writes currently support only Create, Update, Delete, Assign and SetState.');
        const entity = logical(context.entity);
        if (!entity) fail('ENTITY_REQUIRED','Image writes require an entity-specific step.');
        if (![10,20,40].includes(context.stage) || ![0,1].includes(context.mode) || (context.mode === 1 && context.stage !== 40)) fail('STAGE_INVALID','The step stage/mode is not supported.');
        const imageType = type(desired.imagetype);
        if ((String(context.message).toLowerCase() === 'create' && imageType !== 1)
          || (String(context.message).toLowerCase() === 'delete' && imageType !== 0)
          || (imageType !== 0 && context.stage !== 40)) fail('STAGE_INVALID','The image type is unavailable for the step message/stage.');
        if (existing && (existing.messagepropertyname !== property || existing.relatedattributename)) fail('PROPERTY_UNSUPPORTED','The existing image property cannot be safely maintained by this tool.');
        const selected = attributes(typeof desired.attributes === 'string' ? desired.attributes.split(',').filter(Boolean) : undefined);
        if (!selected?.length) invalid('A non-empty explicit attributes selection is required.');
        for (const attribute of selected) {
          const metadata = await this.get("/EntityDefinitions(LogicalName='" + entity + "')/Attributes(LogicalName='" + attribute + "')?$select=LogicalName,IsValidForRead",signal);
          if (metadata.LogicalName !== attribute || metadata.IsValidForRead !== true) fail('ATTRIBUTE_INVALID','A selected image field is not confirmed readable.',{attribute});
        }
        if (operation === 'register') payload.messagepropertyname = property;
      }
      const siblings = await this.images(stepId,500,signal);
      if (!siblings.complete) fail('INCOMPLETE','Image enumeration reached its limit; no write can be safely planned.');
      if (operation !== 'delete') {
        const mask = (kind:number) => kind === 2 ? 3 : kind === 0 ? 1 : kind === 1 ? 2 : 3;
        const duplicate = siblings.items.find(image => image[ID] !== existing?.[ID] &&
          (String(image.name).toLowerCase() === String(desired.name).toLowerCase() ||
          (String(image.entityalias).toLowerCase() === String(desired.entityalias).toLowerCase() && (mask(image.imagetype) & mask(desired.imagetype)))));
        if (duplicate) fail('DUPLICATE','The image name or overlapping Pre/Post alias is already registered.',{imageId:duplicate[ID]});
      }
      const baseline = fingerprint({environment:this.environment,operation,context,existing,payload,siblings:siblings.items});
      let match:string|undefined, concurrency = false;
      let blockedBy:string|null = null;
      if (existing) {
        const metadata = await this.get("/EntityDefinitions(LogicalName='sdkmessageprocessingstepimage')?$select=IsOptimisticConcurrencyEnabled",signal);
        concurrency = metadata.IsOptimisticConcurrencyEnabled === true;
        match = concurrency ? suppliedMatch ?? etag(existing['@odata.etag'] ?? undefined) : allow && !suppliedMatch ? '*' : undefined;
        blockedBy = !concurrency && (!allow || suppliedMatch) ? 'D365_PLUGIN_IMAGE_CONCURRENCY_UNSUPPORTED'
          : !match ? 'D365_PLUGIN_IMAGE_ETAG_REQUIRED'
          : suppliedMatch && existing['@odata.etag'] && suppliedMatch !== existing['@odata.etag'] ? 'D365_CONCURRENCY_CONFLICT' : null;
      }
      if (dryRun) return {success:true,dryRun:true,saved:false,operation,environment:this.environment,step:context,
        imageId:existing?.[ID] ?? null,before:existing,changes:payload,fingerprint:baseline,
        concurrencyProtected:concurrency,ifMatch:match ?? null,canWrite:!blockedBy,blockedBy,
        note:'Preview does not lock the parent step or enforce uniqueness atomically. Recheck execution results.'};
      if (args.expected_fingerprint !== baseline) fail('PREVIEW_CHANGED','Run a fresh preview and supply its fingerprint before writing.');
      if (blockedBy) throw new PluginStepError(blockedBy,'The requested image write lacks confirmed concurrency protection. No write was sent.',{}, {outcome:'not_sent'});
      if (signal?.aborted) throw new CrmRequestError('D365_REQUEST_CANCELLED','The image operation was cancelled before writing.',{outcome:'not_sent'});
      const imageId = existing?.[ID] ?? guid(this.newId(),'generated image ID');
      if (operation === 'register') { payload[ID] = imageId; payload['sdkmessageprocessingstepid@odata.bind'] = '/sdkmessageprocessingsteps(' + stepId + ')'; }
      const state:Row = {operation,stepId,imageId,saved:false,readbackConfirmed:false};
      try {
        const response = await this.client.requestWithResponse(operation === 'register' ? SET : SET + '(' + imageId + ')',
          operation === 'register' ? 'POST' : operation === 'update' ? 'PATCH' : 'DELETE',operation === 'delete' ? undefined : payload,
          {signal,headers:operation === 'register' ? {Prefer:'return=representation'} : {'If-Match':match!}});
        state.saved = true;
        if (response.data && (response.data as Row)[ID] !== undefined && guid((response.data as Row)[ID]) !== imageId) fail('IDENTITY_MISMATCH','The write response contains another image ID.');
      } catch (error) {
        if (state.saved !== true) state.saved = ['not_sent','rejected'].includes(evidence(error).outcome ?? '') ? false : 'unknown';
        throw new PluginStepError('D365_PLUGIN_IMAGE_WRITE_FAILED','The image write failed; no automatic replay was attempted.',{...state,phase:'write',cause: error instanceof CrmRequestError ? error.code : 'D365_PLUGIN_REQUEST_FAILED'},evidence(error));
      }
      try {
        const actual = this.item(await this.get(SET + '(' + imageId + ')?$select=' + SELECT,signal));
        if (operation === 'delete') fail('READBACK_MISMATCH','The image is still present after deletion.');
        if (actual[ID] !== imageId || guid(actual._sdkmessageprocessingstepid_value) !== stepId) fail('READBACK_MISMATCH','Image identity or parent changed during readback.');
        for (const field of ['name','description','entityalias','imagetype','attributes','messagepropertyname']) {
          const expected = payload[field] ?? existing?.[field];
          const normalized = (value:unknown) => field === 'attributes' && typeof value === 'string' ? value.split(',').map(x => x.trim().toLowerCase()).sort().join(',')
            : field === 'description' && value === null ? '' : value;
          if (expected !== undefined && normalized(expected) !== normalized(actual[field])) fail('READBACK_MISMATCH','The saved image differs from the planned values.',{field});
        }
        return {success:true,...state,readbackConfirmed:true,item:actual,concurrencyProtected:concurrency};
      } catch (error) {
        if (operation === 'delete' && error instanceof CrmRequestError && error.details.status === 404) return {success:true,...state,readbackConfirmed:true,deleted:true,concurrencyProtected:concurrency};
        throw new PluginStepError('D365_PLUGIN_IMAGE_READBACK_FAILED','The image write succeeded, but readback was not confirmed.',{...state,phase:'readback',cause:error instanceof CrmRequestError ? error.code : 'D365_PLUGIN_REQUEST_FAILED'},evidence(error));
      }
    });
  }
}
