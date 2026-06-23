import mongoose from "mongoose";

const SessionAuditLogSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PracticeSession",
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  eventVersion: {
    type: Number,
    required: true
  },
  eventType: {
    type: String,
    enum: ["SESSION_START", "ANSWER_SUBMIT", "FENCING_REJECT", "FINALIZE_START", "FINALIZE_COMPLETE", "CORRUPTED_SESSION"],
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  previousHash: {
    type: String,
    required: true
  },
  eventHash: {
    type: String,
    required: true,
    unique: true
  },
  metadata: {
    ipAddress: String,
    deviceToken: String,
    processingTimeMs: Number
  }
});

// Enforce strict uniqueness on sessionId + eventVersion to prevent branching/forking
SessionAuditLogSchema.index({ sessionId: 1, eventVersion: 1 }, { unique: true });

// Prevent any modifications or deletions (Append-Only Enforcement)
SessionAuditLogSchema.pre("findOneAndUpdate", function() {
  throw new Error("Audit Logs are immutable. Updates are strictly forbidden.");
});
SessionAuditLogSchema.pre("updateOne", function() {
  throw new Error("Audit Logs are immutable. Updates are strictly forbidden.");
});
SessionAuditLogSchema.pre("remove", function() {
  throw new Error("Audit Logs are immutable. Deletions are strictly forbidden.");
});

const SessionAuditLog = mongoose.models.SessionAuditLog || mongoose.model("SessionAuditLog", SessionAuditLogSchema);
export default SessionAuditLog;
