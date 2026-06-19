import mongoose from "mongoose";

const SubjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    questionCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true },
);

export default mongoose.model("Subject", SubjectSchema);
