import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import fs from "fs";
import crypto from "crypto";
import dns from "node:dns";

import Subject from "../src/models/SubjectModel.js";
import Question from "../src/models/QuestionModel.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const JSON_FILES = [
  "eco_data.json",
  "fm_data.json",
  "geo_data.json",
  "gov_data.json",
  "jamb_questions.json",
  "doc.json",
  "utme_new_subjects.json",
  "utme_questions.json",
  "utme_questions1.json"
];

function normalizeString(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function generateHash(questionObj) {
  const { subject, question, options, correctAnswer } = questionObj;
  const strToHash = `${normalizeString(subject)}|${normalizeString(question)}|${normalizeString(options.A)}|${normalizeString(options.B)}|${normalizeString(options.C)}|${normalizeString(options.D)}|${normalizeString(correctAnswer)}`;
  return crypto.createHash("sha256").update(strToHash).digest("hex");
}

function normalizeOptions(optionsData) {
  const result = { A: "", B: "", C: "", D: "" };
  if (!optionsData) return result;
  
  if (Array.isArray(optionsData)) {
    const letters = ["A", "B", "C", "D"];
    optionsData.forEach((opt, idx) => {
      if (idx < 4) {
        if (opt.id && opt.text) {
          result[opt.id] = opt.text;
        } else {
          result[letters[idx]] = opt;
        }
      }
    });
  } else if (typeof optionsData === "object") {
    // Maybe {"A": "val", "B": "val"}
    if (optionsData.A !== undefined) result.A = optionsData.A;
    if (optionsData.B !== undefined) result.B = optionsData.B;
    if (optionsData.C !== undefined) result.C = optionsData.C;
    if (optionsData.D !== undefined) result.D = optionsData.D;
  }
  return result;
}

function extractCorrectAnswer(optionsData, answerField) {
  if (answerField && (answerField === "A" || answerField === "B" || answerField === "C" || answerField === "D")) {
    return answerField;
  }
  if (Array.isArray(optionsData)) {
    const correctOpt = optionsData.find(o => o.isCorrect);
    if (correctOpt && correctOpt.id) return correctOpt.id;
  }
  return answerField || "A";
}

function formatQuestion(q, sourceSubject = "") {
  const subject = q.subject || sourceSubject || "Unknown";
  const topic = q.topic || "General";
  const difficulty = q.difficulty || "medium";
  const questionText = q.question || (q.content && q.content.text) || "";
  const options = normalizeOptions(q.options);
  const correctAnswer = extractCorrectAnswer(q.options, q.answer || q.correctAnswer);
  const explanation = q.explanation || "";

  return {
    id: q.id || q._id?.toString() || q.metadata?.questionCode || `Q_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    subject: toTitleCase(subject),
    topic,
    difficulty,
    question: questionText,
    options,
    correctAnswer,
    explanation
  };
}

function toTitleCase(str) {
  if (!str) return "";
  return str.trim().toLowerCase().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

async function runAudit() {
  console.log("🚀 Starting Phase 1 & 2: Audit and Deduplication");
  
  const allRawQuestions = [];
  const stats = {
    totalFound: 0,
    fromDB: 0,
    fromJSON: 0,
    duplicatesRemoved: 0,
    uniqueRemaining: 0,
    bySubject: {}
  };

  // 1. Audit MongoDB
  if (process.env.MONGO_URI) {
    try {
      console.log("🔌 Connecting to DB to fetch existing questions...");
      await mongoose.connect(process.env.MONGO_URI, { dbName: "teampillar" });
      const subjects = await Subject.find({});
      const subjectMap = {};
      subjects.forEach(s => subjectMap[s._id.toString()] = s.name);
      
      const dbQuestions = await Question.find({});
      console.log(`✅ Found ${dbQuestions.length} questions in Database.`);
      stats.fromDB = dbQuestions.length;
      
      dbQuestions.forEach(q => {
        const subjectName = subjectMap[q.subjectId.toString()] || "Unknown";
        const formatted = formatQuestion(q.toObject(), subjectName);
        if (formatted.question) {
          allRawQuestions.push(formatted);
          stats.totalFound++;
        }
      });
      await mongoose.disconnect();
    } catch (e) {
      console.log("⚠️ DB connection failed. Skipping DB audit.", e.message);
    }
  }

  // 2. Audit JSON Files
  for (const file of JSON_FILES) {
    const filePath = resolve(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      console.log(`📂 Reading ${file}...`);
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(content);
        
        let questionsArr = [];
        // Handle different structures
        if (Array.isArray(data)) {
          questionsArr = data;
        } else if (data.subjects) {
          // utme_new_subjects.json or jamb_questions.json structure
          for (const [subj, qs] of Object.entries(data.subjects)) {
            qs.forEach(q => {
              q.subject = subj; // Force subject from key
              questionsArr.push(q);
            });
          }
        } else {
          // might be an object wrapping an array
          const possibleArrayKeys = Object.keys(data).filter(k => Array.isArray(data[k]));
          if (possibleArrayKeys.length > 0) {
            questionsArr = data[possibleArrayKeys[0]];
          }
        }

        console.log(`   -> Found ${questionsArr.length} questions in ${file}`);
        stats.fromJSON += questionsArr.length;
        
        // Try to derive subject from filename if not in objects
        let fileSubject = file.replace(/_data\.json$/, "").replace(/\.json$/, "");
        if (fileSubject === "eco") fileSubject = "Economics";
        if (fileSubject === "fm") fileSubject = "Further Mathematics";
        if (fileSubject === "geo") fileSubject = "Geography";
        if (fileSubject === "gov") fileSubject = "Government";
        
        questionsArr.forEach(q => {
          const formatted = formatQuestion(q, fileSubject);
          if (formatted.question) {
            allRawQuestions.push(formatted);
            stats.totalFound++;
          }
        });
        
      } catch (e) {
        console.log(`⚠️ Error reading ${file}: ${e.message}`);
      }
    }
  }

  console.log(`\n🔍 Found total of ${stats.totalFound} raw questions. Starting Deduplication...`);

  // 3. Deduplication Engine
  const uniqueQuestions = [];
  const hashes = new Set();
  const normalizedQuestionTexts = new Set(); // To catch near-duplicates

  for (const q of allRawQuestions) {
    // 1. Exact match via hash
    const hash = generateHash(q);
    if (hashes.has(hash)) {
      stats.duplicatesRemoved++;
      continue;
    }

    // 2. Near-duplicate via normalized text + subject
    const textHash = `${normalizeString(q.subject)}|${normalizeString(q.question)}`;
    if (normalizedQuestionTexts.has(textHash)) {
      stats.duplicatesRemoved++;
      continue;
    }

    hashes.add(hash);
    normalizedQuestionTexts.add(textHash);
    
    uniqueQuestions.push(q);
    
    // Stats
    const s = q.subject;
    if (!stats.bySubject[s]) stats.bySubject[s] = 0;
    stats.bySubject[s]++;
  }

  stats.uniqueRemaining = uniqueQuestions.length;

  console.log("\n📊 Phase 1 & 2 Complete. Final Report:");
  console.log("------------------------------------------------");
  console.log(`Total Existing Questions Found : ${stats.totalFound}`);
  console.log(`  -> From Database             : ${stats.fromDB}`);
  console.log(`  -> From JSON Files           : ${stats.fromJSON}`);
  console.log(`Duplicates Removed             : ${stats.duplicatesRemoved}`);
  console.log(`Unique Questions Remaining     : ${stats.uniqueRemaining}`);
  console.log("\nBreakdown by Subject:");
  
  const sortedSubjects = Object.entries(stats.bySubject).sort((a,b) => b[1] - a[1]);
  for (const [subj, count] of sortedSubjects) {
    console.log(`  - ${subj.padEnd(25)}: ${count}`);
  }

  // 4. Save to master JSON
  const outPath = resolve(process.cwd(), "master_unique_questions.json");
  fs.writeFileSync(outPath, JSON.stringify(uniqueQuestions, null, 2));
  console.log(`\n💾 Saved ${uniqueQuestions.length} unique questions to master_unique_questions.json`);
}

runAudit();
