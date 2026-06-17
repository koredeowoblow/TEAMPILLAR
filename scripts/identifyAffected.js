import mongoose from "mongoose";
import PracticeSessionModel from "../src/models/PracticeSessionModel.js";
import { connectMongoDB } from "../src/config/mongodb.js";
import QuestionModel from "../src/models/QuestionModel.js";

async function run() {
  await connectMongoDB();
  console.log("Querying completed mock test sessions...");
  
  const sessions = await PracticeSessionModel.find({
    isMockTest: true,
    sessionStatus: "COMPLETED"
  }).lean();

  let affectedCount = 0;
  const affectedStudents = new Set();
  let earliestDate = null;
  let latestDate = null;

  console.log(`Analyzing ${sessions.length} completed mock sessions...`);

  for (const session of sessions) {
    if (!session.subjectScores || session.subjectScores.length === 0) continue;

    // Fetch questions to determine actual total per subject
    const questions = await QuestionModel.find({ _id: { $in: session.questionIds } }).select("subjectId").lean();
    
    const actualTotals = {};
    for (const q of questions) {
      const sid = q.subjectId.toString();
      actualTotals[sid] = (actualTotals[sid] || 0) + 1;
    }

    let isAffected = false;
    for (const sub of session.subjectScores) {
      const actualTotal = actualTotals[sub.subjectId.toString()] || 0;
      if (sub.total > actualTotal) {
        isAffected = true;
        break;
      }
    }

    if (isAffected) {
      affectedCount++;
      affectedStudents.add(session.userId.toString());
      
      const createdAt = new Date(session.createdAt);
      if (!earliestDate || createdAt < earliestDate) earliestDate = createdAt;
      if (!latestDate || createdAt > latestDate) latestDate = createdAt;
    }
  }

  console.log("\n--- AUDIT REPORT ---");
  console.log(`Total Completed Mock Sessions Analyzed: ${sessions.length}`);
  console.log(`Affected Sessions Found: ${affectedCount}`);
  console.log(`Distinct Students Impacted: ${affectedStudents.size}`);
  console.log(`Date Range of Affected Sessions:`);
  console.log(`  From: ${earliestDate ? earliestDate.toISOString() : "N/A"}`);
  console.log(`  To:   ${latestDate ? latestDate.toISOString() : "N/A"}`);
  console.log("\n(Note: Session 6a2c574648186ab62f778be7 was manually recalculated and fixed during the initial investigation, so it is no longer counted as affected by this script).");

  process.exit(0);
}

run().catch(console.error);
