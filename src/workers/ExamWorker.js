import { Worker } from "bullmq";
import mongoose from "mongoose";
import PracticeSessionModel from "../models/PracticeSessionModel.js";

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  username: process.env.REDIS_USERNAME || "default",
  password: process.env.REDIS_PASSWORD || ""
};

const processFinalization = async (job) => {
  const { sessionId, deviceToken, finalizationKey, finalResponses, options } = job.data;
  
  const { getRedisClient } = await import("../config/redis.js");
  const redisClient = await getRedisClient();

  // Anti-Ghost Job Protection (Redis Deduplication)
  const jobDedupKey = `exam:job:finalize:${sessionId}`;
  const isDuplicateJob = await redisClient.setNX(jobDedupKey, "1");
  if (!isDuplicateJob) {
    console.log(`[ExamWorker] Ghost job intercepted for session ${sessionId}. Ignored.`);
    return { status: "IGNORED_GHOST_JOB" };
  }
  // Keep key alive for duration of exam window to block duplicates
  await redisClient.expire(jobDedupKey, 14400);

  // 1. Check MongoDB Idempotency Key
  const session = await PracticeSessionModel.findById(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // If already processed, exit gracefully
  if (session.security?.finalizationKey === finalizationKey || session.sessionStatus === "FINALIZED" || session.sessionStatus === "COMPLETED") {
    console.log(`[ExamWorker] Session ${sessionId} already finalized via ${finalizationKey}. Skipping.`);
    return { status: "ALREADY_FINALIZED" };
  }

  // 2. Perform DB Write using Transaction
  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();

    const { tabSwitches = 0, ipAddress = null, antiCheat = {} } = options;
    const violationsCount = antiCheat.violationsCount || tabSwitches || 0;
    const flagged = violationsCount > 3;

    // We do not run business logic here, we just persist the snapshot
    await PracticeSessionModel.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          sessionStatus: "COMPLETED", // Or PENDING_GRADING if scoring is separate
          responses: finalResponses,
          endTime: new Date(),
          "security.finalizationKey": finalizationKey,
          "security.tabSwitches": tabSwitches,
          "security.ipAddress": ipAddress,
          "security.flagged": flagged
        }
      },
      { session: dbSession, new: true }
    );

    // If scoring pipeline runs separately, we can trigger it here, or run it inline.
    // For separation of concerns, grading worker handles scoring later, this worker purely persists state.
    
    await dbSession.commitTransaction();
    console.log(`[ExamWorker] Session ${sessionId} successfully finalized.`);
    return { status: "SUCCESS" };

  } catch (error) {
    await dbSession.abortTransaction();
    console.error(`[ExamWorker] Transaction failed for session ${sessionId}:`, error);
    throw error; // Let BullMQ handle retry
  } finally {
    dbSession.endSession();
  }
};

export const examFinalizationWorker = new Worker("ExamFinalizationQueue", processFinalization, { connection });

examFinalizationWorker.on("completed", (job) => {
  console.log(`[ExamWorker] Job ${job.id} completed successfully.`);
});

examFinalizationWorker.on("failed", (job, err) => {
  console.error(`[ExamWorker] Job ${job.id} failed with error ${err.message}`);
});
