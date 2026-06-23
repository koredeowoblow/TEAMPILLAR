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
  "Lexis and Structure",
  "Synonyms (Nearest in meaning)",
  "Antonyms (Opposite in meaning)",
  "Oral English (Vowels and Consonants)",
  "Spellings",
  "Question Tags and Grammatical Rules"
];

async function generateEasyEnglishQuestions() {
  await connectMongoDB();
  
  const englishSubject = await Subject.findOne({ name: /english/i });
  if (!englishSubject) {
    console.error("English subject not found.");
    process.exit(1);
  }

  const QUESTIONS_TO_GENERATE = 100; // Generate 100 easy questions
  const BATCH_SIZE = 5;
  let totalGenerated = 0;

  console.log("🚀 Starting Generation of EASY UTME English Past Questions...");

  for (let i = 0; i < QUESTIONS_TO_GENERATE; i += BATCH_SIZE) {
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    
    const prompt = `You are a UTME/JAMB English examiner providing ACTUAL PAST QUESTIONS.
Generate ${BATCH_SIZE} UNIQUE, exceptionally EASY English questions for UTME level on the topic: ${topic}.

REQUIREMENTS:
1. These MUST be modeled exactly after the easiest UTME past questions from the last 20 years.
2. Focus on basic vocabulary, simple synonyms/antonyms, spellings, or basic grammatical rules. Do NOT generate long comprehension passages.
3. Every question MUST include clear instructions in the question text (e.g., "Choose the option nearest in meaning to the italicized word", "Fill in the blank space").
4. Include standard 4 options (A, B, C, D). Only 1 is correct.
5. Provide a realistic UTME past question year between 2000 and 2023.

OUTPUT EXACTLY IN THIS JSON FORMAT (Array of objects, no markdown wrappers):
[
  {
    "question": "Instruction text: Actual question...",
    "options": {
      "A": "Option 1",
      "B": "Option 2",
      "C": "Option 3",
      "D": "Option 4"
    },
    "correctAnswer": "A",
    "explanation": "Brief explanation of why the answer is correct.",
    "year": 2015
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
          subjectId: englishSubject._id,
          content: { text: q.question },
          text: q.question,
          options: [
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.A, identifier: "A", isCorrect: q.correctAnswer === "A" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.B, identifier: "B", isCorrect: q.correctAnswer === "B" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.C, identifier: "C", isCorrect: q.correctAnswer === "C" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.D, identifier: "D", isCorrect: q.correctAnswer === "D" },
          ],
          metadata: {
            difficulty: "easy",
            topic: topic,
            year: q.year || 2015,
            instruction: q.question.split(":")[0] || "Answer the question",
            questionCode: `ENG-EASY-${Date.now()}-${Math.floor(Math.random() * 1000)}`
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

  console.log(`\n🎉 Successfully generated and saved ${totalGenerated} EASY UTME English questions!`);
  process.exit(0);
}

generateEasyEnglishQuestions().catch(console.error);
