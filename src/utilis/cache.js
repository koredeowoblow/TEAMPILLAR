import { LRUCache } from "lru-cache";
import { getRedisClient, isRedisAvailable } from "../config/redis.js";

const lru = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });

const get = async (key) => {
  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      const v = await redis.get(key);
      return v ? JSON.parse(v) : null;
    }
  } catch (err) {
    // fall through to LRU
  }
  return lru.get(key) ?? null;
};

const set = async (key, value, ttlSeconds = 3600) => {
  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
      return true;
    }
  } catch (err) {}
  lru.set(key, value);
  return true;
};

export default { get, set };
