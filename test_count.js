import mongoose from "mongoose";
import "./src/config/env.js";
import Question from "./src/models/QuestionModel.js";

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const count = await Question.aggregate([{ $group: { _id: '$subjectId', count: { $sum: 1 } } }]);
  console.log(count);
  process.exit(0);
}
run();
