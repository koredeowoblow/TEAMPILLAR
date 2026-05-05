import mongoose from "mongoose";

const TokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserMongo",
      required: true,
    },
    type: {
      type: String,
      enum: ["refresh", "reset", "verify"],
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    collection: "tokens",
  },
);

TokenSchema.index({ userId: 1 });
TokenSchema.index({ type: 1 });
TokenSchema.index({ revoked: 1 });
TokenSchema.index({ expiresAt: 1 });
TokenSchema.index({ userId: 1, type: 1, revoked: 1 });

export default mongoose.model("Token", TokenSchema);
