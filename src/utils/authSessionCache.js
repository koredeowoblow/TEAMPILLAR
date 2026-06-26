import { getRedisClient } from "../config/redis.js";
import { logger } from "../core/logger.js";
import AuthRepository from "../repository/AuthRepository.js";

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

export const invalidateAllUserSessionsCache = async (userId) => {
  try {
    const authRepo = new AuthRepository();
    const sessions = await authRepo.findByUserId(userId);
    if (!sessions || sessions.length === 0) return;
    
    const client = await getRedisClient();
    if (!client) return;

    const keys = sessions.map(s => sessionCacheKey(s.tokenHash)).filter(Boolean);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (err) {
    logger.warn(`Redis all user sessions delete failed: ${err.message}`);
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
