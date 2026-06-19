import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const TopicPerformance = mongoose.connection.db.collection('topicperformances');
  const docs = await TopicPerformance.find({ totalAttempted: { $gt: 0 } }).limit(10).toArray();
  console.log(JSON.stringify(docs, null, 2));
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
