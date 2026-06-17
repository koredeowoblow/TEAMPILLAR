import mongoose from "mongoose";
import PracticeSessionModel from "../src/models/PracticeSessionModel.js";
import UserModel from "../src/models/UserModel.js";
import MockTestService from "../src/services/MockTestService.js";
import { connectMongoDB } from "../src/config/mongodb.js";

async function run() {
  await connectMongoDB();
  const sessionId = "6a2c574648186ab62f778be7";
  console.log(`Recalculating session: ${sessionId}`);

  try {
    const session = await PracticeSessionModel.findById(sessionId);
    if (!session) {
      console.log("Session not found!");
      process.exit(1);
    }
    console.log(`Found session for user ${session.userId}`);
    
    // Set status to PENDING_GRADING so processScoring will run
    session.sessionStatus = "PENDING_GRADING";
    await session.save();

    await MockTestService.processScoring(session.userId, sessionId, session.responses, {
      tabSwitches: session.security?.tabSwitches || 0,
      ipAddress: session.security?.ipAddress || null
    });

    const updated = await PracticeSessionModel.findById(sessionId);
    console.log(`Recalculation complete. New Score: ${updated.compositeScore}, Status: ${updated.sessionStatus}`);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
