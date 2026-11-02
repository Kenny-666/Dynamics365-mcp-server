import NodeCache from 'node-cache';

export class CacheService {
  private cache: NodeCache;
  private static instance: CacheService;
  private static instances = new Set<CacheService>();

  private constructor(ttlSeconds: number = 7200) {
    this.cache = new NodeCache({ stdTTL: ttlSeconds, checkperiod: 600 });
    CacheService.instances.add(this);
  }

  static getInstance(ttlSeconds?: number): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(ttlSeconds);
    }
    return CacheService.instance;
  }

  static createIsolated(ttlSeconds?: number): CacheService { return new CacheService(ttlSeconds); }

  static flushExisting(): void {
    for (const cache of CacheService.instances) cache.flushAll();
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    if (ttl !== undefined) {
      return this.cache.set(key, value, ttl);
    }
    return this.cache.set(key, value);
  }

  del(key: string): number {
    return this.cache.del(key);
  }

  flushAll(): void {
    this.cache.flushAll();
  }

  getStats(): NodeCache.Stats {
    return this.cache.getStats();
  }
}
