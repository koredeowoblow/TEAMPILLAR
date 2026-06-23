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
      immutable: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      index: true,
      immutable: true,
    },
    subjectIds: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
      }],
      immutable: true,
    },
    sessionStatus: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "PENDING_GRADING", "EXPIRED", "ABANDONED"],
      default: "ACTIVE",
    },
    sessionLedgerStatus: {
      type: String,
      enum: ["PENDING", "ACTIVE", "SUBMITTED", "REJECTED"],
      default: "ACTIVE",
      index: true,
    },
    sessionNonce: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    sessionType: {
      type: String,
      enum: ["standard", "smart-mock"],
      default: "standard",
      immutable: true,
    },
    questionIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
      immutable: true,
    },
    responses: { type: [ResponseSchema], default: [] },
    analytics: { type: AnalyticsSchema, default: {} },
    security: { type: SecuritySchema, default: {} },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    score: { type: Number, default: 0 },
    questionLimit: { type: Number, default: 20, immutable: true },
    topic: { type: String, default: null, immutable: true },
    isMockTest: { type: Boolean, default: false, immutable: true },
    compositeScore: { type: Number, default: null },
    subjectScores: [{
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
      subjectName: { type: String },
      score: { type: Number },
      correct: { type: Number },
      total: { type: Number },
    }],
    totalDuration: { type: Number, required: true, immutable: true },
    sessionFingerprint: { type: String, required: true, immutable: true, index: true },
  },
  { timestamps: true },
);

PracticeSessionSchema.index({ userId: 1, createdAt: -1 });
PracticeSessionSchema.index({ userId: 1, sessionStatus: 1 });
PracticeSessionSchema.index({ sessionStatus: 1 });
PracticeSessionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { sessionLedgerStatus: "ACTIVE" } }
);

const IMMUTABLE_FIELDS = ['userId', 'subjectId', 'subjectIds', 'sessionType', 'questionIds', 'questionLimit', 'topic', 'isMockTest', 'totalDuration', 'sessionFingerprint', 'sessionNonce'];

PracticeSessionSchema.pre('validate', async function (next) {
  if (this.isNew) {
    if (!this.totalDuration) return next(new Error("SESSION_IS_IMMUTABLE: totalDuration is missing."));
    if (!this.questionIds || this.questionIds.length === 0) return next(new Error("SESSION_IS_IMMUTABLE: questionIds are missing or empty."));

    if (!this.sessionNonce) {
      const crypto = await import("crypto");
      this.sessionNonce = crypto.randomBytes(32).toString("hex");
    }

    if (!this.sessionFingerprint) {
      const { generateSessionFingerprint } = await import("../utils/SessionCrypto.js");
      this.sessionFingerprint = generateSessionFingerprint(this);
    }
  }
  next();
});

PracticeSessionSchema.pre('save', function (next) {
  if (!this.isNew) {
    for (const field of IMMUTABLE_FIELDS) {
      if (this.isModified(field)) {
        return next(new Error(`SESSION_IS_IMMUTABLE: Cannot modify ${field} after session creation.`));
      }
    }
  }
  next();
});

PracticeSessionSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
  const update = this.getUpdate();
  const setPayload = update.$set || update;
  if (!setPayload) return;
  for (const field of IMMUTABLE_FIELDS) {
    if (setPayload[field] !== undefined) {
      throw new Error(`SESSION_IS_IMMUTABLE: Cannot modify ${field} after session creation.`);
    }
  }
});

export default mongoose.model("PracticeSession", PracticeSessionSchema);
