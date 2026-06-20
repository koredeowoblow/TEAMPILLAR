import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import dns from "node:dns";
import Question from "../src/models/QuestionModel.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: "teampillar" });
  const docs = await Question.find().limit(20).lean();
  console.log(JSON.stringify(docs, null, 2));
  await mongoose.disconnect();
}
run();
