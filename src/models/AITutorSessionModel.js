import mongoose from "mongoose";

const aiTutorSessionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },
    topic: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "CLOSED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

// TTL Index for 90 days retention (90 days = 7776000 seconds)
// Note: This causes a hard delete of the document 90 days after createdAt
aiTutorSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model("AITutorSession", aiTutorSessionSchema);
