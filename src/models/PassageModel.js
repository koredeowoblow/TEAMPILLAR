import mongoose from "mongoose";

const PassageSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: null,
    },
    text: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Passage", PassageSchema);
