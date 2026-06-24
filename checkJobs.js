import "./src/config/env.js";
import { Queue } from "bullmq";
import { connectionConfig } from "./src/config/bullmqConnection.js";

const examFinalizationQueue = new Queue("ExamFinalizationQueue", { connection: connectionConfig });

async function checkQueue() {
  const completed = await examFinalizationQueue.getCompleted(0, 10);
  console.log("Completed jobs:");
  for (const job of completed) {
    console.log("Job ID:", job.id);
    console.log("Session ID:", job.data.sessionId);
    console.log("Return value:", job.returnvalue);
  }
  
  const failed = await examFinalizationQueue.getFailed(0, 10);
  console.log("\nFailed jobs:");
  for (const job of failed) {
    console.log("Job ID:", job.id);
    console.log("Session ID:", job.data.sessionId);
    console.log("Failed reason:", job.failedReason);
  }
  
  process.exit(0);
}

checkQueue();
