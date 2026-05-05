import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient, isRedisAvailable } from "../Config/redis.js";
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
let authStore, otpStore, apiStore, passwordResetStore;
let hasWarnedFallback = false;

const warnFallbackOnce = () => {
  if (hasWarnedFallback) return;
  hasWarnedFallback = true;
  logger.warn(
    "Rate limiter is using in-memory fallback store until Redis is ready",
  );
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
      otpStore = await getStore("otp");
      apiStore = await getStore("api");
      passwordResetStore = await getStore("pwreset");
      logger.info("Rate limiter Redis stores attached");
    };

    if (client.isReady) {
      await attach();
    } else {
      client.once("ready", () => {
        attach().catch((err) => {
          warnFallbackOnce();
          logger.error("Failed to attach rate limiter Redis stores", {
            message: err.message,
          });
        });
      });
      warnFallbackOnce();
    }

    client.on("end", () => {
      authStore = undefined;
      otpStore = undefined;
      apiStore = undefined;
      passwordResetStore = undefined;
      warnFallbackOnce();
    });
  } catch (_err) {
    warnFallbackOnce();
  }
};

(async () => {
  await attachStoresWhenRedisReady();
})();

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many attempts from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  get store() {
    if (!authStore) warnFallbackOnce();
    return authStore;
  },
});

// Rate limiter for OTP verification (stricter)
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per window
  message: "Too many verification attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  get store() {
    if (!otpStore) warnFallbackOnce();
    return otpStore;
  },
});

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: "Too many requests from this IP, please slow down",
  standardHeaders: true,
  legacyHeaders: false,
  get store() {
    if (!apiStore) warnFallbackOnce();
    return apiStore;
  },
});

// Password reset rate limiter (prevent abuse)
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset requests per hour
  message: "Too many password reset requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  get store() {
    if (!passwordResetStore) warnFallbackOnce();
    return passwordResetStore;
  },
});
