import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "achievement",   // Badge unlocked
        "streak",        // Streak milestone
        "score",         // Practice/exam score result
        "study_reminder",// Daily study reminder
        "pro",           // Subscription / upgrade
        "system",        // Platform announcements
        "leaderboard",   // Rank changes
      ],
      default: "system",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    meta: { type: Object, default: {} }, // optional extra payload (e.g. score, badge name, rank)
  },
  {
    timestamps: true,
  },
);

// Compound index for fast per-user queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });

export default mongoose.model("Notification", NotificationSchema);
