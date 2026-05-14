import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import dns from "node:dns";
import QuestionModel from "../src/models/QuestionModel.js";

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), ".env") });

// Override DNS for SRV resolution (fixes ECONNREFUSED on some networks)
dns.setServers(["8.8.8.8", "8.8.4.4"]);

async function runMigration() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      throw new Error("MONGO_URI or DATABASE_URL environment variable is missing.");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected.");

    console.log("Finding questions with missing difficulty...");
    const filter = {
      $or: [
        { "metadata.difficulty": null },
        { "metadata.difficulty": { $exists: false } }
      ]
    };

    const count = await QuestionModel.countDocuments(filter);
    console.log(`Found ${count} questions that need difficulty migration.`);

    if (count > 0) {
      const result = await QuestionModel.updateMany(filter, {
        $set: { "metadata.difficulty": "medium" }
      });
      console.log(`Successfully updated ${result.modifiedCount} questions.`);
    }

    console.log("Migration complete.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runMigration();
