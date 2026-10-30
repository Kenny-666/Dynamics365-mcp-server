import type { CrmHttpMethod, CrmResponse } from './crmRequest.js';

export type MutationKind = 'create' | 'update' | 'delete' | 'upsert' | 'associate' | 'disassociate';
export type Row = Record<string, any>;
export interface MutationEnvironment {orgUrl:string; authType:string; apiVersion:string;}
export interface MutationPlan {
  operation:MutationKind;
  collectionName:string;
  primaryId:string;
  id:string | null;
  method:CrmHttpMethod;
  endpoint:string;
  headers:Record<string,string>;
  body?:Row;
  concurrencyProtected:boolean;
  blockedBy:string | null;
  preview:Row;
  identityMode?:'create_only' | 'update_only' | 'upsert';
  relationshipClearCheck?:{lookup:string;navigation:string;relatedKey:string};
}
export interface NativeBatchPart {contentId?:string; changeSet?:string; response:CrmResponse<Row>;}
