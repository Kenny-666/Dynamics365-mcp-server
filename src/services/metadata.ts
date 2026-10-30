import type { CrmDataClient } from '../types/crmRequest.js';
import { CacheService } from './cache.js';

export class MetadataService {
  private auth: CrmDataClient;
  private cache: CacheService;

  constructor(auth: CrmDataClient, cache: CacheService) {
    this.auth = auth;
    this.cache = cache;
  }

  /**
   * Get organization information and user ID for the currently logged-in user.
   */
  async getCurrentUserContext(): Promise<any> {
    return await this.auth.makeRequest('/WhoAmI', 'GET');
  }

  /**
   * Get logical names, display names, and collection names for all entities in the system.
   */
  async getAllEntityDefinitions(): Promise<any> {
    const cacheKey = 'metadata_list_entities';
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const result = await this.auth.makeRequest('/EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName', 'GET');
    this.cache.set(cacheKey, result);
    return result;
  }
}
