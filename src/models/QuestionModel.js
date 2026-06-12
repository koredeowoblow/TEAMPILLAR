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

      difficulty: {
        type: String,
        enum: ["easy", "medium", "hard"],
        default: "medium",
      },
    },
  },
  {
    timestamps: true,
  }
);

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