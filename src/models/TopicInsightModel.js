import mongoose from "mongoose";

const TopicInsightSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  topic: { type: String, required: true },
  analysis: {
    commonWeakness: { type: String, default: null },
    recommendation: { type: String, default: null },
    estimatedScoreGain: { type: Number, default: 0 }
  },
  generatedAt: { type: Date, default: Date.now }
});

TopicInsightSchema.index({ userId: 1, topic: 1 }, { unique: true });

export default mongoose.model("TopicInsight", TopicInsightSchema);
