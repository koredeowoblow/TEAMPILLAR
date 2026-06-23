import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Question from '../src/models/QuestionModel.js';
import Subject from '../src/models/SubjectModel.js';

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function queryGroq(prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant", // Fast model for bulk processing
      messages: [
        { 
          role: "system", 
          content: "You must always return your response in strict JSON format. No markdown blocks, no conversational text." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse JSON response:", content);
    return null;
  }
}

const recalibrateMaths = async () => {
  console.log("Connecting to Database...");
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || 'teampillar'
  });

  const mathSubject = await Subject.findOne({ name: { $regex: /mathematics/i } });
  if (!mathSubject) {
    console.error("Mathematics subject not found.");
    process.exit(1);
  }

  // Find unquarantined math questions to review
  const questions = await Question.find({ subjectId: mathSubject._id, isQuarantined: { $ne: true } });
  console.log(`Found ${questions.length} Mathematics questions for AI Review.`);

  let approved = 0;
  let rejected = 0;

  for (const q of questions) {
    const questionText = q.content?.text || q.text || '';
    if (!questionText) continue;

    const payload = {
      question: questionText,
      options: q.options || [],
      correctAnswer: q.options?.find(o => o.isCorrect)?.text || "UNKNOWN",
      topic: q.metadata?.topic || "general",
      difficulty: q.metadata?.difficulty || "medium"
    };

    const prompt = `
You are an expert UTME Mathematics examiner and question quality auditor.

Your responsibility is to evaluate whether a multiple-choice mathematics question is valid, fair, and suitable for UTME-level exams.

You must be strict. Only approve questions that are fully correct, clearly written, and solvable with a single unambiguous answer.

---

INPUT YOU WILL RECEIVE:
${JSON.stringify(payload, null, 2)}

---

YOUR TASK:
Check the question against all rules below and decide if it should be accepted or rejected.

---

VALIDATION RULES:

1. MATHEMATICAL CORRECTNESS
- Ensure the question is mathematically valid.
- Ensure the solution leads to exactly one correct answer.
- Reject if any step is logically incorrect or inconsistent.

2. SOLVABILITY
- The question must be solvable using standard UTME-level methods.
- Reject if missing values, unclear conditions, or insufficient data exist.
- Reject if multiple interpretations are possible.

3. OPTIONS VALIDITY
- Exactly one option must be correct.
- Reject if:
  - more than one correct answer exists
  - no correct answer exists in options
  - options are duplicated or too similar

4. CLARITY AND LANGUAGE
- The question must be clearly written and unambiguous.
- Reject if wording is confusing, incomplete, or poorly structured.

5. CURRICULUM ALIGNMENT
- Must match UTME Mathematics syllabus standards.
- Reject if it goes beyond expected difficulty scope or uses advanced/unexpected concepts.

6. DIFFICULTY CONSISTENCY
- Ensure difficulty label matches actual complexity.
- Reject if misclassified (e.g., “easy” but requires advanced reasoning).

---

DECISION RULE:

- ACCEPT only if ALL rules pass.
- Otherwise REJECT.

---

OUTPUT FORMAT (STRICT JSON ONLY):

{
  "status": "accept" | "reject",
  "confidence": 0.0,
  "reason": "short clear explanation of decision",
  "fix_suggestion": "how to improve the question if rejected"
}
    `;

    try {
      const response = await queryGroq(prompt);
      
      if (response && response.status && response.status.toLowerCase() === 'reject') {
        await Question.findByIdAndUpdate(q._id, { 
          isQuarantined: true,
          quarantineReason: `AI REJECT [${response.confidence}]: ${response.reason}`,
          'metadata.aiReview': response
        });
        rejected++;
        console.log(`[REJECTED] Q:${q._id} - ${response.reason}`);
      } else if (response && response.status && response.status.toLowerCase() === 'accept') {
        await Question.findByIdAndUpdate(q._id, { 
          'metadata.aiReview': response 
        });
        approved++;
        console.log(`[ACCEPTED] Q:${q._id} - ${response.reason}`);
      }
    } catch (e) {
      console.error(`Failed to evaluate Q:${q._id}`, e.message);
    }
    
    // Rate limit buffer
    await new Promise(r => setTimeout(r, 600)); 
  }

  console.log(`\nAI Review complete. Approved: ${approved}, Rejected & Quarantined: ${rejected}`);
  process.exit(0);
};

recalibrateMaths().catch(console.error);
