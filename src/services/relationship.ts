import type { CrmDataClient } from '../types/crmRequest.js';
import { CacheService } from './cache.js';
import { identifier } from './queryState.js';
import { EntityRelationships, OneToManyRelationship, ManyToOneRelationship, ManyToManyRelationship } from '../types/index.js';

export class RelationshipService {
  private auth: CrmDataClient;
  private cache: CacheService;

  constructor(auth: CrmDataClient, cache: CacheService) {
    this.auth = auth;
    this.cache = cache;
  }

  /**
   * Get navigation relationships for an entity, including 1:N, N:1, and N:N relationships.
   * Can be filtered by a specific related entity using relatedEntityName.
   */
  async getEntityNavigationRelationships(
    entityName: string,
    relatedEntityName?: string
  ): Promise<EntityRelationships> {
    identifier(entityName,'entity_name');
    if (relatedEntityName !== undefined) identifier(relatedEntityName,'related_entity_name');
    const cacheKey = `relationships_${entityName}_${relatedEntityName || 'all'}`;
    const cached = this.cache.get<EntityRelationships>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch all relationships. Memory filtering is handled below in map functions.
    const metadata = await this.auth.makeRequest(
      `/EntityDefinitions(LogicalName='${entityName}')?$select=LogicalName&$expand=OneToManyRelationships,ManyToOneRelationships,ManyToManyRelationships`
    );

    if (!metadata) {
      throw new Error(`Entity not found: '${entityName}'`);
    }

    const oneToMany = this.mapOneToMany(metadata.OneToManyRelationships || [], relatedEntityName);
    const manyToOne = this.mapManyToOne(metadata.ManyToOneRelationships || [], relatedEntityName);
    const manyToMany = this.mapManyToMany(metadata.ManyToManyRelationships || [], relatedEntityName);

    const relationships: EntityRelationships = {
      logicalName: metadata.LogicalName,
      oneToMany,
      manyToOne,
      manyToMany,
    };

    this.cache.set(cacheKey, relationships);
    return relationships;
  }

  private mapOneToMany(relations: any[], filterEntity?: string): OneToManyRelationship[] {
    return relations
      .filter((rel) => !filterEntity || rel.ReferencingEntity === filterEntity || rel.ReferencedEntity === filterEntity)
      .map((rel) => ({
        referencingAttribute: rel.ReferencingAttribute,
        referencedEntityNavigationPropertyName: rel.ReferencedEntityNavigationPropertyName,
        referencedEntity: rel.ReferencedEntity,
        referencingEntity: rel.ReferencingEntity,
      }));
  }

  private mapManyToOne(relations: any[], filterEntity?: string): ManyToOneRelationship[] {
    return relations
      .filter((rel) => !filterEntity || rel.ReferencingEntity === filterEntity || rel.ReferencedEntity === filterEntity)
      .map((rel) => ({
        referencingEntityNavigationPropertyName: rel.ReferencingEntityNavigationPropertyName,
        referencedEntity: rel.ReferencedEntity,
        referencingEntity: rel.ReferencingEntity,
      }));
  }

  private mapManyToMany(relations: any[], filterEntity?: string): ManyToManyRelationship[] {
    return relations
      .filter((rel) => !filterEntity || rel.Entity1LogicalName === filterEntity || rel.Entity2LogicalName === filterEntity)
      .map((rel) => ({
        intersectEntityName: rel.IntersectEntityName,
        entity1LogicalName: rel.Entity1LogicalName,
        entity2LogicalName: rel.Entity2LogicalName,
        entity1NavigationPropertyName: rel.Entity1NavigationPropertyName,
        entity2NavigationPropertyName: rel.Entity2NavigationPropertyName,
      }));
  }
}
