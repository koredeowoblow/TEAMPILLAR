import mongoose from "mongoose";
import dotenv from "dotenv";
import Passage from "./src/models/PassageModel.js";

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/teampillar";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const passages = await Passage.find({}).lean();
    console.log(`Total passages found: ${passages.length}`);
    passages.forEach((p, i) => {
      console.log(`Passage ${i+1}: ID=${p._id}, Title="${p.title || 'No Title'}", Length=${p.text.length} characters`);
      if (i < 5) {
        console.log(`Preview: ${p.text.substring(0, 100)}...`);
      }
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
