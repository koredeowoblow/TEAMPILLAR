import mongoose from "mongoose";
import { config } from "dotenv";

config({ path: ".env" });

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const PracticeSession = (await import("./src/models/PracticeSessionModel.js")).default;

  const session = await PracticeSession.findOne().sort({ createdAt: -1 }).lean();
  console.log(JSON.stringify(session, null, 2));

  mongoose.disconnect();
};

run().catch(console.error);
