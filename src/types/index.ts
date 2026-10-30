export interface EntitySchema {
  logicalName: string;
  schemaName: string;
  primaryKey: string;
  attributes: EntityAttribute[];
}

export interface EntityAttribute {
  logicalName: string;
  schemaName: string;
  attributeType: string;
  displayName?: string;
  requiredLevel?: string;
  isCustom?: boolean;
}

export interface OptionSetDefinition {
  logicalName: string;
  displayName?: string;
  options: OptionSetValue[];
}

export interface OptionSetValue {
  value: number;
  label: string;
}

export interface EntityRelationships {
  logicalName: string;
  oneToMany: OneToManyRelationship[];
  manyToOne: ManyToOneRelationship[];
  manyToMany: ManyToManyRelationship[];
}

export interface OneToManyRelationship {
  referencingAttribute: string;
  referencedEntityNavigationPropertyName: string;
  referencedEntity: string;
  referencingEntity: string;
}

export interface ManyToOneRelationship {
  referencingEntityNavigationPropertyName: string;
  referencedEntity: string;
  referencingEntity: string;
}

export interface ManyToManyRelationship {
  intersectEntityName: string;
  entity1LogicalName: string;
  entity2LogicalName: string;
  entity1NavigationPropertyName: string;
  entity2NavigationPropertyName: string;
}

export interface FetchXmlValidationResult {
  isSuccess: boolean;
  sampleData?: any;
  errorMessage?: string;
  error?: Record<string, unknown>;
  query?: import('./query.js').EffectiveQuery;
  paging?: Record<string, unknown>;
}

export interface D365Config {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  environmentUrl: string;
  cacheTtl: number;
  requestTimeoutMs?: number;
  maxReadRetries?: number;
  maxRetryDelayMs?: number;
  orgUrl?: string;
  authType?: 'online' | 'op_ad' | 'op_ifd';
  apiVersion?: string;
  cacheTtlSeconds?: number;
  ad?: {
    username?: string;
    password?: string;
    domain?: string;
    workstation?: string;
  };
  ifd?: {
    adfsUrl?: string;
    clientId?: string;
    clientSecret?: string;
    username?: string;
    password?: string;
    resource?: string;
    grantType?: string;
    tokenPath?: string;
  };
}
