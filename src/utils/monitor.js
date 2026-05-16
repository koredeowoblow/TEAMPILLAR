import { logger } from "../core/logger.js";

export function logMemoryUsage() {
  const used = process.memoryUsage();
  const payload = {};

  for (const key of Object.keys(used)) {
    payload[key] = Math.round(used[key] / 1024 / 1024);
  }

  logger.info("Memory usage (MB)", payload);
}

export function startMemoryUsageMonitor(intervalMs = 5000) {
  const enabled = process.env.ENABLE_MEMORY_MONITOR === "true";
  if (!enabled || process.env.NODE_ENV === "production") {
    return null;
  }

  logMemoryUsage();
  const timer = setInterval(logMemoryUsage, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  return timer;
}
