import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import Question from '../src/models/QuestionModel.js';
import { connectMongoDB } from '../src/config/mongodb.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

function normalizeString(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function run() {
  await connectMongoDB();
  
  const questions = await Question.find({ isQuarantined: { $ne: true } }).lean();
  console.log(`Checking ${questions.length} Active Questions for semantic text duplicates...`);
  
  const seenTexts = new Map(); // normalizedText -> _id
  let quarantined = 0;
  
  for (const q of questions) {
    const qText = q.content?.text || q.text || '';
    if (!qText) continue;
    
    // Normalizing text removes spaces and punctuation. Two questions with identical text structure will match.
    // Example: "What is 2 + 2?" and "What is 2+ 2 ." become "whatis22"
    const normalized = normalizeString(qText);
    
    // If it's too short, don't quarantine blindly (e.g. math questions like "Solve for x")
    // but usually UTME questions are longer.
    if (normalized.length < 15) continue;
    
    if (seenTexts.has(normalized)) {
      await Question.findByIdAndUpdate(q._id, {
        isQuarantined: true,
        quarantineReason: `AI DUPLICATE REJECT: Matches question ${seenTexts.get(normalized)}`
      });
      quarantined++;
      console.log(`[QUARANTINED] Duplicate: ${q._id} matches ${seenTexts.get(normalized)}`);
    } else {
      seenTexts.set(normalized, q._id);
    }
  }
  
  console.log(`Deduplication complete. Quarantined ${quarantined} near-exact duplicates.`);
  process.exit(0);
}

run().catch(console.error);
