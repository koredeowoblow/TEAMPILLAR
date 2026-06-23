import { Queue } from "bullmq";
import { logger } from "../core/logger.js";
import { sharedQueueConnection } from "../config/bullmqConnection.js";

export const watchdogQueue = new Queue("cluster-watchdog", { connection: sharedQueueConnection });

export const startWatchdogCron = async () => {
  // Add a repeatable job running every 10 seconds
  await watchdogQueue.add("run-watchdog", {}, {
    repeat: {
      every: 10000,
      limit: 100000 // effectively infinite
    },
    removeOnComplete: true,
    removeOnFail: true,
  });
  logger.info("Watchdog CRON schedule initialized (Every 10s)");
};
