import mongoose from "mongoose";

const aiTutorMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AITutorSession",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    metadata: {
      tokensUsed: { type: Number, default: null },
      latencyMs: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

// TTL Index for 90 days retention (90 days = 7776000 seconds)
// Note: This causes a hard delete of the document 90 days after createdAt
aiTutorMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model("AITutorMessage", aiTutorMessageSchema);
