import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["student", "admin"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["subscription", "exam_issue", "account", "content", "other"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
      index: true,
    },
    messages: [messageSchema],
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate ticketId before saving if it doesn't exist
supportTicketSchema.pre("save", async function (next) {
  if (this.isNew && !this.ticketId) {
    let isUnique = false;
    while (!isUnique) {
      // Generate format PIL-XXXX (alphanumeric to reduce collisions)
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
      const newId = `PIL-${randomStr}`;
      const existing = await mongoose.models.SupportTicket.findOne({ ticketId: newId });
      if (!existing) {
        this.ticketId = newId;
        isUnique = true;
      }
    }
  }
  
  // Set resolvedAt when status changes to resolved or closed
  if (this.isModified("status") && (this.status === "resolved" || this.status === "closed") && !this.resolvedAt) {
    this.resolvedAt = new Date();
  } else if (this.isModified("status") && this.status !== "resolved" && this.status !== "closed") {
    this.resolvedAt = undefined;
  }
  
  next();
});

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

export default SupportTicket;
