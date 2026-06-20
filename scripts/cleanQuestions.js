import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import dns from "node:dns";

import Subject from "../src/models/SubjectModel.js";
import Question from "../src/models/QuestionModel.js";

import AIService from "../src/services/AIService.js";

// Load environment variables
dotenv.config({
  path: resolve(process.cwd(), ".env"),
});

// DNS override for SRV resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);

async function clean() {
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

    // 1. Remove duplicates
    console.log("\n🧹 Checking for duplicates...");
    let deletedCount = 0;
    
    // Group questions by subjectId and content.text to find exact duplicates
    const duplicates = await Question.aggregate([
      {
        $group: {
          _id: {
            subjectId: "$subjectId",
            text: "$content.text"
          },
          count: { $sum: 1 },
          docs: { $push: "$_id" }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    for (const duplicateGroup of duplicates) {
      // Keep the first document, delete the rest
      const [keep, ...toDelete] = duplicateGroup.docs;
      
      if (toDelete.length > 0) {
        const result = await Question.deleteMany({ _id: { $in: toDelete } });
        deletedCount += result.deletedCount;
      }
    }
    
    console.log(`✅ Deleted ${deletedCount} duplicate questions.`);

    // 2. Find and update years
    console.log("\n🔍 Extracting years using AI...");
    
    // Fetch all questions to check for years
    const questions = await Question.find({}).lean();
    let yearUpdates = 0;
    const yearRegex = /\b(19\d{2}|20[0-2]\d)\b/g;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      let extractedYear = null;

      if (q.content && q.content.text) {
        const matches = [...q.content.text.matchAll(yearRegex)];
        if (matches.length > 0) {
          extractedYear = parseInt(matches[matches.length - 1][0], 10);
        }
      }

      if (!extractedYear) {
        try {
          const aiResponse = await AIService._callAIWithFallback([{
            role: "system",
            content: `You are a UTME (JAMB) expert. Examine the question and determine the EXACT year it appeared in past exams. If you DO NOT know the precise year for a fact, return { "year": null }. DO NOT guess or estimate.`
          }, {
            role: "user",
            content: `Question: ${q.content?.text || "N/A"}`
          }], { max_tokens: 50, response_format: { type: "json_object" } });

          if (aiResponse && aiResponse.content) {
            const parsed = JSON.parse(aiResponse.content);
            if (parsed.year && !isNaN(parsed.year)) {
              extractedYear = parseInt(parsed.year, 10);
            }
          }
        } catch (err) {
          console.error(`AI failed for question ${q._id}: ${err.message}`);
        }
        
        await new Promise(res => setTimeout(res, 1000));
      }

      if (extractedYear && extractedYear >= 1970 && extractedYear <= new Date().getFullYear()) {
        await Question.updateOne({ _id: q._id }, { $set: { "metadata.year": extractedYear } });
        yearUpdates++;
        console.log(`[${i+1}/${questions.length}] Assigned PRECISE year ${extractedYear} to Question ${q._id}`);
      } else if (q.metadata && q.metadata.year) {
        // If it had a fake/random year from earlier scripts, unset it so it remains truthful
        await Question.updateOne({ _id: q._id }, { $unset: { "metadata.year": "" } });
        console.log(`[${i+1}/${questions.length}] Cleared fake year for Question ${q._id}`);
      }
    }
    console.log(`✅ AI assigned years for ${yearUpdates} questions.`);



    // 3. Update subject question counts
    console.log("\n📊 Updating subject question counts...");
    const subjects = await Subject.find({});
    for (const subject of subjects) {
      const count = await Question.countDocuments({ subjectId: subject._id });
      subject.questionCount = count;
      await subject.save();
    }
    console.log(`✅ Subject counts updated.`);

    console.log("\n🎉 Cleaning completed successfully!");
  } catch (error) {
    console.error("\n❌ Cleaning failed");
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected");
  }
}

clean();
