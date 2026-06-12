import { LRUCache } from "lru-cache";
import { getRedisClient, isRedisAvailable } from "../config/redis.js";

const DEFAULT_TTL = 300; // 5 minutes
const lru = new LRUCache({ max: 500, ttl: DEFAULT_TTL * 1000 });

export const cache = {
  async get(key) {
    try {
      if (isRedisAvailable()) {
        const redis = await getRedisClient();
        const val = await redis.get(key);
        return val ? JSON.parse(val) : null;
      }
    } catch (err) {
      // Degrade gracefully to LRU cache
    }
    return lru.get(key) ?? null;
  },

  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      if (isRedisAvailable()) {
        const redis = await getRedisClient();
        await redis.set(key, JSON.stringify(value), { EX: ttl });
        return true;
      }
    } catch (err) {
      // Degrade gracefully to LRU cache
    }
    lru.set(key, value, { ttl: ttl * 1000 });
    return true;
  },

  async del(...keys) {
    try {
      if (isRedisAvailable() && keys.length > 0) {
        const redis = await getRedisClient();
        await redis.del(keys);
      }
    } catch (err) {
      // Invalidate LRU
    }
    for (const key of keys) {
      lru.delete(key);
    }
  },

  async invalidatePattern(pattern) {
    try {
      if (isRedisAvailable()) {
        const redis = await getRedisClient();
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(keys);
        }
      }
    } catch (err) {
      // Invalidate LRU matching pattern
    }
    // For LRU cache, we can match keys
    const regexPattern = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    for (const key of lru.keys()) {
      if (regexPattern.test(key)) {
        lru.delete(key);
      }
    }
  },

  async wrap(key, fn, ttl = DEFAULT_TTL) {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  },

  async flush() {
    try {
      if (isRedisAvailable()) {
        const redis = await getRedisClient();
        await redis.flushAll();
      }
    } catch (err) {}
    lru.clear();
    return true;
  }
};

export default cache;
