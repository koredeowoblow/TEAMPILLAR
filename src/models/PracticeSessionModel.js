import mongoose from "mongoose";

const ResponseSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Question",
    required: true,
  },
  selectedOption: { type: String },
  timeTaken: { type: Number, default: 0 },
});

const AnalyticsSchema = new mongoose.Schema({
  accuracy: { type: Number, default: 0 },
  speedPerQuestion: { type: Number, default: 0 },
  topMistakeTopic: { type: String },
});

const SecuritySchema = new mongoose.Schema({
  tabSwitches: { type: Number, default: 0 },
  ipAddress: { type: String },
});

const PracticeSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    sessionStatus: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "EXPIRED"],
      default: "ACTIVE",
    },
    sessionType: {
      type: String,
      enum: ["standard", "smart-mock"],
      default: "standard",
    },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    responses: { type: [ResponseSchema], default: [] },
    analytics: { type: AnalyticsSchema, default: {} },
    security: { type: SecuritySchema, default: {} },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    score: { type: Number, default: 0 },
    questionLimit: { type: Number, default: 20 },
  },
  { timestamps: true },
);

PracticeSessionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("PracticeSession", PracticeSessionSchema);
