import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "../src/models/QuestionModel.js";
import { logger } from "../src/core/logger.js";

dotenv.config();

async function createQuestionIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info("Connected to MongoDB for Index Migration.");

    // Create optimized indexes for hydration queries and fallback queries
    await Question.collection.createIndex({ subjectId: 1 }, { background: true });
    await Question.collection.createIndex({ subjectId: 1, "metadata.topic": 1 }, { background: true });
    await Question.collection.createIndex({ subjectId: 1, "metadata.difficulty": 1 }, { background: true });
    await Question.collection.createIndex({ subjectId: 1, "metadata.topic": 1, "metadata.difficulty": 1 }, { background: true });
    await Question.collection.createIndex({ _id: 1, subjectId: 1 }, { background: true });
    
    logger.info("Question Indexes created successfully.");
  } catch (error) {
    logger.error("Error creating indexes:", error);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB Disconnected.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createQuestionIndexes().then(() => process.exit(0));
}

export default createQuestionIndexes;
