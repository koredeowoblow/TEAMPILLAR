import mongoose from 'mongoose';

async function test() {
  await mongoose.connect('mongodb+srv://koredeowolabi62_db_user:xHq7QjCCvYmsayiE@cluster0.swuupa3.mongodb.net/teampillar?appName=Cluster0');
  const TopicPerformance = mongoose.connection.db.collection('topicperformances');
  const docs = await TopicPerformance.find({ totalAttempted: { $gt: 0 } }).limit(10).toArray();
  console.log(JSON.stringify(docs, null, 2));
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
