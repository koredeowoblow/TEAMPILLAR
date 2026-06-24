import "./src/config/env.js";
import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  username: process.env.REDIS_USERNAME || "default",
  password: process.env.REDIS_PASSWORD || ""
};

const examFinalizationQueue = new Queue("ExamFinalizationQueue", { connection });

async function checkQueue() {
  const waiting = await examFinalizationQueue.getWaitingCount();
  const active = await examFinalizationQueue.getActiveCount();
  const completed = await examFinalizationQueue.getCompletedCount();
  const failed = await examFinalizationQueue.getFailedCount();
  
  console.log("ExamFinalizationQueue counts:");
  console.log("Waiting:", waiting);
  console.log("Active:", active);
  console.log("Completed:", completed);
  console.log("Failed:", failed);
  
  if (failed > 0) {
    const failedJobs = await examFinalizationQueue.getFailed();
    console.log("Failed job reasons:", failedJobs.map(j => j.failedReason));
  }
  
  process.exit(0);
}

checkQueue();
