import mongoose from '../src/config/mongodb.js';
import { connectMongoDB } from '../src/config/mongodb.js';
import User from '../src/models/UserModel.js';
import PracticeSession from '../src/models/PracticeSessionModel.js';

async function run() {
  try {
    await connectMongoDB();
    console.log("🔄 Syncing mock stats for all users...");

    // Fetch all users
    const users = await User.find({}).select('_id stats onboarding');
    let updatedCount = 0;

    for (const user of users) {
      // Find all completed mock tests for this user
      const mockTests = await PracticeSession.find({
        userId: user._id,
        isMockTest: true,
        sessionStatus: "COMPLETED"
      }).select('compositeScore');

      let totalMocksTaken = mockTests.length;
      let highestMockScore = 0;
      let sumScores = 0;

      for (const mock of mockTests) {
        const score = mock.compositeScore || 0;
        if (score > highestMockScore) {
          highestMockScore = score;
        }
        sumScores += score;
      }

      let avgMockScore = totalMocksTaken > 0 ? Math.round(sumScores / totalMocksTaken) : 0;
      
      // Preserve existing predictedScore or fallback to targetScore if available
      let predictedScore = user.stats?.predictedScore || user.onboarding?.targetScore || 0;

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            'stats.totalMocksTaken': totalMocksTaken,
            'stats.highestMockScore': highestMockScore,
            'stats.avgMockScore': avgMockScore,
            'stats.predictedScore': predictedScore
          }
        }
      );

      updatedCount++;
    }

    console.log(`✅ Successfully synced mock stats for ${updatedCount} users.`);
  } catch (error) {
    console.error("❌ Sync error:", error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
