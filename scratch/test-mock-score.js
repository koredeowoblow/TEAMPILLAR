import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/teampillar";

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const PracticeSessionModel = (await import("../src/models/PracticeSessionModel.js")).default;
  const Question = (await import("../src/models/QuestionModel.js")).default;

  const session = await PracticeSessionModel.findOne({ _id: "6a2c574648186ab62f778be7" });
  if (!session) {
    console.log("Session not found");
    process.exit(1);
  }

  console.log("Session subjectIds length:", session.subjectIds.length);
  console.log("Session questionIds length:", session.questionIds.length);

  const questions = await Question.find({ _id: { $in: session.questionIds } }).lean();
  console.log("Found questions:", questions.length);

  if (questions.length > 0) {
    const q = questions[0];
    console.log("q.options sample:", JSON.stringify(q.options, null, 2));
    
    const correctOption = Array.isArray(q.options) ? q.options.find(o => o.isCorrect) : null;
    console.log("Correct Option found:", !!correctOption);
    if (correctOption) {
       console.log("correctOption.id:", correctOption.id);
       console.log("correctOption.key:", correctOption.key);
    }
  }

  process.exit(0);
}

run().catch(console.error);
