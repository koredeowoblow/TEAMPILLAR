import fs from "fs";
import { resolve } from "path";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { pipeline } from "@xenova/transformers";
import { validateFactuality } from "./factualAccuracyEngine.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TARGET_QUESTIONS = 10;
const DATA_PATH = resolve(process.cwd(), "master_unique_questions_certified.json");
const SYLLABUS_PATH = resolve(process.cwd(), "scripts/syllabus.json");

let dataset = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) : [];
const syllabus = fs.existsSync(SYLLABUS_PATH) ? JSON.parse(fs.readFileSync(SYLLABUS_PATH, "utf8")) : {};

let extractor = null;
const allEmbeddings = [];

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

async function validateAnswer(questionObj) {
  const { options, correctAnswer } = questionObj;
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
  if (wordCount < 10) return false;
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

function getNextSubjectAndTopic() {
  const countsBySubject = {};
  const countsByTopic = {};

  dataset.forEach(q => {
    countsBySubject[q.subject] = (countsBySubject[q.subject] || 0) + 1;
    if (!countsByTopic[q.subject]) countsByTopic[q.subject] = {};
    countsByTopic[q.subject][q.topic || "General"] = (countsByTopic[q.subject][q.topic || "General"] || 0) + 1;
  });

  const tier1 = []; 
  for (const subj of Object.keys(syllabus)) {
    if ((countsBySubject[subj] || 0) < 500) tier1.push(subj);
  }

  const subject = tier1.length > 0 ? tier1[Math.floor(Math.random() * tier1.length)] : Object.keys(syllabus)[0];
  const subjTopics = syllabus[subject] || [];
  
  let bestTopic = subjTopics[0];
  let minCount = 99999;

  for (const t of subjTopics) {
    const c = countsByTopic[subject]?.[t] || 0;
    if (c < minCount) {
      minCount = c;
      bestTopic = t;
    }
  }
  return { subject, topic: bestTopic };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runPilot() {
  console.log("🚀 Starting REAL-WORLD PRODUCTION PILOT");
  extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { quantized: true });

  console.log("Pre-computing existing embeddings...");
  // Sample 200 items for semantic checking to save local memory during the pilot
  const sampleData = dataset.slice(0, 200); 
  for (const q of sampleData) {
      const context = `Question: ${q.question} Options: A) ${q.options?.A} B) ${q.options?.B} C) ${q.options?.C} D) ${q.options?.D}`;
      const output = await extractor(context, { pooling: "mean", normalize: true });
      allEmbeddings.push({ subject: q.subject, vector: Array.from(output.data) });
  }

  let generated = 0;
  let accepted = 0;
  let rejected = 0;
  let duplicateRejects = 0;
  let totalConf = 0;
  
  const subjectsAffected = new Set();
  const topicsAffected = new Set();
  const pilotAcceptedItems = [];
  const pilotQualityAudit = [];
  const driftStats = { patterns: {} };

  while (accepted < TARGET_QUESTIONS) {
    const target = getNextSubjectAndTopic();
    // Generate 20 questions per request to avoid Groq Rate Limit (30 RPM) and accelerate generation
    const prompt = `Generate 20 UNIQUE, challenging UTME-style multiple choice questions for ${target.subject} on ${target.topic}.
Each explanation MUST be between 30 and 150 words, explaining exactly why the answer is correct and why the distractors are incorrect.
Output strictly as a JSON object containing a "questions" array. No conversational text.
Example format:
{"questions": [{"question":"","options":{"A":"","B":"","C":"","D":""},"correctAnswer":"A","explanation":""}]}`;

    let newQs = [];
    try {
      console.log(`[Pilot] Requesting 20 questions for ${target.subject}: ${target.topic}...`);
      const chat = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        temperature: 0.8,
        response_format: { type: "json_object" }
      });

      let text = chat.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(text);
      newQs = parsed.questions || [];
      
      // Delay to respect rate limits (30 RPM)
      await sleep(3500); 
    } catch (err) {
      console.log(`⚠️ Generation error: ${err.message}. Retrying in 5 seconds...`);
      await sleep(5000);
      continue;
    }

    if (!Array.isArray(newQs)) continue;

    for (const raw of newQs) {
      if (accepted >= TARGET_QUESTIONS) break;
      generated++;

      const q = {
        id: `PILOT_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        subject: target.subject,
        topic: target.topic,
        question: raw.question,
        options: raw.options || {},
        correctAnswer: raw.correctAnswer,
        explanation: raw.explanation
      };

      let auditStatus = "PASS";
      let auditFailReason = "";

      // 1. Structure Check
      if (!await validateAnswer(q) || !await validateExplanation(q.explanation) || !await validateDistractors(q.options, q.correctAnswer)) {
        auditStatus = "FAIL";
        auditFailReason = "Structure/Validation Check Failed";
      }

      // 2. Factual Accuracy Check
      let fact;
      if (auditStatus === "PASS") {
        fact = await validateFactuality(q);
        if (fact.overallConfidence < 90) {
          auditStatus = "FAIL";
          auditFailReason = `Fact Confidence Low: ${fact.overallConfidence}`;
        }
      }

      // 3. Semantic Duplicate Check
      if (auditStatus === "PASS") {
        const context = `Question: ${q.question} Options: A) ${q.options.A} B) ${q.options.B} C) ${q.options.C} D) ${q.options.D}`;
        const output = await extractor(context, { pooling: "mean", normalize: true });
        const vector = Array.from(output.data);
        
        let isDup = false;
        for (const existing of allEmbeddings) {
           if (cosineSimilarity(vector, existing.vector) >= 0.90) {
              isDup = true; break;
           }
        }
        if (isDup) {
          auditStatus = "FAIL";
          auditFailReason = "Semantic Duplicate";
          duplicateRejects++;
        } else {
          allEmbeddings.push({ subject: q.subject, vector });
        }
      }

      // 4. Drift Check
      if (auditStatus === "PASS") {
        const explStart = q.explanation.split(" ").slice(0, 3).join(" ");
        driftStats.patterns[explStart] = (driftStats.patterns[explStart] || 0) + 1;
        if (driftStats.patterns[explStart] > 10) {
           auditStatus = "FAIL";
           auditFailReason = "Drift Detected";
        }
      }

      pilotQualityAudit.push({
        questionId: q.id,
        subject: q.subject,
        status: auditStatus,
        reason: auditFailReason
      });

      if (auditStatus === "PASS") {
        accepted++;
        totalConf += fact.overallConfidence;
        subjectsAffected.add(q.subject);
        topicsAffected.add(q.topic);
        pilotAcceptedItems.push(q);
        console.log(`  ✅ Accepted: ${accepted}/${TARGET_QUESTIONS} (${q.subject})`);
      } else {
        rejected++;
      }
    }
  }

  const duplicateRate = (duplicateRejects / Math.max(1, generated)) * 100;
  const avgConf = accepted > 0 ? (totalConf / accepted) : 0;

  const pilotReport = {
    generated,
    accepted,
    rejected,
    duplicateRate: parseFloat(duplicateRate.toFixed(2)),
    averageConfidence: parseFloat(avgConf.toFixed(2)),
    subjectsAffected: Array.from(subjectsAffected),
    topicsAffected: Array.from(topicsAffected)
  };

  fs.writeFileSync(resolve(process.cwd(), "pilot_generation_report.json"), JSON.stringify(pilotReport, null, 2));
  
  // Randomly select 50 or up to accepted count
  const sample = [...pilotAcceptedItems].sort(() => 0.5 - Math.random()).slice(0, Math.min(50, accepted));
  fs.writeFileSync(resolve(process.cwd(), "pilot_human_review_sample.json"), JSON.stringify(sample, null, 2));
  fs.writeFileSync(resolve(process.cwd(), "pilot_quality_audit.json"), JSON.stringify(pilotQualityAudit, null, 2));

  console.log("✅ PILOT COMPLETED SUCCESSFULLY.");
}

runPilot().catch(console.error);
