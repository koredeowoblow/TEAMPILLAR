import { Queue, Worker } from "bullmq";
import LogEntry from "../models/LogEntryModel.js";
import { logger } from "../core/logger.js";
import "../config/env.js";

import { sharedQueueConnection, connectionConfig } from "../config/bullmqConnection.js";

export const logQueue = new Queue("logs", { connection: sharedQueueConnection });

logQueue.on("error", (err) => logger.warn(`[BullMQ] logQueue error: ${err.message}`));

export const logWorker = new Worker(
  "logs",
  async (job) => {
    try {
      if (job.name === "log.create") {
        await LogEntry.create(job.data);
      }
    } catch (error) {
      logger.error(`Error processing job ${job.name} in logQueue:`, { message: error.message });
    }
  },
  { connection: sharedQueueConnection }
);

logWorker.on("error", (err) => logger.warn(`[BullMQ] logWorker connection error: ${err.message}`));

logger.info("Log BullMQ worker initialized");
