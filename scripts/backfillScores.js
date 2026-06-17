import mongoose from "mongoose";
import PracticeSessionModel from "../src/models/PracticeSessionModel.js";
import { connectMongoDB } from "../src/config/mongodb.js";
import QuestionModel from "../src/models/QuestionModel.js";

const DRY_RUN = process.argv.includes("--apply") ? false : true;

async function run() {
  await connectMongoDB();
  console.log(`Starting Mock Test Backfill Script (DRY RUN: ${DRY_RUN})`);
  
  const sessions = await PracticeSessionModel.find({
    isMockTest: true,
    sessionStatus: "COMPLETED"
  }).lean();

  let updatedCount = 0;

  for (const session of sessions) {
    if (!session.subjectScores || session.subjectScores.length === 0) continue;

    // Fetch questions to determine actual total per subject
    const questions = await QuestionModel.find({ _id: { $in: session.questionIds } }).select("subjectId").lean();
    
    const actualTotals = {};
    for (const q of questions) {
      const sid = q.subjectId.toString();
      actualTotals[sid] = (actualTotals[sid] || 0) + 1;
    }

    let needsUpdate = false;
    let newCompositeScore = 0;
    const newSubjectScores = [];

    for (const sub of session.subjectScores) {
      const actualTotal = actualTotals[sub.subjectId.toString()] || 0;
      
      let newTotal = sub.total;
      if (sub.total > actualTotal) {
        needsUpdate = true;
        newTotal = actualTotal;
      }

      const newScore = newTotal > 0 ? Math.round((sub.correct / newTotal) * 100) : 0;
      newCompositeScore += newScore;

      newSubjectScores.push({
        ...sub,
        total: newTotal,
        score: newScore
      });
    }

    if (needsUpdate || newCompositeScore !== session.compositeScore) {
      updatedCount++;
      console.log(`\nFound affected session: ${session._id} (User: ${session.userId})`);
      console.log(`  Old Composite Score: ${session.compositeScore}`);
      console.log(`  New Composite Score: ${newCompositeScore}`);

      for (let i = 0; i < session.subjectScores.length; i++) {
        const oldSub = session.subjectScores[i];
        const newSub = newSubjectScores[i];
        if (oldSub.total !== newSub.total || oldSub.score !== newSub.score) {
          console.log(`  [Subject ${newSub.subjectName}]: Correct=${newSub.correct}, Total ${oldSub.total} -> ${newSub.total}, Score ${oldSub.score} -> ${newSub.score}`);
        }
      }

      if (!DRY_RUN) {
        // Keep a backup of original before overwriting
        const backupSession = { ...session };
        await PracticeSessionModel.updateOne(
          { _id: session._id },
          { 
            $set: { 
              compositeScore: newCompositeScore,
              score: newCompositeScore,
              subjectScores: newSubjectScores,
              _backup_before_bugfix: backupSession.subjectScores // Store backup in a custom field
            }
          }
        );
        console.log(`  ✅ Successfully updated in database.`);
      }
    }
  }

  console.log(`\nBackfill complete. ${updatedCount} sessions ${DRY_RUN ? "would be updated" : "were updated"}.`);
  if (DRY_RUN) console.log("Run with --apply to execute the database writes.");

  process.exit(0);
}

run().catch(console.error);
