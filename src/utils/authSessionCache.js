import { getRedisClient } from "../config/redis.js";
import { logger } from "../core/logger.js";

const sessionCacheKey = (tokenHash) => `auth:${tokenHash}`;
const touchCacheKey = (sessionId) => `touch:${sessionId}`;

export const getCachedSessionUser = async (tokenHash) => {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const data = await client.get(sessionCacheKey(tokenHash));
    if (!data) return null;
    
    // Refresh TTL on valid read (sliding expiration)
    await client.expire(sessionCacheKey(tokenHash), 600); // 10 minutes
    return JSON.parse(data);
  } catch (err) {
    logger.warn(`Redis session read failed: ${err.message}`);
    return null;
  }
};

export const setCachedSessionUser = async (tokenHash, payload) => {
  try {
    const client = await getRedisClient();
    if (!client) return;
    await client.setEx(sessionCacheKey(tokenHash), 600, JSON.stringify(payload)); // 10 minutes
  } catch (err) {
    logger.warn(`Redis session write failed: ${err.message}`);
  }
};

export const invalidateCachedSessionUser = async (tokenHash) => {
  try {
    const client = await getRedisClient();
    if (!client) return;
    await client.del(sessionCacheKey(tokenHash));
  } catch (err) {
    logger.warn(`Redis session delete failed: ${err.message}`);
  }
};

export const shouldSkipSessionTouch = async (sessionId) => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    const exists = await client.exists(touchCacheKey(sessionId));
    return exists === 1;
  } catch (err) {
    return false;
  }
};

export const markSessionTouch = async (sessionId) => {
  try {
    const client = await getRedisClient();
    if (!client) return;
    await client.setEx(touchCacheKey(sessionId), 30, "1"); // 30 seconds debounce
  } catch (err) {}
};
