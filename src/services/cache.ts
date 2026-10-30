import NodeCache from 'node-cache';

export class CacheService {
  private cache: NodeCache;
  private static instance: CacheService;

  private constructor(ttlSeconds: number = 7200) {
    this.cache = new NodeCache({ stdTTL: ttlSeconds, checkperiod: 600 });
  }

  static getInstance(ttlSeconds?: number): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(ttlSeconds);
    }
    return CacheService.instance;
  }

  static flushExisting(): void {
    CacheService.instance?.flushAll();
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
