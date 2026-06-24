import "./src/config/env.js";
import { connectMongoDB } from "./src/config/mongodb.js";
import mongoose from "mongoose";
import PracticeSessionModel from "./src/models/PracticeSessionModel.js";

async function testFinalize() {
  await connectMongoDB();
  
  const sessionId = "6a3c5fd7ed1e07b8691a9ade";
  const finalResponses = [{ questionId: new mongoose.Types.ObjectId(), selectedOption: "A" }];
  const options = { tabSwitches: 0, ipAddress: "127.0.0.1", antiCheat: {} };
  
  const { getRedisClient } = await import("./src/config/redis.js");
  const redisClient = await getRedisClient();

  const jobDedupKey = `exam:job:finalize:${sessionId}_test2`;
  const isDuplicateJob = await redisClient.setNX(jobDedupKey, "1");
  if (!isDuplicateJob) {
    console.log(`[ExamWorker] Ghost job intercepted for session ${sessionId}. Ignored.`);
    return;
  }
  await redisClient.expire(jobDedupKey, 14400);

  const session = await PracticeSessionModel.findById(sessionId);
  if (!session) {
    console.error(`Session ${sessionId} not found`);
    return;
  }

  const finalizationKey = "test_key_123";
  if (session.security?.finalizationKey === finalizationKey || session.sessionStatus === "FINALIZED" || session.sessionStatus === "COMPLETED") {
    console.log(`[ExamWorker] Session ${sessionId} already finalized via ${finalizationKey}. Skipping.`);
    return;
  }

  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();

    await PracticeSessionModel.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          sessionStatus: "PENDING_GRADING",
          responses: finalResponses,
          endTime: new Date(),
          "security.finalizationKey": finalizationKey,
          "security.tabSwitches": options.tabSwitches,
          "security.ipAddress": options.ipAddress,
          "security.flagged": false
        }
      },
      { session: dbSession, new: true }
    );

    await dbSession.commitTransaction();
    console.log(`[ExamWorker] Session ${sessionId} successfully finalized.`);

  } catch (error) {
    await dbSession.abortTransaction();
    console.error(`[ExamWorker] Transaction failed for session ${sessionId}:`, error);
  } finally {
    dbSession.endSession();
  }
  
  process.exit(0);
}

testFinalize();
