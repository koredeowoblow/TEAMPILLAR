import mongoose from 'mongoose';
import 'dotenv/config';
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Question = (await import('./src/models/QuestionModel.js')).default;
  const q = await Question.findOne({ 'content.text': { $regex: /The new policy aims/i } });
  console.log(JSON.stringify(q, null, 2));
  process.exit(0);
});
