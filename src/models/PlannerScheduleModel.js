import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    duration: { type: Number, default: 45 }, // minutes
    focus: { type: String, default: "Conceptual Review" },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { _id: true },
);

const daySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // ISO date string "YYYY-MM-DD"
    isRestDay: { type: Boolean, default: false },
    sessions: [sessionSchema],
  },
  { _id: false },
);

const weekSchema = new mongoose.Schema(
  {
    weekIndex: { type: Number, required: true }, // 0 = current week
    days: [daySchema],
  },
  { _id: false },
);

const plannerScheduleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    targetScore: { type: Number, required: true },
    hoursPerDay: { type: Number, required: true, min: 1, max: 8 },
    examDate: { type: Date, required: true },
    prioritySubjects: [{ type: String }],
    studyPreference: {
      type: String,
      enum: ["morning", "afternoon", "evening", "no preference"],
      default: "no preference",
    },
    weeks: [weekSchema],
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const PlannerSchedule = mongoose.model("PlannerSchedule", plannerScheduleSchema);
export default PlannerSchedule;
