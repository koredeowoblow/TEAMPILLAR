import { Worker } from "bullmq";
import { logger } from "../core/logger.js";
import { sharedQueueConnection } from "../config/bullmqConnection.js";

// Abstract the dynamic redis logic
export const startWatchdogWorker = async () => {
  const { getRedisClient } = await import("../config/redis.js");
  const redisClient = await getRedisClient();

  const watchdogWorker = new Worker("cluster-watchdog", async () => {
    try {
      const keys = await redisClient.keys('system:metrics:node:*');
      if (keys.length === 0) return; // No active nodes

      let totalDbLatency = 0;
      let validNodes = 0;
      const now = Date.now();

      for (const key of keys) {
        const metrics = await redisClient.hGetAll(key);
        // Ignore dead nodes (metrics older than 15s)
        if (metrics.timestamp && (now - parseInt(metrics.timestamp, 10)) < 15000) {
          totalDbLatency += parseInt(metrics.dbLatency || "0", 10);
          validNodes++;
        }
      }

      if (validNodes === 0) return;

      const avgDbLatency = totalDbLatency / validNodes;
      
      let currentMode = await redisClient.get('system:mode') || 'NORMAL';
      let recoveryTicks = parseInt(await redisClient.get('system:recovery_ticks') || "0", 10);

      if (avgDbLatency > 500 && currentMode !== 'EMERGENCY') {
        logger.warn(`Watchdog: Global DB Latency ${avgDbLatency}ms. Forcing EMERGENCY mode.`);
        await redisClient.set('system:mode', 'EMERGENCY');
        await redisClient.set('system:recovery_ticks', "0");
      } else if (avgDbLatency < 200 && currentMode === 'EMERGENCY') {
        recoveryTicks++;
        await redisClient.set('system:recovery_ticks', recoveryTicks.toString());
        logger.info(`Watchdog: EMERGENCY recovery tick ${recoveryTicks}/3`);
        
        if (recoveryTicks >= 3) { // 3 consecutive clean intervals (30s)
          logger.info(`Watchdog: Recovery complete. Stepping down to STRESS mode.`);
          await redisClient.set('system:mode', 'STRESS');
          await redisClient.set('system:recovery_ticks', "0");
        }
      } else if (avgDbLatency < 100 && currentMode === 'STRESS') {
        recoveryTicks++;
        await redisClient.set('system:recovery_ticks', recoveryTicks.toString());
        logger.info(`Watchdog: STRESS recovery tick ${recoveryTicks}/2`);
        
        if (recoveryTicks >= 2) { // 2 intervals for normal
          logger.info(`Watchdog: Full recovery. Restoring NORMAL mode.`);
          await redisClient.set('system:mode', 'NORMAL');
          await redisClient.set('system:recovery_ticks', "0");
        }
      } else if (avgDbLatency >= 200 && avgDbLatency <= 500 && currentMode !== 'STRESS' && currentMode !== 'EMERGENCY') {
          // Gradual degradation if DB gets moderately slow
          logger.warn(`Watchdog: Global DB Latency ${avgDbLatency}ms. Engaging STRESS mode.`);
          await redisClient.set('system:mode', 'STRESS');
          await redisClient.set('system:recovery_ticks', "0");
      }
    } catch (err) {
      logger.error("Watchdog execution failed:", err);
    }
  }, { 
    connection: sharedQueueConnection,
    concurrency: 1 
  });

  watchdogWorker.on("error", (err) => logger.warn(`[BullMQ] watchdogWorker error: ${err.message}`));
  
  logger.info("Watchdog Cluster Worker initialized");
};
