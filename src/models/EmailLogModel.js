import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
  {
    to: {
      type: String,
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
    },
    template: {
      type: String, // e.g., 'welcome', 'otp', 'reset'
    },
    status: {
      type: String,
      enum: ["sent", "failed"],
      required: true,
      index: true,
    },
    resendId: {
      type: String,
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

const EmailLog = mongoose.model("EmailLog", emailLogSchema);

export default EmailLog;
