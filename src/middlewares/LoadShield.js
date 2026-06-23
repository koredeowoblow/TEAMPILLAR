import { logger } from "../core/logger.js";
import mongoose from "mongoose";
import os from "os";

class AdaptiveLoadShield {
  constructor() {
    this.mode = 'NORMAL'; // Fallback if Redis is down
    this.redisClient = null;
    
    // Concurrency Caps per Cluster Node instance (global limits enforced via Redis, these are local fallbacks)
    this.globalCaps = {
      HIGH: Infinity, 
      MEDIUM: 500,    
      LOW: 100         
    };

    this.init();
  }

  async init() {
    try {
      const { getRedisClient } = await import("../config/redis.js");
      this.redisClient = await getRedisClient();
      
      // Background metric loop
      setInterval(() => this.reportMetricsToCluster(), 5000);
    } catch (err) {
      logger.warn("LoadShield running in standalone mode (Redis unavailable)");
      setInterval(() => this.standaloneHealthCheck(), 5000);
    }
  }

  getMode() {
    return this.mode;
  }

  async pingDatabase() {
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      return Date.now() - start;
    } catch (err) {
      return 10000; // Simulated high latency if dead
    }
  }

  getEventLoopLag() {
    return new Promise(resolve => {
      const start = Date.now();
      setTimeout(() => resolve(Math.max(0, Date.now() - start - 0)), 0);
    });
  }

  async reportMetricsToCluster() {
    if (!this.redisClient) return this.standaloneHealthCheck();

    try {
      // 1. Report Local Metrics
      const lag = await this.getEventLoopLag();
      const dbLatency = await this.pingDatabase();
      const hostname = os.hostname();

      // We use string values for hSet
      await this.redisClient.hSet(`system:metrics:node:${hostname}`, {
        lag: lag.toString(),
        dbLatency: dbLatency.toString(),
        timestamp: Date.now().toString()
      });
      // Set expiration so dead nodes are cleaned up
      await this.redisClient.expire(`system:metrics:node:${hostname}`, 30);

      // 2. Sync Global State
      const globalMode = await this.redisClient.get('system:mode');
      if (globalMode && globalMode !== this.mode) {
        logger.info(`🛡️ CLUSTER SYNC: Mode changed from ${this.mode} to ${globalMode}`);
        this.mode = globalMode;
      }
    } catch (err) {
      logger.error("Failed to sync cluster metrics", err);
    }
  }

  async standaloneHealthCheck() {
    const dbLatency = await this.pingDatabase();
    if (dbLatency > 500) this.mode = 'EMERGENCY';
    else if (dbLatency > 150) this.mode = 'STRESS';
    else this.mode = 'NORMAL';
  }

  /**
   * Express Middleware to enforce load shedding & prioritization
   */
  enforce(priority) {
    return async (req, res, next) => {
      if (priority === 'HIGH') return next();

      if (this.mode === 'EMERGENCY' && priority === 'LOW') {
        return res.status(503).json({ 
          error: "System under heavy load", 
          message: "Analytics & Reports are temporarily disabled to ensure exam stability. Please try again later.",
          _degraded: true 
        });
      }

      if (!this.redisClient) {
        // Fallback to accepting if redis is down
        return next();
      }

      try {
        const counterKey = `system:concurrency:${priority}`;
        const currentGlobal = await this.redisClient.incr(counterKey);
        await this.redisClient.expire(counterKey, 60); // Anti-leak
  
        if (currentGlobal > this.globalCaps[priority]) {
          await this.redisClient.decr(counterKey).catch(()=>{});
          return res.status(429).json({ 
            error: "Too Many Requests", 
            message: "Please hold on while we process your request.",
            _degraded: true
          });
        }
  
        res.on('finish', () => this.redisClient.decr(counterKey).catch(()=>{}));
        res.on('close', () => {
          if (!res.writableFinished) this.redisClient.decr(counterKey).catch(()=>{});
        });
  
        req.systemMode = this.mode; 
        next();
      } catch (err) {
        // Fail open if redis crashes
        next();
      }
    };
  }
}

export const loadShield = new AdaptiveLoadShield();
