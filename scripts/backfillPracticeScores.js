import mongoose from "mongoose";
import PracticeSessionModel from "../src/models/PracticeSessionModel.js";
import { connectMongoDB } from "../src/config/mongodb.js";

const DRY_RUN = process.argv.includes("--apply") ? false : true;

async function run() {
  await connectMongoDB();
  console.log(`Starting Practice Mode Backfill Script (DRY RUN: ${DRY_RUN})`);
  
  // Find all standard practice sessions that are COMPLETED
  const sessions = await PracticeSessionModel.find({
    isMockTest: false,
    sessionStatus: "COMPLETED"
  }).lean();

  let updatedCount = 0;

  for (const session of sessions) {
    if (!session.questionIds || session.questionIds.length === 0) continue;

    const actualTotalQuestions = session.questionIds.length;
    const answeredQuestionsCount = session.responses ? session.responses.length : 0;

    // Only process sessions where the user didn't answer all questions
    if (answeredQuestionsCount >= actualTotalQuestions) continue;

    // Calculate correct answers
    const correctCount = (session.responses || []).filter(r => r.isCorrect === true || r.isCorrect === 'true').length;
    
    // Calculate what the score should have been based on the total questions in the session
    const correctAccuracy = Math.round((correctCount / actualTotalQuestions) * 100);
    
    // The buggy logic calculated accuracy based on answered questions
    const buggyTotalQuestions = answeredQuestionsCount > 0 ? answeredQuestionsCount : 1;
    const buggyAccuracy = Math.round((correctCount / buggyTotalQuestions) * 100);

    // If the stored score doesn't match the correct accuracy, it needs fixing
    if (session.score !== correctAccuracy) {
      updatedCount++;
      console.log(`\nFound affected practice session: ${session._id} (User: ${session.userId})`);
      console.log(`  Questions Answered: ${answeredQuestionsCount} / ${actualTotalQuestions}`);
      console.log(`  Old (Buggy) Score:  ${session.score}% (calculated out of ${buggyTotalQuestions})`);
      console.log(`  New (Correct) Score: ${correctAccuracy}% (calculated out of ${actualTotalQuestions})`);

      if (!DRY_RUN) {
        // Keep a backup of original score before overwriting
        await PracticeSessionModel.updateOne(
          { _id: session._id },
          { 
            $set: { 
              score: correctAccuracy,
              "analytics.accuracy": correctAccuracy,
              _backup_before_practice_bugfix: {
                score: session.score,
                accuracy: session.analytics?.accuracy
              }
            }
          }
        );
        console.log(`  ✅ Successfully updated practice score in database.`);
      }
    }
  }

  console.log(`\nBackfill complete. ${updatedCount} standard practice sessions ${DRY_RUN ? "would be updated" : "were updated"}.`);
  if (DRY_RUN) console.log("Run 'node scripts/backfillPracticeScores.js --apply' to execute the database writes.");

  process.exit(0);
}

run().catch(console.error);
