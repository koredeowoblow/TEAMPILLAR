import "./src/config/env.js";
import { connectMongoDB } from "./src/config/mongodb.js";
import PracticeSessionModel from "./src/models/PracticeSessionModel.js";

async function run() {
  await connectMongoDB();
  const latest = await PracticeSessionModel.findOne().sort({ createdAt: -1 }).lean();
  console.log(JSON.stringify(latest, null, 2));
  process.exit(0);
}

run();
