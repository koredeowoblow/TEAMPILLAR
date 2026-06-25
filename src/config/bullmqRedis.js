import { Redis } from "ioredis";
import "./env.js";

// Parse REDIS_HOST in case it includes port or REDIS_URL is used
const getRedisUrl = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  const hostParts = process.env.REDIS_HOST ? process.env.REDIS_HOST.split(":") : ["127.0.0.1"];
  const host = hostParts[0];
  const port = process.env.REDIS_PORT || hostParts[1] || 6379;
  const password = process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : "";
  const db = process.env.REDIS_DB || 0;
  return `redis://${password}${host}:${port}/${db}`;
};

const bullmqRedis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,    // required by BullMQ
  lazyConnect: true,
});

bullmqRedis.on("error", (err) => {
  // Log but do not crash — BullMQ handles reconnection
  console.warn("[BullMQ Shared Redis] connection error:", err.message);
});

export default bullmqRedis;
