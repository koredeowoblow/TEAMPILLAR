import { logger } from "../core/logger.js";

export function measurePerformance(fn, label) {
  return async function measuredFunction(...args) {
    const start = process.hrtime.bigint();

    try {
      return await fn.apply(this, args);
    } finally {
      const end = process.hrtime.bigint();
      if (process.env.NODE_ENV !== "production") {
        logger.info(`${label}: ${Number(end - start) / 1000000}ms`);
      }
    }
  };
}
