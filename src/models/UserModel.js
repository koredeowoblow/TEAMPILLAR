import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, select: false }, // Optional - social auth users don't have passwords
    language: { type: String, enum: ["EN", "FR", "DE"], default: "EN" },
    photo: { type: String },
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
    isPro: { type: Boolean, default: false },
    onboarding: { type: Object, default: {} },
    stats: { type: Object, default: {} },
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
