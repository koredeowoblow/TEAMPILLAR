import { Queue } from "bullmq";
import bullmqRedis from "../config/bullmqRedis.js";

export const examFinalizationQueue = new Queue("ExamFinalizationQueue", {
  connection: bullmqRedis, sharedConnection: true,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep for audit logs
  },
});

export const addFinalizationJob = async (jobData) => {
  return await examFinalizationQueue.add("finalize-exam", jobData, {
    jobId: `finalize:${jobData.sessionId}:${jobData.finalizationKey}` // Built-in job deduplication
  });
};
