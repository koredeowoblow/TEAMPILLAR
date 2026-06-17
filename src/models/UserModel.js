import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/**
 * SCHEMA CONSOLIDATION DECISIONS:
 * 
 * - Subscription source of truth: `subscriptionStatus` (String enum: "free", "active", "expired", "cancelled", "paid").
 *   This is the ONLY field that determines access level. `resolveUserTier()` in `entitlement.js` derives tier from this field.
 *   The legacy `isPro` (Boolean) and `subscription` (String enum) fields have been removed.
 * 
 * - Email verification source of truth: `emailVerified` (Boolean) at the top level.
 *   The legacy `onboarding.emailVerified` field has been removed.
 */



const UserSchema = new mongoose.Schema(
  {
    name: { type: String },
    username: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false }, // Optional - social auth users don't have passwords
    language: { type: String, enum: ["EN", "FR", "DE"], default: "EN" },
    photo: { type: String },
    photoUrl: { type: String },
    googleId: { type: String, unique: true, sparse: true }, // Google OAuth ID
    appleId: { type: String, unique: true, sparse: true }, // Apple Sign-In ID
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    isAdmin: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["STUDENT", "ADMIN", "TUTOR"],
      default: "STUDENT",
    },
    subscriptionStatus: {
      type: String,
      enum: ["free", "active", "expired", "cancelled", "paid"],
      default: "free",
    },
    proExpiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    selectedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
    lastSubjectUpdate: { type: Date, default: null },
    subscriptionDetails: {
      paystackSubscriptionCode: String,
      nextPaymentDate: Date,
      billingCycle: String, // 'monthly' | 'yearly'
    },
    limits: {
      dailyAICount: { type: Number, default: 0 },
      lastAIReset: { type: Date, default: Date.now },
      totalMockTests: { type: Number, default: 0 },
    },
    onboarding: {
      subjectsSelected: { type: Boolean, default: false },
      targetScoreSet:   { type: Boolean, default: false },
      studyHoursSet:    { type: Boolean, default: false },
      completed:        { type: Boolean, default: false },
      targetScore:      { type: Number,  default: null },
      studyHoursPerDay: { type: Number,  default: null },
      subjects:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }]
    },
    notificationPreferences: {
      emailNotifications: { type: Boolean, default: true },
      examReminders:      { type: Boolean, default: true },
      resultAlerts:       { type: Boolean, default: true },
      productUpdates:     { type: Boolean, default: false },
    },
    privacySettings: {
      profileVisibility: { type: String, enum: ["public", "private"], default: "public" },
      showEmail: { type: Boolean, default: false },
      showStats: { type: Boolean, default: true },
      dataSharing: { type: Boolean, default: false },
    },
    stats: {
      predictedScore: { type: Number, default: 0 },
      isPredictedScoreConfident: { type: Boolean, default: false },
      predictedScoreDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
      highestMockScore: { type: Number, default: 0 },
      totalMocksTaken:  { type: Number, default: 0 },
      avgMockScore:     { type: Number, default: 0 },
    },
    lastActive: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

UserSchema.pre("save", async function () {
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
});
export default mongoose.model("User", UserSchema);

