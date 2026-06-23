import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import Question from '../src/models/QuestionModel.js';
import Subject from '../src/models/SubjectModel.js';
import { connectMongoDB } from '../src/config/mongodb.js';
import Groq from "groq-sdk";

dotenv.config({ path: resolve(process.cwd(), '.env') });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TOPICS = [
  "Indices, Logarithms, and Surds",
  "Polynomials and Equations",
  "Sequences and Series (AP and GP)",
  "Matrices and Determinants",
  "Coordinate Geometry",
  "Trigonometry and Bearings",
  "Calculus (Differentiation and Integration)",
  "Probability and Permutations"
];

async function generateHardMathQuestions() {
  await connectMongoDB();

  const mathSubject = await Subject.findOne({ name: /mathematics/i });
  if (!mathSubject) {
    console.error("Mathematics subject not found.");
    process.exit(1);
  }

  const QUESTIONS_TO_GENERATE = 100; // Let's generate 30 hard questions
  const BATCH_SIZE = 5;
  let totalGenerated = 0;

  console.log("🚀 Starting Generation of HARD UTME Mathematics Past Questions...");

  for (let i = 0; i < QUESTIONS_TO_GENERATE; i += BATCH_SIZE) {
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];

    const prompt = `You are a strict examiner providing ACTUAL JAMB/UTME Mathematics PAST QUESTIONS.
Generate ${BATCH_SIZE} UNIQUE, exceptionally HARD Mathematics questions for UTME level on the topic: ${topic}.

REQUIREMENTS:
1. These MUST be modeled exactly after the hardest UTME past questions from the last 20 years.
2. Require multi-step calculations, complex logic, or calculus/advanced algebra. Do NOT generate easy or direct-recall questions.
3. Include standard 4 options (A, B, C, D). Only 1 is correct.
4. Detailed step-by-step explanation showing the exact calculations.
5. Provide a realistic UTME past question year between 2000 and 2023.

OUTPUT EXACTLY IN THIS JSON FORMAT (Array of objects, no markdown wrappers):
[
  {
    "question": "Question text here...",
    "options": {
      "A": "Option 1",
      "B": "Option 2",
      "C": "Option 3",
      "D": "Option 4"
    },
    "correctAnswer": "A",
    "explanation": "Step 1... Step 2... Final answer.",
    "year": 2018
  }
]`;

    try {
      console.log(`Generating batch for topic: ${topic}...`);
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      let responseText = chatCompletion.choices[0]?.message?.content || "{}";

      // Clean up markdown block if present
      responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

      // Sometimes it wraps in an object with a key like "questions"
      let parsed;
      try {
        parsed = JSON.parse(responseText);
        if (parsed.questions) parsed = parsed.questions;
      } catch (e) {
        console.log("JSON parse error, skipping batch...");
        continue;
      }

      if (!Array.isArray(parsed)) {
        parsed = Object.values(parsed).find(Array.isArray) || [];
      }

      for (const q of parsed) {
        if (!q.question || !q.options || !q.correctAnswer) continue;

        const newDoc = new Question({
          subjectId: mathSubject._id,
          content: { text: q.question },
          text: q.question,
          options: [
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.A, identifier: "A", isCorrect: q.correctAnswer === "A" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.B, identifier: "B", isCorrect: q.correctAnswer === "B" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.C, identifier: "C", isCorrect: q.correctAnswer === "C" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.D, identifier: "D", isCorrect: q.correctAnswer === "D" },
          ],
          metadata: {
            difficulty: "hard",
            topic: topic,
            year: q.year || 2015,
            questionCode: `MATH-HARD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          },
          aiExplanation: q.explanation || "",
          isActive: true
        });

        await newDoc.save();
        totalGenerated++;
      }

      console.log(`✅ Saved ${parsed.length} questions to DB. Total: ${totalGenerated}/${QUESTIONS_TO_GENERATE}`);

      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, 12000));
    } catch (e) {
      console.error("Error generating batch:", e.message);
    }
  }

  console.log(`\n🎉 Successfully generated and saved ${totalGenerated} HARD UTME Maths questions!`);
  process.exit(0);
}

generateHardMathQuestions().catch(console.error);
