import mongoose from '../src/config/mongodb.js';
import { connectMongoDB } from '../src/config/mongodb.js';
import TopicPerformance from '../src/models/TopicPerformanceModel.js';
import Question from '../src/models/QuestionModel.js';

async function run() {
  try {
    await connectMongoDB();
    console.log("🔄 Fixing corrupted TopicPerformance records...");

    const perfs = await TopicPerformance.find({});
    let fixedCount = 0;
    let deletedCount = 0;

    for (const p of perfs) {
      if (!p.topicId) continue;
      
      const q = await Question.findOne({ "metadata.topic": p.topicId }).select("subjectId").lean();
      if (q && q.subjectId) {
        if (String(p.subjectId) !== String(q.subjectId)) {
          p.subjectId = q.subjectId;
          await p.save();
          fixedCount++;
        }
      } else {
        await TopicPerformance.deleteOne({ _id: p._id });
        deletedCount++;
      }
    }

    console.log(`✅ Successfully fixed ${fixedCount} records and deleted ${deletedCount} orphaned records.`);
  } catch (error) {
    console.error("❌ Fix error:", error.message);
  } finally {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }
    process.exit(0);
  }
}

run();
