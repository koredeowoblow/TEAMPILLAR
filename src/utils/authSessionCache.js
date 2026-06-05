import { LRUCache } from "lru-cache";

const sessionCache = new LRUCache({
  max: 2000,
  ttl: 5 * 1000, // Reduced from 60s to 5s for near-instant revocation
  updateAgeOnGet: false,
});

const touchThrottleCache = new LRUCache({
  max: 5000,
  ttl: 30 * 1000,
  updateAgeOnGet: false,
});

const sessionCacheKey = (tokenHash) => `auth:${tokenHash}`;
const touchCacheKey = (sessionId) => `touch:${sessionId}`;

export const getCachedSessionUser = (tokenHash) =>
  sessionCache.get(sessionCacheKey(tokenHash));

export const setCachedSessionUser = (tokenHash, payload) => {
  sessionCache.set(sessionCacheKey(tokenHash), payload);
};

export const invalidateCachedSessionUser = (tokenHash) => {
  sessionCache.delete(sessionCacheKey(tokenHash));
};

export const shouldSkipSessionTouch = (sessionId) =>
  touchThrottleCache.has(touchCacheKey(sessionId));

export const markSessionTouch = (sessionId) => {
  touchThrottleCache.set(touchCacheKey(sessionId), true);
};
