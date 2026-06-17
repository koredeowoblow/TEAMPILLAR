import { connectMongoDB, disconnectMongoDB } from '../src/config/mongodb.js';
import Question from '../src/models/QuestionModel.js';

async function fixBreathingTopic() {
  try {
    await connectMongoDB();

    // Update questions where metadata.topic is exactly 'BREATHING' (case insensitive if needed)
    const result = await Question.updateMany(
      { "metadata.topic": { $regex: /^breathing$/i } },
      { $set: { "metadata.topic": "Respiration" } }
    );

    console.log(`Successfully updated ${result.modifiedCount} questions from 'BREATHING' to 'Respiration'.`);
  } catch (error) {
    console.error("Error updating topic:", error);
  } finally {
    await disconnectMongoDB();
    process.exit(0);
  }
}

fixBreathingTopic();
