import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    classGroup: { type: String, required: true },
    examDate: { type: Date, required: true },
    duration: { type: Number, required: true },
    questionCount: { type: Number, required: true },
    instructions: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["scheduled", "cancelled", "completed"],
      default: "scheduled",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Exam", ExamSchema);
