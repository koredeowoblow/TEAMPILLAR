import "./src/config/env.js";
import { connectMongoDB } from "./src/config/mongodb.js";
import PracticeSession from "./src/models/PracticeSessionModel.js";

async function checkLatest() {
  await connectMongoDB();
  const session = await PracticeSession.findOne().sort({ createdAt: -1 });
  console.log("Session ID:", session._id);
  console.log("Status:", session.sessionStatus);
  console.log("Responses length:", session.responses ? session.responses.length : 0);
  console.log("Score:", session.score);
  console.log("Composite Score:", session.compositeScore);
  process.exit(0);
}

checkLatest();
