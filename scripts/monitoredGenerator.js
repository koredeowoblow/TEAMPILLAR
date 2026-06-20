import fs from "fs";
import { resolve } from "path";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import crypto from "crypto";
import { pipeline } from "@xenova/transformers";
import { validateFactuality, heuristicFactCheck } from "./factualAccuracyEngine.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

if (!fs.existsSync(resolve(process.cwd(), "logs"))) {
  fs.mkdirSync(resolve(process.cwd(), "logs"));
}

const DEBUG_LOG = resolve(process.cwd(), "logs/generator-debug.log");
function logDebug(msg) {
  const ts = new Date().toISOString();
  fs.appendFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`);
}

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
  logDebug(`UNHANDLED REJECTION: ${err.message}\n${err.stack}`);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  logDebug(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
});

const BATCH_SIZE = 1000; // Configurable: 100, 250, 500
const GLOBAL_TARGET = 1000; // Temporary cap
const SAVE_INTERVAL = 25; // Checkpoint interval
const STATE_PATH = resolve(process.cwd(), "generation_state.json");
const TARGET_MIN_TOPIC = 50;
const TARGET_PREF_TOPIC = 100;
const TARGET_MAX_TOPIC = 150;
const TARGET_SUBJECT = 1000;

const DATA_PATH = resolve(process.cwd(), "master_unique_questions_certified.json");
const SYLLABUS_PATH = resolve(process.cwd(), "scripts/syllabus.json");

let dataset = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) : [];
const syllabus = fs.existsSync(SYLLABUS_PATH) ? JSON.parse(fs.readFileSync(SYLLABUS_PATH, "utf8")) : {};

let extractor = null;
const allEmbeddings = [];
let totalGeneratedSinceStart = 0;
let totalAcceptedSinceStart = 0;

let rejectionBreakdown = fs.existsSync(resolve(process.cwd(), "rejection_breakdown.json")) ? JSON.parse(fs.readFileSync(resolve(process.cwd(), "rejection_breakdown.json"), "utf8")) : [];
let rejectionSummary = fs.existsSync(resolve(process.cwd(), "rejection_summary.json")) ? JSON.parse(fs.readFileSync(resolve(process.cwd(), "rejection_summary.json"), "utf8")) : {
  semanticDuplicates: 0,
  factFailures: 0,
  lowConfidence: 0,
  invalidStructure: 0,
  weakExplanation: 0,
  other: 0
};
let rejectedSamples = fs.existsSync(resolve(process.cwd(), "rejected_question_samples.json")) ? JSON.parse(fs.readFileSync(resolve(process.cwd(), "rejected_question_samples.json"), "utf8")) : [];

function logRejection(q, reason, category, details) {
  const record = { questionId: q.id, subject: q.subject, topic: q.topic, rejectionReason: reason, details };
  rejectionBreakdown.push(record);
  if (rejectionSummary[category] !== undefined) {
    rejectionSummary[category]++;
  } else {
    rejectionSummary["other"]++;
  }

  if (rejectedSamples.length < 20) {
    rejectedSamples.push({ fullQuestion: q, exactFailureReason: reason, scores: details.scores || null });
    fs.writeFileSync(resolve(process.cwd(), "rejected_question_samples.json"), JSON.stringify(rejectedSamples, null, 2));
  }

  fs.writeFileSync(resolve(process.cwd(), "rejection_breakdown.json"), JSON.stringify(rejectionBreakdown, null, 2));
  fs.writeFileSync(resolve(process.cwd(), "rejection_summary.json"), JSON.stringify(rejectionSummary, null, 2));
}

let generationState = {
  lastBatchId: null,
  acceptedQuestions: 0,
  currentSubject: null,
  currentTopic: null
};

import { getRedisClient } from "../src/config/redis.js";
const redisClient = await getRedisClient();

const redisState = await redisClient.get("monitored_generator_state");
if (redisState) {
  try {
    generationState = JSON.parse(redisState);
    console.log(`♻️ Resuming generation from Redis state. Accepted so far: ${generationState.acceptedQuestions}`);
  } catch (e) {
    console.warn("Could not parse Redis state", e);
  }
} else if (fs.existsSync(STATE_PATH)) {
  generationState = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  console.log(`♻️ Resuming generation from legacy file state. Accepted so far: ${generationState.acceptedQuestions}`);
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

// ---------------- Drift Detection ----------------
const driftStats = { templates: {}, distractors: {}, explanations: {} };

function checkDrift(questionObj) {
  // Check if first 3 words of explanation repeat
  const explanationText = questionObj.explanation || "";
  const explStart = explanationText.split(" ").slice(0, 3).join(" ");
  driftStats.explanations[explStart] = (driftStats.explanations[explStart] || 0) + 1;

  const threshold = Math.max(10, BATCH_SIZE * 0.10); // 10%
  if (driftStats.explanations[explStart] > threshold) {
    return `Drift Detected: Explanation pattern '${explStart}' exceeds 10%`;
  }
  return null;
}

// ---------------- Subject Prioritization ----------------
function getNextSubjectAndTopic() {
  const countsBySubject = {};
  const countsByTopic = {};

  dataset.forEach(q => {
    countsBySubject[q.subject] = (countsBySubject[q.subject] || 0) + 1;
    if (!countsByTopic[q.subject]) countsByTopic[q.subject] = {};
    countsByTopic[q.subject][q.topic || "General"] = (countsByTopic[q.subject][q.topic || "General"] || 0) + 1;
  });

  // Priority tiers
  const tier1 = []; // < 500
  const tier2 = []; // < 750
  const tier3 = []; // < 1000

  for (const subj of Object.keys(syllabus)) {
    const c = countsBySubject[subj] || 0;
    if (c < 500) tier1.push(subj);
    else if (c < 750) tier2.push(subj);
    else if (c < TARGET_SUBJECT) tier3.push(subj);
  }

  const targetTier = tier1.length > 0 ? tier1 : (tier2.length > 0 ? tier2 : tier3);
  if (targetTier.length === 0) return null; // All done!

  const subject = targetTier[Math.floor(Math.random() * targetTier.length)];

  // Topic balancing
  const subjTopics = syllabus[subject] || [];
  let bestTopic = subjTopics[0];
  let minCount = 99999;

  for (const t of subjTopics) {
    const c = countsByTopic[subject]?.[t] || 0;
    if (c < TARGET_MIN_TOPIC && c < minCount) {
      minCount = c;
      bestTopic = t;
    }
  }

  // If all > 50, find one < 150
  if (minCount >= TARGET_MIN_TOPIC) {
    for (const t of subjTopics) {
      const c = countsByTopic[subject]?.[t] || 0;
      if (c < TARGET_MAX_TOPIC && c < minCount) {
        minCount = c;
        bestTopic = t;
      }
    }
  }

  if (minCount >= TARGET_MAX_TOPIC) return null; // Subject topic capacity reached

  return { subject, topic: bestTopic };
}

// ---------------- The Pipeline ----------------
async function runMonitoredGeneration() {
  logDebug("Starting Monitored Large-Scale Generation Pipeline");
  console.log("🚀 Starting Monitored Large-Scale Generation Pipeline");
  console.log("Loading Extractor...");
  extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { quantized: true });

  let isGenerationComplete = false;

  while (!isGenerationComplete) {
    if (generationState.acceptedQuestions >= GLOBAL_TARGET) {
      console.log(`🎯 Global Target of ${GLOBAL_TARGET} reached! Completing run.`);
      isGenerationComplete = true;
      break;
    }
    logDebug(`Starting Batch of ${BATCH_SIZE}`);
    console.log(`\n--- Starting Batch of ${BATCH_SIZE} ---`);
    let batchGenerated = 0;
    let batchAccepted = 0;
    let batchRejected = 0;
    let totalConf = 0;
    let duplicateRejects = 0;
    const batchAcceptedItems = [];

    while (batchGenerated < BATCH_SIZE) {
      try {
        const target = getNextSubjectAndTopic();
        if (!target) {
          logDebug("No target available, generation complete.");
          isGenerationComplete = true;
          break; // Reached global 10k target
        }
        logDebug(`Target selected: ${target.subject} - ${target.topic}`);

        // Real LLM Generation via Groq
        const prompt = `Generate 5 UNIQUE, challenging UTME-style multiple choice questions for ${target.subject} on ${target.topic}.
Each explanation MUST be between 30 and 150 words. Output strictly as a JSON object containing a "questions" array.
Example format: {"questions": [{"question":"","options":{"A":"","B":"","C":"","D":""},"correctAnswer":"A","explanation":""}]}`;

        let newQs = [];
        let retries = 0;
        let success = false;

        while (retries < 4 && !success) {
          try {
            logDebug(`Calling LLM API for 5 questions (Attempt ${retries + 1})...`);
            const chat = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: "llama-3.1-8b-instant",
              temperature: 0.8,
              response_format: { type: "json_object" }
            });
            const parsed = JSON.parse(chat.choices[0]?.message?.content || "{}");
            newQs = Array.isArray(parsed.questions) ? parsed.questions : [];
            logDebug(`LLM returned ${newQs.length} questions`);
            success = true;
          } catch (err) {
            retries++;
            const isRateLimit = err.status === 429 || err.message.includes("Rate limit") || err.message.includes("429");
            const shortMsg = err.message.length > 200 ? err.message.substring(0, 100) + "... (JSON validation failed)" : err.message;
            console.warn(`⚠️ LLM API Error (Attempt ${retries}): ${shortMsg}`);
            logDebug(`LLM API Error (Attempt ${retries}): ${shortMsg}`);

            if (retries >= 4) {
              console.warn("❌ Max retries reached. Skipping batch.");
              break;
            }

            // Exponential backoff: 2s, 4s, 8s, 16s
            const delay = Math.pow(2, retries) * 1000 + (Math.random() * 500);
            await new Promise(r => setTimeout(r, delay));
          }
        }

        if (!success) continue;

        for (const raw of newQs) {
          if (batchGenerated >= BATCH_SIZE) break;
          batchGenerated++;

          const q = {
            id: `PROD_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            subject: target.subject,
            topic: target.topic,
            question: raw.question,
            options: raw.options || { A: "", B: "", C: "", D: "" },
            correctAnswer: raw.correctAnswer,
            explanation: raw.explanation
          };

          logDebug(`Processing question ${q.id} (subject: ${q.subject})`);

          if (!q.question || !q.correctAnswer || typeof q.options !== 'object' || !q.options.A) {
            logRejection(q, "Invalid JSON structure or missing fields from LLM", "invalidStructure", { raw });
            batchRejected++;
            continue;
          }

          if (!q.explanation || q.explanation.length < 30) {
            logRejection(q, "Weak or missing explanation", "weakExplanation", { explanation: q.explanation });
            batchRejected++;
            continue;
          }

          // 1. Semantic Check
          logDebug(`Semantic validation start for ${q.id}`);
          const context = `Question: ${q.question} Options: A) ${q.options.A} B) ${q.options.B} C) ${q.options.C} D) ${q.options.D}`;
          const output = await extractor(context, { pooling: "mean", normalize: true });
          const vector = Array.from(output.data);
          let isDup = false;
          let highestScore = 0;

          for (const existing of allEmbeddings) {
            const score = cosineSimilarity(vector, existing.vector);
            if (score >= 0.90) {
              isDup = true;
              highestScore = score;
              break;
            }
          }

          if (isDup) {
            logDebug(`Semantic validation FAILED (Duplicate) for ${q.id}`);
            logRejection(q, `Semantic duplicate found`, "semanticDuplicates", { similarityScore: highestScore, threshold: 0.90 });
            batchRejected++;
            duplicateRejects++;
            continue;
          }

          // 1.5. Pre-LLM Heuristic Optimization Filter
          const preHeuristic = heuristicFactCheck(q);
          if (preHeuristic.overallConfidence < 50) {
            logDebug(`Pre-LLM Heuristic FAILED for ${q.id} (Confidence: ${preHeuristic.overallConfidence})`);
            logRejection(q, `Pre-LLM heuristic failed: ${preHeuristic.overallConfidence}`, "weakExplanation", { scores: preHeuristic });
            batchRejected++;
            continue; // Skip the LLM call to save tokens!
          }

          // 2. Factual Check via LLM
          logDebug(`Fact validation start for ${q.id}`);
          const fact = await validateFactuality(q);
          if (fact.overallConfidence < 90) {
            logDebug(`Fact validation FAILED for ${q.id} (Confidence: ${fact.overallConfidence})`);
            logRejection(q, `Confidence below threshold: ${fact.overallConfidence}`, "lowConfidence", { scores: fact });
            batchRejected++;
            continue;
          }
          logDebug(`Fact validation PASSED for ${q.id}`);

          // 3. Drift Check
          const driftError = checkDrift(q);
          if (driftError && !fs.existsSync(resolve(process.cwd(), "drift_detection_report.json"))) {
            console.warn("⚠️ " + driftError);
            logDebug(`Drift Error: ${driftError}`);
            fs.writeFileSync(resolve(process.cwd(), "drift_detection_report.json"), JSON.stringify({ error: driftError, pattern: driftStats }, null, 2));
          }

          allEmbeddings.push({ subject: q.subject, vector });
          dataset.push(q);
          batchAcceptedItems.push(q);
          batchAccepted++;
          totalAcceptedSinceStart++;
          totalConf += fact.overallConfidence;

          generationState.acceptedQuestions++;
          generationState.currentSubject = q.subject;
          generationState.currentTopic = q.topic;

          if (generationState.acceptedQuestions % SAVE_INTERVAL === 0) {
            fs.writeFileSync(DATA_PATH, JSON.stringify(dataset, null, 2));
            fs.writeFileSync(STATE_PATH, JSON.stringify(generationState, null, 2));
            logDebug(`Checkpoint saved: ${generationState.acceptedQuestions} questions.`);
            console.log(`💾 Checkpoint saved: ${generationState.acceptedQuestions} questions.`);
          }

          if (generationState.acceptedQuestions >= GLOBAL_TARGET) {
            isGenerationComplete = true;
            break;
          }

        } // CLOSE the for(const raw of newQs) loop

        if (isGenerationComplete) break;
      } catch (innerErr) {
        console.error("⚠️ Internal loop error:", innerErr.message);
        logDebug(`Internal loop error: ${innerErr.message}\n${innerErr.stack}`);
        console.warn("Question rejected, continuing...");
        continue;
      }
    } // CLOSE the while(batchGenerated < BATCH_SIZE) loop

    logDebug(`Batch complete. Generated: ${batchGenerated}, Accepted: ${batchAccepted}, Rejected: ${batchRejected}`);

    const duplicateRate = (duplicateRejects / Math.max(1, batchGenerated)) * 100;
    const avgConf = batchAccepted > 0 ? (totalConf / batchAccepted) : 0;

    generationState.lastBatchId = `BATCH_${Date.now()}`;
    await redisClient.set("monitored_generator_state", JSON.stringify(generationState));

    const batchReport = {
      batchId: generationState.lastBatchId,
      questionsGenerated: batchGenerated,
      questionsAccepted: batchAccepted,
      questionsRejected: batchRejected,
      duplicateRate: parseFloat(duplicateRate.toFixed(2)),
      averageConfidence: parseFloat(avgConf.toFixed(2)),
      coverageIncrease: batchAccepted
    };

    fs.writeFileSync(resolve(process.cwd(), "batch_report.json"), JSON.stringify(batchReport, null, 2));

    // Stop Conditions
    if (duplicateRate > 5 || avgConf < 90) {
      console.error(`🛑 STOPPING: Safety limits breached (Dup: ${duplicateRate}%, Conf: ${avgConf})`);
      break;
    }

    // Human QA Sampling every 500 accepted (lowered to 100 for demonstration)
    if (totalAcceptedSinceStart >= 100) {
      totalAcceptedSinceStart = 0; // Reset counter
      const sample = [...batchAcceptedItems].sort(() => 0.5 - Math.random()).slice(0, 25);
      fs.writeFileSync(resolve(process.cwd(), "human_review_sample.json"), JSON.stringify(sample, null, 2));
      console.log("📝 Generated Human Review Sample.");
    }
  }

  // Final Reports
  const finalSummary = {
    totalQuestionsReached: dataset.length,
    targetMet: isGenerationComplete
  };
  fs.writeFileSync(resolve(process.cwd(), "final_generation_summary.json"), JSON.stringify(finalSummary, null, 2));
  fs.writeFileSync(resolve(process.cwd(), "final_production_certification.json"), JSON.stringify({ status: isGenerationComplete ? "CERTIFIED" : "IN PROGRESS" }, null, 2));

  fs.writeFileSync(DATA_PATH, JSON.stringify(dataset, null, 2));
  console.log("✅ Pipeline run completed safely.");
}

runMonitoredGeneration().catch(console.error);
