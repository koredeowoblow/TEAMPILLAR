import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import { resolve } from "path";
import Question from "../src/models/QuestionModel.js";
import { connectMongoDB } from "../src/config/mongodb.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function queryGroq(prompt, format = "text") {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      ...(format === "json" ? { response_format: { type: "json_object" } } : {})
    })
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  if (format === "json") {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return content.trim();
}

async function fixMissingInstruction(questionId) {
  const q = await Question.findById(questionId);
  if (!q) return false;

  const text = q.content?.text || q.text || "";
  const prompt = `You are an expert English UTME tutor. The following question is missing its instruction (e.g. "Choose the word nearest in meaning", "Choose the correct spelling", "Fill in the gap").
Based on the question text and options, deduce the most likely instruction.
Output ONLY the instruction text, nothing else. No quotes.

Question: ${text}
Options: ${JSON.stringify(q.options)}`;

  try {
    const instruction = await queryGroq(prompt, "text");
    if (instruction && instruction.length < 150) {
      await Question.findByIdAndUpdate(questionId, {
        "metadata.instruction": instruction,
        isQuarantined: false,
        $unset: { quarantineReason: 1 }
      });
      console.log(`[FIXED INSTRUCTION] Q:${questionId} -> ${instruction}`);
      return true;
    }
  } catch(e) {
    console.error(`Failed to fix instruction for ${questionId}`);
  }
  return false;
}

async function fixMissingOptions(questionId) {
  const q = await Question.findById(questionId);
  if (!q) return false;

  const text = q.content?.text || q.text || "";
  const prompt = `You are a UTME examiner. The following question is missing some or all of its A, B, C, D options.
Generate 4 plausible options for this question. One of them MUST be correct.
Output strict JSON: { "options": [ { "key": "A", "text": "...", "isCorrect": false }, ... ] }

Question: ${text}`;

  try {
    const res = await queryGroq(prompt, "json");
    if (res && res.options && res.options.length === 4) {
      await Question.findByIdAndUpdate(questionId, {
        options: res.options,
        isQuarantined: false,
        $unset: { quarantineReason: 1 }
      });
      console.log(`[FIXED OPTIONS] Q:${questionId}`);
      return true;
    }
  } catch(e) {
    console.error(`Failed to fix options for ${questionId}`);
  }
  return false;
}

async function runAutoHeal() {
  console.log("Connecting to database...");
  await connectMongoDB();

  const reportPath = resolve(process.cwd(), "audit_report.json");
  if (!fs.existsSync(reportPath)) {
    console.error("audit_report.json not found!");
    process.exit(1);
  }

  const auditData = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  let fixedCount = 0;

  console.log(`Found ${auditData.missingInstructions.length} missing instructions to fix.`);
  for (const id of auditData.missingInstructions) {
    const success = await fixMissingInstruction(id);
    if (success) fixedCount++;
    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }

  console.log(`Found ${auditData.missingOptions.length} missing options to fix.`);
  for (const id of auditData.missingOptions) {
    const success = await fixMissingOptions(id);
    if (success) fixedCount++;
    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }

  console.log(`\nAuto-Heal Complete. Fixed & Unquarantined: ${fixedCount} questions.`);
  process.exit(0);
}

runAutoHeal().catch(console.error);
