import { Queue, Worker } from "bullmq";
import LogEntry from "../models/LogEntryModel.js";
import { logger } from "../core/logger.js";
import "../config/env.js";

const hostParts = process.env.REDIS_HOST ? process.env.REDIS_HOST.split(":") : ["127.0.0.1"];
const host = hostParts[0];
const port = process.env.REDIS_PORT || hostParts[1] || 6379;
const password = process.env.REDIS_PASSWORD || undefined;

const connection = { host, port, password };

export const logQueue = new Queue("logs", { connection });

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
  { connection }
);

logger.info("Log BullMQ worker initialized");
