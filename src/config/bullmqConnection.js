import { Redis } from "ioredis";
import "./env.js";

const hostParts = process.env.REDIS_HOST ? process.env.REDIS_HOST.split(":") : ["127.0.0.1"];
const host = hostParts[0];
const port = process.env.REDIS_PORT || hostParts[1] || 6379;
const password = process.env.REDIS_PASSWORD || undefined;

// Shared connection for all Queues
export const sharedQueueConnection = new Redis({
  host,
  port,
  password,
  maxRetriesPerRequest: null,
});

sharedQueueConnection.on("error", (err) => {
  console.warn("[BullMQ Redis Error] Non-fatal connection error:", err.message);
});

// We can reuse the connection for queues, but workers require their own blocking connection.
// So we export the config so workers can instantiate their own.
export const connectionConfig = {
  host,
  port,
  password,
};
