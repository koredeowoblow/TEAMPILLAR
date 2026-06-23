import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import Question from '../src/models/QuestionModel.js';
import Subject from '../src/models/SubjectModel.js';
import Passage from '../src/models/PassageModel.js';
import { connectMongoDB } from '../src/config/mongodb.js';
import Groq from "groq-sdk";

dotenv.config({ path: resolve(process.cwd(), '.env') });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generateEssayQuestions() {
  await connectMongoDB();
  
  const englishSubject = await Subject.findOne({ name: /english/i });
  if (!englishSubject) {
    console.error("English subject not found.");
    process.exit(1);
  }

  const ESSAYS_TO_GENERATE = 10; // Generate 10 essays (which means 50 questions total)
  let totalGenerated = 0;

  console.log("🚀 Starting Generation of UTME English Essay (Comprehension) Questions...");

  for (let i = 0; i < ESSAYS_TO_GENERATE; i++) {
    const prompt = `You are a strict examiner providing ACTUAL JAMB/UTME English Comprehension PAST QUESTIONS.
Generate 1 unique reading comprehension passage (essay) of about 200 words on a topic suitable for Nigerian UTME candidates (e.g. agriculture, history, modern technology, society).
Then, generate 5 questions based ONLY on that passage.

REQUIREMENTS:
1. The passage must be well-written and challenging, exactly like UTME standard.
2. The 5 questions must test inference, factual recall, vocabulary in context, and main idea.
3. Each question MUST include clear instructions, such as: "According to the passage..." or "The word X as used in the passage means...".
4. Include standard 4 options (A, B, C, D). Only 1 is correct.
5. Provide a realistic UTME past question year between 2000 and 2023.

OUTPUT EXACTLY IN THIS JSON FORMAT:
{
  "passageTitle": "Title of the passage",
  "passageText": "The actual full text of the essay...",
  "questions": [
    {
      "question": "Question 1 text...",
      "options": {
        "A": "Option 1",
        "B": "Option 2",
        "C": "Option 3",
        "D": "Option 4"
      },
      "correctAnswer": "A",
      "explanation": "Brief explanation of why the answer is correct.",
      "year": 2018
    }
  ]
}`;

    try {
      console.log(`Generating Essay ${i + 1}/${ESSAYS_TO_GENERATE}...`);
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      let responseText = chatCompletion.choices[0]?.message?.content || "{}";
      responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        console.log("JSON parse error, skipping...");
        continue;
      }
      
      if (!parsed.passageText || !parsed.questions || !Array.isArray(parsed.questions)) {
          console.log("Invalid format, skipping...");
          continue;
      }

      // 1. Create the Passage
      const newPassage = new Passage({
          subjectId: englishSubject._id,
          title: parsed.passageTitle || "Reading Comprehension Passage",
          text: parsed.passageText
      });
      await newPassage.save();

      // 2. Create the Questions
      for (const q of parsed.questions) {
        if (!q.question || !q.options || !q.correctAnswer) continue;
        
        const newDoc = new Question({
          subjectId: englishSubject._id,
          passageId: newPassage._id, // Link to the newly created passage!
          content: { text: q.question },
          text: q.question,
          options: [
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.A, identifier: "A", isCorrect: q.correctAnswer === "A" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.B, identifier: "B", isCorrect: q.correctAnswer === "B" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.C, identifier: "C", isCorrect: q.correctAnswer === "C" },
            { id: new mongoose.Types.ObjectId().toString(), text: q.options.D, identifier: "D", isCorrect: q.correctAnswer === "D" },
          ],
          metadata: {
            difficulty: "medium",
            topic: "Reading Comprehension",
            year: q.year || 2015,
            instruction: "Read the passage carefully and answer the question.",
            questionCode: `ENG-COMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          },
          aiExplanation: q.explanation || "",
          isActive: true
        });

        await newDoc.save();
        totalGenerated++;
      }
      
      console.log(`✅ Saved Essay ${i + 1} and its ${parsed.questions.length} questions to DB. Total Questions: ${totalGenerated}`);
      
      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, 12000));
    } catch (e) {
      console.error("Error generating essay:", e.message);
    }
  }

  console.log(`\n🎉 Successfully generated and saved ${totalGenerated} UTME English Essay (Comprehension) questions!`);
  process.exit(0);
}

generateEssayQuestions().catch(console.error);
