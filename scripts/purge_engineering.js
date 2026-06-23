import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import Question from '../src/models/QuestionModel.js';
import Subject from '../src/models/SubjectModel.js';
import { connectMongoDB } from '../src/config/mongodb.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function evaluatePhysics(qText, optionsText) {
  const prompt = `You are a strict Nigerian UTME/JAMB Physics Chief Examiner. 
Your job is to read the following question and determine if it belongs in the high school JAMB UTME Physics syllabus.
If the question requires A-Level calculus, University-level engineering, advanced fluid dynamics, complex multi-mesh circuit analysis, or covers topics strictly outside the O-Level/UTME syllabus, you MUST reject it.
Output strict JSON format:
{
  "status": "accept" or "reject",
  "reason": "Brief explanation of why it fits UTME or why it is too advanced/irrelevant"
}

Question: ${qText}
Options: ${optionsText}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" }
      })
    });
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  } catch(e) {
    return null;
  }
}

async function run() {
  await connectMongoDB();
  const phySub = await Subject.findOne({ name: /physics/i });
  
  const questions = await Question.find({ subjectId: phySub._id, isQuarantined: { $ne: true } }).lean();
  console.log(`Evaluating ${questions.length} Active Physics Questions for Engineering contamination...`);
  
  let rejected = 0;
  
  for (const q of questions) {
    const qText = q.content?.text || q.text || '';
    const opts = JSON.stringify(q.options || []);
    
    const review = await evaluatePhysics(qText, opts);
    if (review && review.status && review.status.toLowerCase() === 'reject') {
      await Question.findByIdAndUpdate(q._id, {
        isQuarantined: true,
        quarantineReason: `AI SYLLABUS REJECT: ${review.reason}`
      });
      console.log(`[QUARANTINED] Off-Syllabus Question: ${q._id} - ${review.reason}`);
      rejected++;
    } else if (review && review.status && review.status.toLowerCase() === 'accept') {
      console.log(`[ACCEPTED] Q:${q._id} fits UTME.`);
    }
    
    // Rate limit backoff for Groq (approx 1 request per 1.5 seconds)
    await new Promise(r => setTimeout(r, 1500));
  }
  
  console.log(`Physics evaluation complete. Quarantined ${rejected} advanced engineering questions.`);
  process.exit(0);
}

run().catch(console.error);
