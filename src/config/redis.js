import { createClient } from "redis";
import "./env.js"; // Load environment variables first

let redisClient = null;
let redisAvailable = false;

const initializeRedis = async () => {
  if (!redisClient) {
    try {
      // Parse REDIS_HOST in case it includes port
      const hostParts = process.env.REDIS_HOST.split(":");
      const host = hostParts[0];
      const port = process.env.REDIS_PORT || hostParts[1] || 6379;

      const redisUrl = `redis://:${process.env.REDIS_PASSWORD}@${host}:${port}/${process.env.REDIS_DB || 0}`;

      console.log(
        "Connecting to Redis:",
        `redis://:***@${host}:${port}/${process.env.REDIS_DB || 0}`,
      );

      redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 10000,
          lazyConnect: true,
        },
      });

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
      });

      redisClient.on("end", () => {
        console.log("Redis connection closed");
        redisAvailable = false;
      });

      await redisClient.connect();
      redisAvailable = true;
    } catch (error) {
      console.error("Failed to connect to Redis:", error.message);
      console.warn(
        "⚠️ Redis unavailable - OTP functionality will use in-memory fallback",
      );
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

export { getRedisClient, initializeRedis, isRedisAvailable, closeRedis };
