import mongoose from "mongoose";

const UserAnalyticsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    tips: { type: String, default: "" },
    focusAreas: {
      type: [
        {
          topic: String,
          accuracy: Number,
          attempted: Number,
          correct: Number,
          incorrect: Number,
          averageTime: Number,
          topicsToReview: [String],
          commonWeakness: String,
          recommendation: String,
          estimatedScoreGain: Number,
        }
      ],
      default: []
    },
    priorityRecommendations: {
      type: [
        {
          priority: Number,
          topic: String,
          reason: String,
          potentialGain: String,
          recommendedQuestionCount: Number,
        }
      ],
      default: []
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("UserAnalytics", UserAnalyticsSchema);
