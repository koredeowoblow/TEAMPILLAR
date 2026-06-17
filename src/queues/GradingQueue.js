import { Queue, Worker } from "bullmq";
import { logger } from "../core/logger.js";
import "../config/env.js";

const hostParts = process.env.REDIS_HOST ? process.env.REDIS_HOST.split(":") : ["127.0.0.1"];
const host = hostParts[0];
const port = process.env.REDIS_PORT || hostParts[1] || 6379;
const password = process.env.REDIS_PASSWORD || undefined;

const connection = { host, port, password };

export const gradingQueue = new Queue("grading", { connection });
export const scoreQueue = new Queue("scoring", { connection });

export function addScoreJob(userId, sessionId, responses, options) {
  scoreQueue.add("scoring.process", { userId, sessionId, responses, options }, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }
  }).catch((err) => {
    logger.error(`Failed to queue score job for session ${sessionId}:`, { error: err.message });
  });
  logger.info(`Queued score job for session ${sessionId}.`);
}

export function addGradingJob(userId, subjectIds, processedResponses) {
  gradingQueue.add("grading.process", { userId, subjectIds, processedResponses }, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }
  }).catch((err) => {
    logger.error(`Failed to queue grading job for user ${userId}:`, { error: err.message });
  });
  logger.info(`Queued grading job for user ${userId}.`);
}

export const gradingWorker = new Worker("grading", async (job) => {
  logger.info(`Processing grading job for user ${job.data.userId}...`);
  try {
    const { userId, subjectIds, processedResponses } = job.data;
    const { default: AdaptiveEngineService } = await import("../services/AdaptiveEngineService.js");

    for (const sid of subjectIds) {
      await AdaptiveEngineService.updateTopicPerformance(userId, processedResponses, sid);
    }
    
    logger.info(`Successfully processed grading job for user ${userId}`);
  } catch (error) {
    logger.error(`Error processing grading job for user ${job.data.userId}: ${error.message}`);
    throw error;
  }
}, { 
  connection,
  concurrency: 10 // High throughput for DB operations
});

gradingWorker.on('failed', (job, err) => {
  logger.error(`Grading job ${job?.id} failed: ${err.message}`);
});

logger.info("Grading BullMQ worker initialized");

export const scoreWorker = new Worker("scoring", async (job) => {
  logger.info(`Processing score job for session ${job.data.sessionId}...`);
  try {
    const { userId, sessionId, responses, options } = job.data;
    const { default: MockTestService } = await import("../services/MockTestService.js");
    await MockTestService.processScoring(userId, sessionId, responses, options);
    logger.info(`Successfully processed score job for session ${sessionId}`);
  } catch (error) {
    logger.error(`Error processing score job for session ${job.data.sessionId}: ${error.message}`);
    throw error;
  }
}, { 
  connection,
  concurrency: 50 // High concurrency since it's mostly computation and DB writes
});

scoreWorker.on('failed', (job, err) => {
  logger.error(`Score job ${job?.id} failed: ${err.message}`);
});

logger.info("Scoring BullMQ worker initialized");
