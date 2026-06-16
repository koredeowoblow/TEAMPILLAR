import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient, isRedisAvailable } from "../config/redis.js";
import { logger } from "../core/logger.js";

// Build a Redis store if Redis is available
const getStore = async (prefix) => {
  if (!isRedisAvailable()) return undefined; // falls back to in-memory
  const client = await getRedisClient();
  if (!client) return undefined;
  return new RedisStore({
    sendCommand: (...args) => client.sendCommand(args),
    prefix: `rl:${prefix}:`,
  });
};

// Initialize stores asynchronously
let authStore, paymentStore, chatStore, generalStore, adminStore;
let hasWarnedFallback = false;

const warnFallbackOnce = () => {
  if (hasWarnedFallback) return;
  hasWarnedFallback = true;
  logger.warn("Rate limiter is using in-memory fallback store until Redis is ready");
};

const attachStoresWhenRedisReady = async () => {
  try {
    const client = await getRedisClient();
    if (!client) {
      warnFallbackOnce();
      return;
    }

    const attach = async () => {
      authStore = await getStore("auth");
      paymentStore = await getStore("payment");
      chatStore = await getStore("chat");
      generalStore = await getStore("general");
      adminStore = await getStore("admin");
      logger.info("Rate limiter Redis stores attached");
    };

    if (client.isReady) {
      await attach();
    } else {
      client.once("ready", () => {
        attach().catch((err) => {
          warnFallbackOnce();
          logger.error("Failed to attach rate limiter Redis stores", { message: err.message });
        });
      });
      warnFallbackOnce();
    }

    client.on("end", () => {
      authStore = undefined;
      paymentStore = undefined;
      chatStore = undefined;
      generalStore = undefined;
      adminStore = undefined;
      warnFallbackOnce();
    });
  } catch (_err) {
    warnFallbackOnce();
  }
};

(async () => {
  await attachStoresWhenRedisReady();
})();

const handler = (req, res, _next, options) => {
  // Add Retry-After header based on windowMs
  const retryAfter = Math.ceil(options.windowMs / 1000);
  res.setHeader("Retry-After", retryAfter);
  
  res.status(options.statusCode).json({
    success: false,
    message: options.message,
    retryAfter: retryAfter
  });
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many failed attempts. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === "test",
  handler,
  get store() {
    if (!authStore) warnFallbackOnce();
    return authStore;
  },
});

export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many failed payment attempts. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === "test",
  handler,
  get store() {
    if (!paymentStore) warnFallbackOnce();
    return paymentStore;
  },
});

export const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: "Too many messages sent. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === "test",
  handler,
  get store() {
    if (!chatStore) warnFallbackOnce();
    return chatStore;
  },
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many failed requests. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === "test",
  handler,
  get store() {
    if (!generalStore) warnFallbackOnce();
    return generalStore;
  },
});

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many failed admin requests. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === "test",
  handler,
  get store() {
    if (!adminStore) warnFallbackOnce();
    return adminStore;
  },
});
