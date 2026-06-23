import fs from "fs";
import { resolve } from "path";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import crypto from "crypto";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TARGET_PER_SUBJECT = 1000;

function normalizeString(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function generateHash(questionObj) {
  const { subject, question, options, correctAnswer } = questionObj;
  const strToHash = `${normalizeString(subject)}|${normalizeString(question)}|${normalizeString(options.A)}|${normalizeString(options.B)}|${normalizeString(options.C)}|${normalizeString(options.D)}|${normalizeString(correctAnswer)}`;
  return crypto.createHash("sha256").update(strToHash).digest("hex");
}

async function runGenerator() {
  console.log("🚀 Starting Phase 6: Question Generation Engine");

  const masterPath = resolve(process.cwd(), "master_unique_questions.json");
  const syllabusPath = resolve(process.cwd(), "scripts/syllabus.json");
  const outputPath = resolve(process.cwd(), "generated_questions.json");

  if (!fs.existsSync(masterPath)) {
    console.error("❌ master_unique_questions.json not found. Run auditAndDeduplicate.js first.");
    return;
  }
  
  if (!fs.existsSync(syllabusPath)) {
    console.error("❌ syllabus.json not found.");
    return;
  }

  const existingData = JSON.parse(fs.readFileSync(masterPath, "utf8"));
  const syllabus = JSON.parse(fs.readFileSync(syllabusPath, "utf8"));
  
  let generatedData = [];
  if (fs.existsSync(outputPath)) {
    generatedData = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  }

  const hashes = new Set();
  const textHashes = new Set();
  const subjectCounts = {};

  // Initialize hashes and counts
  [...existingData, ...generatedData].forEach(q => {
    hashes.add(generateHash(q));
    textHashes.add(`${normalizeString(q.subject)}|${normalizeString(q.question)}`);
    subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1;
  });

  console.log(`📊 Current Counts (Existing + Generated):`, subjectCounts);

  const subjects = Object.keys(syllabus);

  for (const subject of subjects) {
    let currentCount = subjectCounts[subject] || 0;
    const topics = syllabus[subject];
    
    if (currentCount >= TARGET_PER_SUBJECT) {
      console.log(`✅ ${subject} already reached target (${currentCount}/${TARGET_PER_SUBJECT})`);
      continue;
    }

    console.log(`\n⏳ Generating for ${subject}. Target: ${TARGET_PER_SUBJECT}. Current: ${currentCount}`);

    let topicIndex = 0;
    while (currentCount < TARGET_PER_SUBJECT) {
      const topic = topics[topicIndex % topics.length];
      const batchSize = 5;
      
      const prompt = `You are an expert UTME (JAMB) examiner. Generate ${batchSize} UNIQUE and highly challenging multiple-choice questions for the subject: ${subject}, specifically on the topic: ${topic}.
      
REQUIREMENTS:
1. Academic accuracy, standard UTME difficulty.
2. 4 realistic options (A, B, C, D). Only 1 is correct.
3. Detailed explanation.

CRITICAL CONSTRAINTS TO PREVENT QUALITY ISSUES:
- For Mathematics: Generate complex, multi-step problem-solving questions. Do NOT generate overly simple or "cheap" direct-recall questions.
- For English: Questions MUST be complete. ALWAYS provide clear, explicit instructions (e.g., "Choose the option that is nearest in meaning to the italicized word").
- For English Passages: If testing comprehension, you MUST include the actual short passage text within the "question" field. Never reference a passage without providing it.
- For Physics: Strictly adhere to the high-school/UTME syllabus. Do NOT include advanced engineering or university-level concepts.
- Novelty: Every question must be semantically unique. Do not repeat similar question structures to prevent duplicates in the same exam.

4. Provide the output EXACTLY in this JSON format ONLY (array of objects), no markdown wrappers:
[
  {
    "id": "generated_uuid",
    "subject": "${subject}",
    "topic": "${topic}",
    "difficulty": "medium",
    "question": "[Instructions/Passage] Actual question text...?",
    "options": {
      "A": "Option 1",
      "B": "Option 2",
      "C": "Option 3",
      "D": "Option 4"
    },
    "correctAnswer": "A",
    "explanation": "Explanation here."
  }
]`;

      try {
        const chatCompletion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama3-8b-8192", // Fast and capable
          temperature: 0.7,
        });

        let responseText = chatCompletion.choices[0]?.message?.content || "";
        
        // Clean up markdown block if present
        responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        let newQuestions = [];
        try {
          newQuestions = JSON.parse(responseText);
        } catch (err) {
          console.log("⚠️ JSON Parse error on Groq response. Retrying...");
          continue;
        }

        let added = 0;
        for (const q of newQuestions) {
          q.id = `Q_${Date.now()}_${Math.floor(Math.random()*10000)}`;
          const hash = generateHash(q);
          const tHash = `${normalizeString(q.subject)}|${normalizeString(q.question)}`;
          
          if (!hashes.has(hash) && !textHashes.has(tHash)) {
            hashes.add(hash);
            textHashes.add(tHash);
            generatedData.push(q);
            currentCount++;
            added++;
          }
        }

        console.log(`   -> Generated ${added} new unique questions for ${subject} - ${topic} | Total: ${currentCount}/${TARGET_PER_SUBJECT}`);
        
        // Save progress
        fs.writeFileSync(outputPath, JSON.stringify(generatedData, null, 2));

        // Sleep to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));
        
      } catch (e) {
        console.log(`⚠️ API Error: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
      
      topicIndex++;
    }
  }

  console.log("\n🎉 Generation Engine Finished.");
  console.log(`Check ${outputPath} for new questions.`);
}

runGenerator();
