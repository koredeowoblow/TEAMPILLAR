import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import dns from "node:dns";

import Question from "../src/models/QuestionModel.js";
import QuestionExplanationService from "../src/services/QuestionExplanationService.js";

// Load environment variables
dotenv.config({
  path: resolve(process.cwd(), ".env"),
});

// DNS override for SRV resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const limitArgIndex = args.indexOf("--limit");
  const limit = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : 50;

  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI missing from .env");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri, {
      dbName: "teampillar",
    });
    console.log("✅ Connected to MongoDB");

    // Find questions with pending explanations
    const query = {
      $or: [
        { explanationStatus: "pending" },
        { explanationStatus: { $exists: false } },
        { explanation: null },
        { explanation: "" }
      ]
    };

    const count = await Question.countDocuments(query);
    console.log(`📊 Found ${count} questions without explanations.`);

    if (count === 0) {
      console.log("🎉 All questions already have explanations. Nothing to do.");
      return;
    }

    const targetLimit = isNaN(limit) ? 50 : limit;
    console.log(`🚀 Starting processing of up to ${targetLimit} questions...`);

    const questions = await Question.find(query).limit(targetLimit);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      console.log(`[${i + 1}/${questions.length}] Processing Question ID: ${q._id} (${q.metadata?.questionCode || "no-code"})...`);

      try {
        await QuestionExplanationService.generateAndSaveExplanation(q);
        successCount++;
        console.log(`  ✅ Success`);
      } catch (err) {
        failCount++;
        console.error(`  ❌ Failed: ${err.message}`);
      }

      // Rate limit safety delay
      if (i < questions.length - 1) {
        console.log("  ⏳ Sleeping 1.5s for rate limit safety...");
        await sleep(1500);
      }
    }

    console.log(`\n🏁 Completed batch processing!`);
    console.log(`  - Total processed: ${questions.length}`);
    console.log(`  - Successfully generated: ${successCount}`);
    console.log(`  - Failed: ${failCount}`);

  } catch (error) {
    console.error("❌ Seeding execution failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected");
  }
}

main();
