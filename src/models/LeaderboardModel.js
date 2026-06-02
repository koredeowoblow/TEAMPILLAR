import mongoose from "mongoose";

const LeaderboardSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true, // Typically one leaderboard entry per user
    },
    score: { type: Number, default: 0, index: -1 }, // Index for sorting
    rank: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Leaderboard", LeaderboardSchema);
