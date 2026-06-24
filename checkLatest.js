import "./src/config/env.js";
import { connectMongoDB } from "./src/config/mongodb.js";
import PracticeSession from "./src/models/PracticeSessionModel.js";

async function checkLatest() {
  await connectMongoDB();
  const sessions = await PracticeSession.find().sort({ createdAt: -1 }).limit(5);
  for (const session of sessions) {
    console.log("-----------------------");
    console.log("Session ID:", session._id);
    console.log("Mock Test:", session.isMockTest);
    console.log("Status:", session.sessionStatus);
    console.log("Responses length:", session.responses ? session.responses.length : 0);
  }
  process.exit(0);
}

checkLatest();
