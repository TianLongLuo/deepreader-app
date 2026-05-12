import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

let hasWarnedAboutRedisFallback = false;

function warnRedisFallback(error: unknown) {
  if (hasWarnedAboutRedisFallback) {
    return;
  }

  hasWarnedAboutRedisFallback = true;
  console.warn(
    '[cache] Redis unavailable, falling back to no-cache mode:',
    error instanceof Error ? error.message : String(error)
  );
}

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });
}

export const redis = globalForRedis.redis ?? createRedisClient();

redis.on('error', (error) => {
  warnRedisFallback(error);
});

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

/**
 * Cache service for explanation caching and general purpose caching.
 */
export class CacheService {
  private prefix = 'dr:';

  constructor(private client: Redis = redis) {}

  private key(parts: string[]): string {
    return this.prefix + parts.join(':');
  }

  async get<T>(parts: string[]): Promise<T | null> {
    try {
      const raw = await this.client.get(this.key(parts));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    } catch (error) {
      warnRedisFallback(error);
      return null;
    }
  }

  async set(parts: string[], value: unknown, ttlSeconds = 3600): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.client.setex(this.key(parts), ttlSeconds, serialized);
      } else {
        await this.client.set(this.key(parts), serialized);
      }
    } catch (error) {
      warnRedisFallback(error);
    }
  }

  async del(parts: string[]): Promise<void> {
    try {
      await this.client.del(this.key(parts));
    } catch (error) {
      warnRedisFallback(error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(this.prefix + pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      warnRedisFallback(error);
    }
  }

  /**
   * Build explanation cache key
   */
  explanationCacheKey(params: {
    textHash: string;
    provider: string;
    model: string;
    promptVersion: string;
    settingsHash: string;
  }): string[] {
    return [
      'explanation',
      params.textHash,
      params.provider,
      params.model,
      params.promptVersion,
      params.settingsHash,
    ];
  }
}

export const cacheService = new CacheService();
