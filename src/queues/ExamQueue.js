import { Queue } from "bullmq";
// We might need to abstract the exact connection if the project has a different structure.
// For now, using a standard BullMQ pattern.
const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  username: process.env.REDIS_USERNAME || "default",
  password: process.env.REDIS_PASSWORD || ""
};

export const examFinalizationQueue = new Queue("ExamFinalizationQueue", {
  connection,
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
