import mongoose from "mongoose";

const OptionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  isCorrect: {
    type: Boolean,
    default: false,
  },
});

const ContentSchema = new mongoose.Schema({
  text: String,
  image: String,
  equation: String,
});

const QuestionSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },

    content: {
      type: ContentSchema,
      default: {},
    },

    options: {
      type: [OptionSchema],
      validate: [
        (val) => val.length === 4,
        "options must be 4",
      ],
    },

    explanation: String,
    explanationStatus: {
      type: String,
      enum: ["pending", "generated", "failed"],
      default: "pending",
    },
    explanationSource: {
      type: String,
      enum: ["manual", "ai", "import"],
      default: "manual",
    },
    explanationGeneratedAt: Date,
    explanationDetails: {
      summary: { type: String, default: null },
      whyCorrect: { type: String, default: null },
      whyOthersWrong: { type: [String], default: [] },
      examTip: { type: String, default: null },
      relatedConcepts: { type: [String], default: [] },
    },

    metadata: {
      questionCode: {
        type: String,
        required: true,
      },

      year: Number,

      topic: String,
      subTopic: String,
      
      instruction: {
        type: String,
        default: null
      },

      difficulty: {
        type: String,
        enum: ["easy", "medium", "hard"],
        default: "medium",
      },
    },

    passageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Passage",
      default: null,
      index: true,
    },
    
    isQuarantined: {
      type: Boolean,
      default: false,
    },
    quarantineReason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
  }
);

QuestionSchema.pre("save", async function() {
  // Reset quarantine status to evaluate freshly
  this.isQuarantined = false;
  this.quarantineReason = null;
  const reasons = [];

  // 1. Incomplete Question Text
  if (!this.content?.text && !this.content?.image && !this.content?.equation) {
    reasons.push("Missing question content/text");
  }

  // 2. Options check
  if (!this.options || this.options.length < 4) {
    reasons.push("Less than 4 options provided");
  }

  // 3. Missing correct answer
  if (this.options && !this.options.some(opt => opt.isCorrect)) {
    reasons.push("Missing correct answer");
  }

  // 4. Missing explanation
  if (!this.explanation && (!this.explanationDetails || (!this.explanationDetails.whyCorrect && !this.explanationDetails.summary))) {
    reasons.push("Missing explanation");
  }

  try {
    const Subject = mongoose.model("Subject");
    const subject = await Subject.findById(this.subjectId).lean();
    if (subject) {
      const subName = (subject.name || "").toLowerCase();

      // English instruction check
      if (subName.includes("english")) {
        if (!this.metadata?.instruction) {
          reasons.push("English question missing mandatory instruction");
        }
      }

      // Physics check for engineering questions
      if (subName.includes("physics")) {
        const textLower = (this.content?.text || "").toLowerCase();
        const engKeywords = ['thermodynamics engine', 'civil engineering', 'auto mechanic', 'structural load', 'engineering'];
        if (engKeywords.some(k => textLower.includes(k))) {
          reasons.push("Physics question contains engineering-level content");
        }
      }
    }
  } catch (err) {
    // Ignore db fetch error during hook
  }

  // Passage check
  const textLower = (this.content?.text || "").toLowerCase();
  if (textLower.includes("passage") || textLower.includes("extract") || textLower.includes("statement above") || textLower.includes("comprehension")) {
    if (!this.passageId) {
      reasons.push("Question references a passage but no passageId is linked");
    }
  }

  if (reasons.length > 0) {
    // Instead of throwing an error that breaks bulk imports, we quarantine the question.
    // It won't be picked up by the exam engine if it's quarantined.
    this.isQuarantined = true;
    this.quarantineReason = reasons.join(" | ");
    
    // In strict mode, we could reject:
    // return next(new Error(`Validation Failed: ${reasons.join(" | ")}`));
  }
  
});

// Main lookup index
QuestionSchema.index({
  subjectId: 1,
  "metadata.topic": 1,
  "metadata.difficulty": 1,
});

// Topic search
QuestionSchema.index({
  "metadata.topic": 1,
});

// Difficulty search
QuestionSchema.index({
  "metadata.difficulty": 1,
});

// Subject + Difficulty compound index
QuestionSchema.index({
  subjectId: 1,
  "metadata.difficulty": 1,
});

// Subject + Year compound index
QuestionSchema.index({
  subjectId: 1,
  "metadata.year": 1,
});

// Prevent duplicate questions within same subject
QuestionSchema.index(
  {
    subjectId: 1,
    "metadata.questionCode": 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model("Question", QuestionSchema);