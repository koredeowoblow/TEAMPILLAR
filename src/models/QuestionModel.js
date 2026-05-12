import mongoose from "mongoose";

const OptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false },
});

const ContentSchema = new mongoose.Schema({
  text: { type: String },
  image: { type: String },
  equation: { type: String },
});

const QuestionSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    content: { type: ContentSchema, default: {} },
    options: {
      type: [OptionSchema],
      validate: [(val) => val.length === 4, "options must be 4"],
    },
    explanation: { type: String },
    metadata: {
      year: { type: Number },
      topic: { type: String },
      difficulty: {
        type: String,
        enum: ["EASY", "MEDIUM", "HARD"],
        default: "MEDIUM",
      },
    },
  },
  { timestamps: true },
);

QuestionSchema.index({ "metadata.topic": 1 });

export default mongoose.model("Question", QuestionSchema);
