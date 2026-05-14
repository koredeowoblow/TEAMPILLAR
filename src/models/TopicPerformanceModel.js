import mongoose from "mongoose";

const TopicPerformanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  topicId: { type: String, required: true }, // stores the topic name string from question metadata.topic
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
  totalAttempted: { type: Number, default: 0 },
  totalCorrect: { type: Number, default: 0 },
  lastAttemptedAt: { type: Date, default: Date.now },
  averageTimeSpent: { type: Number, default: 0 }, // in seconds
  masteryScore: { type: Number, default: 0 },
  recentAccuracy: { type: [Number], default: [] },
});

TopicPerformanceSchema.index({ userId: 1, topicId: 1 }, { unique: true });
TopicPerformanceSchema.index({ userId: 1, subjectId: 1 });

export { TopicPerformanceSchema };
export default mongoose.model("TopicPerformance", TopicPerformanceSchema);
