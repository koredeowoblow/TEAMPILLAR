import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import dns from "node:dns";

import Question from "../src/models/QuestionModel.js";
import QuestionExplanationService from "../src/services/QuestionExplanationService.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const limitArgIndex = args.indexOf("--limit");
  const limit = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : 50;

  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error("MONGO_URI missing from .env");

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri, { dbName: "teampillar" });
    console.log("✅ Connected to MongoDB");

    const query = {
      $or: [
        { explanationStatus: "pending" },
        { explanationStatus: { $exists: false } },
        { explanation: null },
        { explanation: "" },
      ],
    };

    const count = await Question.countDocuments(query);
    console.log(`📊 Found ${count} questions without explanations.`);

    if (count === 0) {
      console.log("🎉 All questions already have explanations. Nothing to do.");
      return;
    }

    const targetLimit = isNaN(limit) ? 50 : limit;
    console.log(`🚀 Processing up to ${targetLimit} questions...\n`);

    const questions = await Question.find(query).limit(targetLimit).lean();

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const code = q.metadata?.questionCode || "no-code";
      console.log(`[${i + 1}/${questions.length}] ID: ${q._id} (${code})`);

      try {
        const result = await QuestionExplanationService.generateExplanation(q);

        // ✅ updateOne bypasses full schema validation
        await Question.updateOne(
          { _id: q._id },
          {
            $set: {
              explanation: result.summary,
              explanationStatus: "completed",
              explanationGeneratedAt: new Date(),
              explanationSource: "ai",
              explanationDetails: {
                whyCorrect: result.whyCorrect,
                whyOthersWrong: result.whyOthersWrong,
                examTip: result.examTip,
                relatedConcepts: result.relatedConcepts,
              },
            },
          }
        );

        successCount++;
        console.log(`  ✅ Saved\n`);
      } catch (err) {
        failCount++;
        console.error(`  ❌ Failed: ${err.message}\n`);

        // Mark as failed so it doesn't get re-picked next run
        await Question.updateOne(
          { _id: q._id },
          { $set: { explanationStatus: "failed" } }
        ).catch(() => { });
      }

      if (i < questions.length - 1) {
        await sleep(1500);
      }
    }

    console.log(`🏁 Done!`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed:  ${failCount}`);
    console.log(`  📦 Total:   ${questions.length}`);
  } catch (error) {
    console.error("❌ Fatal error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 MongoDB disconnected");
  }
}

main();