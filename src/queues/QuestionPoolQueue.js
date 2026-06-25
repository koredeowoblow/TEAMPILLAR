import { Queue, Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { logger } from "../core/logger.js";
import QuestionPoolService from "../services/QuestionPoolService.js";
import bullmqRedis from "../config/bullmqRedis.js";

const redisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

export const questionPoolQueue = new Queue("question-pool", {
  connection: redisOptions,
});

export const questionPoolWorker = new Worker("question-pool", async (job) => {
  const { type, subjectId } = job.data;
  
  try {
    logger.info(`QuestionPoolWorker starting job: ${type} ${subjectId ? 'for subject ' + subjectId : ''}`);
    
    if (type === "REBUILD_ALL") {
      await QuestionPoolService.rebuildAllPools();
    } else if (type === "REBUILD_SUBJECT" && subjectId) {
      await QuestionPoolService.rebuildSubjectPool(subjectId);
    }
    
    logger.info(`QuestionPoolWorker finished job: ${type}`);
  } catch (err) {
    logger.error(`QuestionPoolWorker failed job ${job.id}:`, err);
    throw err;
  }
}, { connection: redisOptions, concurrency: 1 });

questionPoolWorker.on("failed", (job, err) => {
  logger.error(`QuestionPool Job ${job?.id} failed:`, err);
});
