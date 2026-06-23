import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import Question from '../src/models/QuestionModel.js';
import Subject from '../src/models/SubjectModel.js';
import { connectMongoDB } from '../src/config/mongodb.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function evaluateEnglishQuestion(qText, optionsText) {
  const prompt = `You are a strict Nigerian UTME/JAMB English Language Chief Examiner. 
Your job is to review the following English question and determine if it has any critical quality issues.
You must REJECT the question if it violates ANY of these rules:
1. Incomplete Question: The question is cut off, ends abruptly, or lacks the necessary context to be answered.
2. Missing Instructions: The question lacks clear instructions on what the student should do (e.g., "Choose the word nearest in meaning to...", "Fill in the blank:", "From the options below..."). If it's just a raw sentence or single word with no instruction, reject it.
3. Missing Passage: The question references a passage (e.g., "From the passage above...", "According to the writer...") BUT the actual text of the passage is missing from the question content.

If the question is completely self-contained, has clear instructions, and is a valid UTME English question, ACCEPT it.

Output strict JSON format:
{
  "status": "accept" or "reject",
  "reason": "Brief explanation of the specific flaw (e.g. 'Missing instructions', 'Mentions passage but none provided', 'Incomplete sentence') or why it's accepted"
}

Question Content: ${qText}
Options: ${optionsText}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // Fast model for bulk
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" }
      })
    });
    const data = await res.json();
    if (!data.choices || !data.choices[0]) {
       return null;
    }
    return JSON.parse(data.choices[0].message.content);
  } catch(e) {
    return null;
  }
}

async function run() {
  await connectMongoDB();
  const englishSub = await Subject.findOne({ name: /english/i });
  
  if (!englishSub) {
      console.log("English subject not found.");
      process.exit(1);
  }

  const questions = await Question.find({ subjectId: englishSub._id, isQuarantined: { $ne: true } }).lean();
  console.log(`Evaluating ${questions.length} Active English Questions for quality issues...`);
  
  let rejected = 0;
  let accepted = 0;
  
  for (const q of questions) {
    const qText = q.content?.text || q.text || '';
    const opts = JSON.stringify(q.options || []);
    
    // Quick heuristic pre-filter to save LLM tokens
    const textLower = qText.toLowerCase();
    let requiresReview = false;
    
    if (qText.length < 30) {
        requiresReview = true; // Very short, might be incomplete or missing instructions
    } else if (textLower.includes("passage") || textLower.includes("according to the writer") || textLower.includes("the author")) {
        // References a passage, check if it's long enough to actually contain one
        if (qText.length < 150) {
            requiresReview = true;
        }
    } else if (!textLower.includes("choose") && !textLower.includes("fill") && !textLower.includes("complete") && !textLower.includes("identify") && !textLower.includes("select") && !textLower.includes("nearest") && !textLower.includes("opposite")) {
        requiresReview = true; // Might lack instructions
    }

    if (!requiresReview) {
        accepted++;
        continue; // Assume it's fine if it passes the heuristic
    }

    const review = await evaluateEnglishQuestion(qText, opts);
    if (review && review.status && review.status.toLowerCase() === 'reject') {
      await Question.findByIdAndUpdate(q._id, {
        isQuarantined: true,
        quarantineReason: `AI ENGLISH REJECT: ${review.reason}`
      });
      console.log(`[QUARANTINED] English Issue: ${q._id} - ${review.reason}`);
      rejected++;
    } else if (review && review.status && review.status.toLowerCase() === 'accept') {
      accepted++;
    }
    
    // Rate limit backoff for Groq (approx 1 request per 0.5 seconds)
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`English evaluation complete. Accepted: ${accepted}, Quarantined ${rejected} flawed questions.`);
  process.exit(0);
}

run().catch(console.error);
