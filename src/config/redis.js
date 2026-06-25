import { Redis } from "ioredis";
import "./env.js"; // Load environment variables first

let redisClient = null;
let redisAvailable = false;

const initializeRedis = async () => {
  if (!redisClient) {
    try {
      // Parse REDIS_HOST in case it includes port
      let redisUrl;
      if (process.env.REDIS_URL) {
        redisUrl = process.env.REDIS_URL;
      } else {
        const hostParts = process.env.REDIS_HOST ? process.env.REDIS_HOST.split(":") : ["127.0.0.1"];
        const host = hostParts[0];
        const port = process.env.REDIS_PORT || hostParts[1] || 6379;
        const password = process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : "";
        const db = process.env.REDIS_DB || 0;
        redisUrl = `redis://${password}${host}:${port}/${db}`;
      }

      console.log("Connecting to Redis:", redisUrl.replace(/:([^:@]+)@/, ':***@'));

      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 10000,
        retryStrategy: (times) => {
          if (times > 5) {
            console.warn("Redis retry limit reached, giving up.");
            return null; // stop retrying after 5 attempts
          }
          return Math.min(times * 200, 2000);
        }
      });

      // Patch for backward compatibility with redis v4 node package
      redisClient.setEx = redisClient.setex.bind(redisClient);
      redisClient.setNX = redisClient.setnx.bind(redisClient);
      redisClient.hSet = redisClient.hset.bind(redisClient);
      redisClient.hGet = redisClient.hget.bind(redisClient);
      redisClient.hGetAll = redisClient.hgetall.bind(redisClient);
      redisClient.expireAt = redisClient.expireat.bind(redisClient);
      redisClient.sRandMemberCount = redisClient.srandmember.bind(redisClient);
      redisClient.sInter = redisClient.sinter.bind(redisClient);
      redisClient.isOpen = true; // Mock isOpen since ioredis doesn't have it natively
      
      const originalQuit = redisClient.quit.bind(redisClient);
      redisClient.quit = async () => {
        redisClient.isOpen = false;
        return originalQuit();
      };

      const originalConnect = redisClient.connect.bind(redisClient);
      redisClient.connect = async () => {
        if (!redisAvailable) {
          await originalConnect();
        }
      };

      redisClient.on("error", (err) => {
        console.error("Redis connection error:", err.message);
        redisAvailable = false;
      });

      redisClient.on("connect", () => {
        console.log("Connected to Redis successfully");
        redisAvailable = true;
      });

      redisClient.on("ready", () => {
        console.log("Redis client ready");
        redisAvailable = true;
        redisClient.isOpen = true;
      });

      redisClient.on("end", () => {
        console.log("Redis connection closed");
        redisAvailable = false;
        redisClient.isOpen = false;
      });

      await redisClient.connect();
      redisAvailable = true;
    } catch (error) {
      console.error("Failed to connect to Redis:", error.message);
      console.warn("⚠️ Redis unavailable - OTP functionality will use in-memory fallback");
      redisAvailable = false;
      redisClient = null;
    }
  }
  return redisClient;
};

const getRedisClient = async () => {
  if (!redisClient || !redisClient.isOpen) {
    await initializeRedis();
  }
  return redisClient;
};

const isRedisAvailable = () => redisAvailable;

const closeRedis = async () => {
  if (redisClient) {
    try {
      if (redisClient.isOpen) {
        await redisClient.quit();
      }
    } catch (err) {
      console.error("Error closing Redis connection:", err.message);
    } finally {
      redisClient = null;
      redisAvailable = false;
    }
  }
};

export { getRedisClient, initializeRedis, isRedisAvailable, closeRedis, redisClient };
