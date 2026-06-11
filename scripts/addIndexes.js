// scripts/addIndexes.js
import mongoose from '../src/config/mongodb.js';
import { connectMongoDB } from '../src/config/mongodb.js';

async function run() {
  try {
    await connectMongoDB();
    console.log("Adding and ensuring database indexes...");

    const db = mongoose.connection.db;

    // 1. Questions Collection Indexes
    const questions = db.collection('questions');
    await questions.createIndex({ subjectId: 1, "metadata.topic": 1 });
    await questions.createIndex({ subjectId: 1, "metadata.difficulty": 1 });
    await questions.createIndex({ "metadata.topic": 1 });
    await questions.createIndex({ "metadata.difficulty": 1 });
    console.log("✅ Questions indexes created.");

    // 2. PracticeSessions Collection Indexes
    const practiceSessions = db.collection('practicesessions');
    await practiceSessions.createIndex({ userId: 1, createdAt: -1 });
    await practiceSessions.createIndex({ userId: 1, sessionStatus: 1, createdAt: -1 });
    console.log("✅ PracticeSessions indexes created.");

    // 3. TopicPerformance Collection Indexes
    const topicPerformances = db.collection('topicperformances');
    await topicPerformances.createIndex({ userId: 1, topicId: 1 }, { unique: true });
    await topicPerformances.createIndex({ userId: 1, subjectId: 1 });
    console.log("✅ TopicPerformance indexes created.");

    // 4. Users Collection Indexes
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    console.log("✅ Users indexes created.");

    console.log("🎉 All indexes built successfully.");
  } catch (error) {
    console.error("❌ Migration error:", error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
