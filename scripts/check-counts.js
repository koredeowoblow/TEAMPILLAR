import mongoose from "mongoose";
import PracticeSessionModel from "../src/models/PracticeSessionModel.js";
import { connectMongoDB } from "../src/config/mongodb.js";
import QuestionModel from "../src/models/QuestionModel.js";

async function run() {
  await connectMongoDB();
  const sessionId = "6a2c574648186ab62f778be7";
  const session = await PracticeSessionModel.findById(sessionId).lean();
  
  if (!session) {
    console.log("Not found");
    process.exit(0);
  }

  console.log("Total Question IDs:", session.questionIds.length);
  console.log("Total Responses:", session.responses.length);
  console.log("Subject IDs:", session.subjectIds.length);

  const qCounts = {};
  const questions = await QuestionModel.find({ _id: { $in: session.questionIds } }).lean();
  
  for (const q of questions) {
    const sid = q.subjectId.toString();
    qCounts[sid] = (qCounts[sid] || 0) + 1;
  }
  
  console.log("Questions per subject ID:", qCounts);

  const subjectScores = session.subjectScores || [];
  console.log("Subject Scores:", JSON.stringify(subjectScores, null, 2));

  process.exit(0);
}

run();
