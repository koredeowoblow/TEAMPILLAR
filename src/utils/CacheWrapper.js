import { logger } from "../core/logger.js";
import { loadShield } from "../middlewares/LoadShield.js";

// Request Coalescing Map (In-Memory per Node instance)
const inFlightRequests = new Map();

/**
 * Safely fetches a value from Redis or degrades to a DB fallback seamlessly.
 * Implements Request Coalescing, Stale-While-Revalidate, and Distributed Locks.
 */
export async function getOrSetWithFallback(key, fallbackFn, ttl = 3600, version = 1, staleTtl = 86400) {
  const versionedKey = `${key}:v${version}`;
  const staleKey = `${versionedKey}:stale`;
  const lockKey = `${versionedKey}:lock`;

  // 1. Request Coalescing: Check if this node is already computing this key
  if (inFlightRequests.has(versionedKey)) {
    return inFlightRequests.get(versionedKey);
  }

  const computePromise = (async () => {
    // Dynamic import to avoid circular dependency loops
    const { getRedisClient } = await import("../config/redis.js");
    let redisClient;
    try {
      redisClient = await getRedisClient();
    } catch (err) {
      logger.error(`[Redis] Connection failure. Degrading to DB fallback for ${versionedKey}`);
    }

    // 2. Read Path with Schema Validation
    if (redisClient) {
      try {
        const cached = await redisClient.get(versionedKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === 'object' && parsed._generatedAt && parsed._cacheVersion === version && !parsed._error) {
              return parsed;
            }
          } catch (parseErr) {
            await redisClient.del(versionedKey).catch(() => {});
          }
        }
      } catch (err) {
        logger.warn(`Redis READ failed for ${versionedKey}, proceeding to fallback`, err);
      }
    }

    // 3. Stale-While-Revalidate (SWR) & Distributed Lock
    let hasLock = false;
    let staleData = null;
    const systemMode = loadShield.getMode();

    if (redisClient) {
      try {
        // Try to get stale fallback data
        const staleCached = await redisClient.get(staleKey);
        if (staleCached) {
          try {
            staleData = JSON.parse(staleCached);
          } catch (e) {}
        }

        // If in EMERGENCY mode and stale data exists, NEVER compute fallback.
        // Return stale data immediately to protect DB.
        if (systemMode === 'EMERGENCY' && staleData && !staleData._error) {
          return staleData;
        }

        // Try to acquire distributed lock
        const lockAcquired = await redisClient.set(lockKey, "1", { NX: true, EX: 15 });
        hasLock = lockAcquired === "OK";
      } catch (err) {
        // Fail-open if Redis crashes
      }
    }

    if (!hasLock) {
      // If we couldn't get the lock, someone else in the cluster is computing it.
      // If we have stale data, return it immediately (SWR mode)
      if (staleData && typeof staleData === 'object' && !staleData._error) {
        return staleData;
      }
      
      // If STRESS mode and no stale data, but locked, we still compute to avoid empty, 
      // but maybe we could fail gracefully if it was low priority.
    }

    try {
      // 4. Execute Safe Fallback
      // If in STRESS mode, we might want to increase TTL automatically
      const activeTtl = systemMode === 'STRESS' ? ttl * 2 : ttl;
      
      const freshData = await fallbackFn();

      // 5. Write Guarantee
      if (!freshData || freshData._error) {
        if (hasLock && redisClient) await redisClient.del(lockKey).catch(() => {});
        return freshData || {};
      }

      const payload = { ...freshData, _generatedAt: Date.now(), _cacheVersion: version };

      // 6. Write Path (Update active cache and stale fallback)
      if (redisClient) {
        try {
          await redisClient.setEx(versionedKey, activeTtl, JSON.stringify(payload));
          // Store a long-lived snapshot for stale-while-revalidate
          await redisClient.setEx(staleKey, staleTtl, JSON.stringify(payload));
        } catch (err) {
          logger.error(`Redis WRITE failed for ${versionedKey}`, err);
        }
      }

      if (hasLock && redisClient) await redisClient.del(lockKey).catch(() => {});
      return payload;

    } catch (fallbackErr) {
      if (hasLock && redisClient) await redisClient.del(lockKey).catch(() => {});
      if (staleData && typeof staleData === 'object' && !staleData._error) {
        return staleData; // Final protection: DB failed, return stale data
      }
      throw fallbackErr; // Absolute failure
    }
  })();

  // Map the promise for coalescing, remove when resolved
  inFlightRequests.set(versionedKey, computePromise);
  try {
    return await computePromise;
  } finally {
    inFlightRequests.delete(versionedKey);
  }
}
