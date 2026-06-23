import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import fs from "fs";
import Groq from "groq-sdk";
import Subject from "../src/models/SubjectModel.js";
import Question from "../src/models/QuestionModel.js";
import { connectMongoDB } from "../src/config/mongodb.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function evaluateBorderlineBatch(questionsObjList, attempt = 1) {
  if (questionsObjList.length === 0) return [];

  const prompt = `You are an expert UTME examiner. Evaluate the explanations for these ${questionsObjList.length} questions.
      A POOR explanation:
      - Is extremely short and lacking detail.
      - Restates the correct answer without showing working or giving reasons.
      - Missing key formulas or clear calculation steps for math/physics/chemistry.
      A GOOD explanation clearly shows the steps, reasoning, formulas, and substitution used to arrive at the answer.
      Here are the questions as JSON:
      ${JSON.stringify(questionsObjList.map((q, i) => ({ id: i, ...q })))}
      Return ONLY a valid JSON array of objects with this format:
      [ {"id": 0, "verdict": "GOOD" | "POOR", "reason": "string"}, ... ]`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
    });

    let text = chatCompletion.choices[0]?.message?.content || "";
    // Extract JSON array using regex
    const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
    if (jsonMatch) {
      text = jsonMatch[0];
    } else {
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    const result = JSON.parse(text);
    return result;
  } catch (e) {
    if (e.message.includes("429") || e.message.includes("Rate limit") || e.message.includes("tokens")) {
      console.log(`Rate limit hit (Batch of ${questionsObjList.length}). Waiting 10s...`);
      await new Promise(r => setTimeout(r, 10000));
      if (attempt <= 3) return evaluateBorderlineBatch(questionsObjList, attempt + 1);
    }
    console.error("Groq error in batch:", e.message);
    return questionsObjList.map((_, i) => ({ id: i, verdict: "POOR", reason: "API Error or Unparseable: " + e.message }));
  }
}

function extractNumbers(text) {
  const matches = (text || "").match(/\d+(\.\d+)?/g);
  return matches ? matches : [];
}

function auditQuestion(qText, optionsText, explanation) {
  if (!explanation) return { verdict: "POOR", reason: "No explanation provided", isBorderline: false };

  const words = explanation.trim().split(/\s+/).length;
  const qNums = extractNumbers(qText);
  const optNums = extractNumbers(optionsText);
  const allNums = new Set([...qNums, ...optNums]);
  const expNums = extractNumbers(explanation);

  let numMatch = false;
  if (allNums.size > 0) {
    for (const num of expNums) {
      if (allNums.has(num)) {
        numMatch = true;
        break;
      }
    }
  } else {
    numMatch = true;
  }

  const stepsRegex = /=|\+|-|\/|\*|step|substitute|formula|equation|therefore|hence/i;
  const hasSteps = stepsRegex.test(explanation);

  const restatesRegex = /correct answer is|is correct|option [A-D] is correct/i;
  const justRestates = restatesRegex.test(explanation) && words < 30 && !hasSteps;

  if (justRestates) return { verdict: "POOR", reason: "Just restates answer", isBorderline: false };
  if (words < 40) return { verdict: "POOR", reason: "Under 40 words", isBorderline: false };
  if (allNums.size > 0 && !numMatch) return { verdict: "POOR", reason: "Contains none of the numbers from question/options", isBorderline: false };

  // For subjects like Math/Physics/Chem, steps are expected.
  if (!hasSteps && words < 80) return { verdict: "UNKNOWN", reason: "No clear sequence of steps (no formula/substitution)", isBorderline: true };
  if (words >= 40 && words <= 60) return { verdict: "UNKNOWN", reason: "Borderline word count (40-60)", isBorderline: true };

  return { verdict: "GOOD", reason: "Passes local heuristics", isBorderline: false };
}

async function runAudit() {
  console.log("Connecting to MongoDB...");
  await connectMongoDB();

  const subjectsToAudit = ["Mathematics", "Physics", "Chemistry"];
  const subjects = await Subject.find({ name: { $in: subjectsToAudit } });

  const subjectMap = {};
  subjects.forEach(s => { subjectMap[s._id.toString()] = s.name; });

  const subjectIds = Object.keys(subjectMap);
  const questions = await Question.find({ subjectId: { $in: subjectIds } }).lean();
  console.log(`Found ${questions.length} total questions to audit.`);

  const results = [];
  const summary = {
    "Mathematics": { total: 0, poor: 0 },
    "Physics": { total: 0, poor: 0 },
    "Chemistry": { total: 0, poor: 0 },
  };

  let borderlineBatch = [];
  let borderlineRefs = [];

  const processBatch = async () => {
    if (borderlineBatch.length === 0) return;

    console.log(`Processing LLM batch of ${borderlineBatch.length} borderline cases...`);
    const llmResults = await evaluateBorderlineBatch(borderlineBatch);

    for (const res of llmResults) {
      if (res && res.id !== undefined && borderlineRefs[res.id]) {
        const ref = borderlineRefs[res.id];
        ref.auditResult.verdict = res.verdict || "POOR";
        ref.auditResult.reason = "LLM: " + (res.reason || "Unknown reason");
      }
    }

    // Processed, now save back to results and update summary
    for (const ref of borderlineRefs) {
      if (ref.auditResult.verdict === "POOR") {
        summary[ref.subjectName].poor++;
      }
      results.push({
        questionId: ref.q._id,
        subject: ref.subjectName,
        topic: ref.q.metadata?.topic || "Unknown",
        currentExplanation: ref.explanation,
        verdict: ref.auditResult.verdict,
        reason: ref.auditResult.reason
      });
    }

    borderlineBatch = [];
    borderlineRefs = [];
    await new Promise(r => setTimeout(r, 2000)); // wait 2s between batches
  };

  let count = 0;
  for (const q of questions) {
    count++;
    if (count % 100 === 0) console.log(`Evaluated heuristics for ${count}/${questions.length}`);

    const subjectName = subjectMap[q.subjectId.toString()];
    summary[subjectName].total++;

    const qText = q.content?.text || "";
    let optionsText = "";
    let correctAnswerText = "";

    if (q.options) {
      q.options.forEach(opt => {
        optionsText += opt.text + " ";
        if (opt.isCorrect) correctAnswerText = opt.text;
      });
    }

    const explanation = q.explanation || "";
    let auditResult = auditQuestion(qText, optionsText, explanation);

    if (auditResult.isBorderline) {
      borderlineBatch.push({
        question: qText,
        options: q.options ? q.options.map(o => o.text) : [],
        correctAnswer: correctAnswerText,
        explanation: explanation
      });
      borderlineRefs.push({ q, subjectName, explanation, auditResult });

      if (borderlineBatch.length >= 10) {
        await processBatch();
      }
    } else {
      if (auditResult.verdict === "POOR") {
        summary[subjectName].poor++;
      }
      results.push({
        questionId: q._id,
        subject: subjectName,
        topic: q.metadata?.topic || "Unknown",
        currentExplanation: explanation,
        verdict: auditResult.verdict,
        reason: auditResult.reason
      });
    }
  }

  // Process remaining
  await processBatch();

  console.log("\n--- AUDIT SUMMARY ---");
  for (const [subj, counts] of Object.entries(summary)) {
    console.log(`${subj}: ${counts.total} total questions audited. ${counts.poor} flagged POOR.`);
  }

  fs.writeFileSync(resolve(process.cwd(), "audit-report.json"), JSON.stringify(results, null, 2));
  console.log("Results written to audit-report.json");

  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
