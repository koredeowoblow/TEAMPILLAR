import mongoose from "mongoose";

const StreakSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true, // Assuming one streak document per user
    },
    streakCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Streak", StreakSchema);
