import mongoose from "mongoose";

const logEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["action", "error"],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    userRole: {
      type: String,
    },
    category: {
      type: String,
      enum: [
        "auth",
        "billing",
        "exam",
        "practice",
        "mock_test",
        "achievements",
        "ai_tutor",
        "support",
        "notifications",
        "admin_action",
        "system",
      ],
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
    },
    errorMessage: {
      type: String,
    },
    errorStack: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

logEntrySchema.index({ type: 1, category: 1, createdAt: -1 });
logEntrySchema.index({ userId: 1 });

export default mongoose.model("LogEntry", logEntrySchema);
