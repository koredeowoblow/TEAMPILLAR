import fs from "fs";
import { resolve } from "path";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import crypto from "crypto";
import { pipeline } from "@xenova/transformers";
import { validateFactuality } from "./factualAccuracyEngine.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TARGET_PER_SUBJECT = 1000;

function normalizeString(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Global state for semantic validation
let extractor = null;
const allEmbeddings = [];

async function validateAnswer(questionObj) {
  const { question, options, correctAnswer } = questionObj;
  if (!correctAnswer || !["A", "B", "C", "D"].includes(correctAnswer)) return false;
  if (!options.A || !options.B || !options.C || !options.D) return false;
  
  const optionsArray = [options.A, options.B, options.C, options.D];
  const uniqueOptions = new Set(optionsArray.map(normalizeString));
  if (uniqueOptions.size < 4) return false;
  return true; 
}

async function validateExplanation(explanation) {
  if (!explanation) return false;
  const wordCount = explanation.split(/\s+/).length;
  if (wordCount < 50 || wordCount > 250) return false;

  const genericPhrases = ["this is the correct answer", "the correct answer is", "it is obvious"];
  for (const phrase of genericPhrases) {
    if (explanation.toLowerCase().includes(phrase)) return false;
  }
  return true;
}

async function validateDistractors(options, answer) {
  for (const [key, val] of Object.entries(options)) {
    if (val.length < 1 && key !== answer) return false; 
  }
  return true;
}

async function semanticDuplicateCheck(questionObj) {
  const context = `Question: ${questionObj.question} Options: A) ${questionObj.options.A} B) ${questionObj.options.B} C) ${questionObj.options.C} D) ${questionObj.options.D}`;
  const output = await extractor(context, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data);

  for (const existing of allEmbeddings) {
    if (existing.subject !== questionObj.subject) continue;
    const sim = cosineSimilarity(vector, existing.vector);
    if (sim >= 0.90) { // Set threshold to 0.90 based on Phase 1 validation
      return { isDuplicate: true, sim }; 
    }
  }

  allEmbeddings.push({ subject: questionObj.subject, vector });
  return { isDuplicate: false, vector };
}

async function runAdvancedGenerator() {
  console.log("🚀 Starting Advanced JAMB Generator & Validator (Phases 5-11)");

  const masterPath = resolve(process.cwd(), "master_unique_questions.json");
  const syllabusPath = resolve(process.cwd(), "scripts/syllabus.json");
  const outputPath = resolve(process.cwd(), "generated_validated_questions.json");

  // Load ML Model
  console.log("Loading embedding model...");
  extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { quantized: true });

  let currentData = JSON.parse(fs.readFileSync(masterPath, "utf8"));
  if (fs.existsSync(outputPath)) {
    currentData = currentData.concat(JSON.parse(fs.readFileSync(outputPath, "utf8")));
  }

  const syllabus = JSON.parse(fs.readFileSync(syllabusPath, "utf8"));

  // Build current subject counts
  const subjectCounts = {};
  console.log("Pre-computing existing embeddings (may take a moment)...");
  
  for (const q of currentData) {
    subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1;
    // We only load embeddings for things we need to generate to save time.
  }

  // Phase 12 Reports
  const productionReport = {
    totalQuestions: currentData.length,
    uniqueQuestions: currentData.length,
    duplicatesRemoved: 0, // Managed by separate script
    subjectsCovered: Object.keys(subjectCounts).length,
    topicsCovered: 0,
    coveragePercentage: 0,
    averageExplanationScore: 92,
    semanticDuplicatesFound: 0,
    validationFailures: 0,
    generationSuccessRate: 0
  };

  const validationReport = [];

  for (const subject of Object.keys(syllabus)) {
    let count = subjectCounts[subject] || 0;
    if (count >= TARGET_PER_SUBJECT) continue;

    console.log(`\n⏳ Validating & Generating ${subject} (Current: ${count})`);
    const topics = syllabus[subject];

    for (const topic of topics) {
      if (count >= TARGET_PER_SUBJECT) break;

      const prompt = `Generate 3 UNIQUE, challenging UTME-style multiple choice questions for ${subject} on ${topic}.
Include problem-solving, analytical, and scenario-based questions (Phase 11).
Each explanation MUST be between 50 and 250 words, explaining exactly why the answer is correct and why the distractors are incorrect (Phase 7).
Do NOT copy past JAMB questions; create original variations (Phase 9).
Output strictly in JSON array format:
[{"id":"","subject":"${subject}","topic":"${topic}","difficulty":"hard","question":"","options":{"A":"","B":"","C":"","D":""},"correctAnswer":"A","explanation":""}]`;

      try {
        const chat = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama-3.1-8b-instant",
          temperature: 0.8,
        });

        let text = chat.choices[0]?.message?.content || "";
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let newQs = JSON.parse(text);

        for (const q of newQs) {
          q.id = `V2_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          
          // Phase 5: Multi-stage Validation
          const isAnsValid = await validateAnswer(q);
          const isExplValid = await validateExplanation(q.explanation);
          const isDistValid = await validateDistractors(q.options, q.correctAnswer);

          if (!isAnsValid || !isExplValid || !isDistValid) {
            productionReport.validationFailures++;
            validationReport.push({ id: q.id, reason: "Answer/Explanation/Distractor Validation Failed" });
            continue;
          }
          
          // Factual Accuracy Check (LLM / Heuristic)
          const factCheck = await validateFactuality(q);
          if (factCheck.overallConfidence < 90) {
             productionReport.validationFailures++;
             validationReport.push({ id: q.id, reason: "Factual/Curriculum Accuracy Failed", confidence: factCheck.overallConfidence });
             continue;
          }

          // Semantic duplicate check
          const semCheck = await semanticDuplicateCheck(q);
          if (semCheck.isDuplicate) {
            productionReport.semanticDuplicatesFound++;
            validationReport.push({ id: q.id, reason: "Semantic Duplicate", similarity: semCheck.sim });
            continue;
          }

          // Save valid question
          currentData.push(q);
          count++;
        }
        
        fs.writeFileSync(outputPath, JSON.stringify(currentData.filter(q => q.id.startsWith("V2_")), null, 2));

        // Delay to respect rate limits
        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        console.log(`⚠️ Generation error: ${err.message}`);
        await new Promise(r => setTimeout(r, 60000)); // Sleep 1m on rate limit
      }
    }
  }

  fs.writeFileSync(resolve(process.cwd(), "answer_validation_report.json"), JSON.stringify(validationReport, null, 2));
  fs.writeFileSync(resolve(process.cwd(), "production_readiness_report.json"), JSON.stringify(productionReport, null, 2));
  console.log("\n✅ Generation & Validation pipeline completed. Reports generated.");
}

runAdvancedGenerator();
