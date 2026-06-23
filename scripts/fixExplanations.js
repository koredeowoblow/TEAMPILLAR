import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import fs from "fs";
import Groq from "groq-sdk";
import Question from "../src/models/QuestionModel.js";
import { connectMongoDB } from "../src/config/mongodb.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const isDryRun = !process.argv.includes('--apply');
const limitArgIndex = process.argv.indexOf('--limit');
const runLimit = limitArgIndex > -1 ? parseInt(process.argv[limitArgIndex + 1]) : null;

async function generateSingleExplanation(item, attempt = 1) {
  const prompt = `You are an expert UTME tutor for ${item.subject}. Given a question, its options, and the correct answer, write a detailed explanation a student can learn from.
Rules:
1. Restate in one line what the question is asking.
2. State the formula or concept needed.
3. Show every calculation step explicitly, plugging in the actual numbers from the question, with units where relevant. Never skip a step.
4. End by stating the final value and matching it to the correct option letter.
5. If conceptual rather than calculation-based, explain the reasoning instead of forcing a calculation.
6. Keep it under 150 words, but completeness of steps matters more than brevity.
Question: ${item.question}
Options: ${item.options}
Correct Answer: ${item.correctAnswer}
Topic: ${item.topic}
Output only the explanation text, no preamble, no markdown.`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
    });
    
    let text = chatCompletion.choices[0]?.message?.content || "";
    return { success: true, text: text.trim(), id: item.id };
  } catch(e) {
    if (e.message.includes("429") || e.message.includes("Rate limit") || e.message.includes("tokens")) {
      if (attempt <= 3) {
        console.log(`Rate limit for ${item.id}, waiting ${attempt * 5}s...`);
        await new Promise(r => setTimeout(r, 5000 * attempt));
        return generateSingleExplanation(item, attempt + 1);
      }
    }
    console.error(`Error generating explanation for ${item.id} on attempt ${attempt}:`, e.message);
    return { success: false, error: e.message, id: item.id };
  }
}

async function run() {
  console.log(`Starting fixExplanations in ${isDryRun ? "DRY RUN" : "APPLY"} mode.`);
  if (runLimit) console.log(`Limiting to ${runLimit} questions.`);
  
  const reportPath = resolve(process.cwd(), "audit-report.json");
  if (!fs.existsSync(reportPath)) {
    console.error("audit-report.json not found!");
    process.exit(1);
  }

  const auditData = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  let poorQuestions = auditData.filter(q => q.verdict === "POOR");
  
  // Interleave subjects so the first N questions are a mix of all subjects
  const mathQ = poorQuestions.filter(q => q.subject === "Mathematics");
  const phyQ = poorQuestions.filter(q => q.subject === "Physics");
  const chemQ = poorQuestions.filter(q => q.subject === "Chemistry");

  let interleaved = [];
  let maxLen = Math.max(mathQ.length, phyQ.length, chemQ.length);
  for(let i = 0; i < maxLen; i++){
    if (mathQ[i]) interleaved.push(mathQ[i]);
    if (phyQ[i]) interleaved.push(phyQ[i]);
    if (chemQ[i]) interleaved.push(chemQ[i]);
  }
  poorQuestions = interleaved;

  if (runLimit) {
    poorQuestions = poorQuestions.slice(0, runLimit);
  }
  
  console.log(`Found ${auditData.filter(q => q.verdict === "POOR").length} POOR questions total. Will process ${poorQuestions.length}.`);

  if (poorQuestions.length === 0) return process.exit(0);

  await connectMongoDB();

  let totalSucceeded = 0;
  let totalFailed = 0;
  let fixFailures = [];
  let fixReport = [];

  const BATCH_SIZE = 3; 
  
  fs.writeFileSync(resolve(process.cwd(), "fix-report.json"), "[]");
  fs.writeFileSync(resolve(process.cwd(), "fix-failures.json"), "[]");

  for (let i = 0; i < poorQuestions.length; i += BATCH_SIZE) {
    const batchList = poorQuestions.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(poorQuestions.length/BATCH_SIZE)}...`);
    
    const dbDocs = await Question.find({ _id: { $in: batchList.map(q => q.questionId) } });
    
    const batchPromises = batchList.map(async (poorQ) => {
      const qDoc = dbDocs.find(d => d._id.toString() === poorQ.questionId.toString());
      if (!qDoc) {
        return { success: false, error: "Not found in DB", id: poorQ.questionId };
      }
      
      const qText = qDoc.content?.text || "";
      let optionsText = "";
      let correctAnswerText = "";
      
      if (qDoc.options) {
        qDoc.options.forEach(opt => {
          optionsText += `\n${opt.id || opt.text}: ${opt.text}`;
          if (opt.isCorrect) correctAnswerText = opt.text;
        });
      }

      return generateSingleExplanation({
        id: qDoc._id.toString(),
        subject: poorQ.subject,
        topic: poorQ.topic,
        question: qText,
        options: optionsText,
        correctAnswer: correctAnswerText,
        dbDoc: qDoc,
        oldExplanation: poorQ.currentExplanation
      });
    });

    const results = await Promise.all(batchPromises);

    for (const res of results) {
      if (res.success) {
        totalSucceeded++;
        const targetQ = batchList.find(q => q.questionId === res.id);
        
        fixReport.push({
          questionId: res.id,
          subject: targetQ.subject,
          topic: targetQ.topic,
          oldExplanation: targetQ.currentExplanation,
          newExplanationDraft: res.text
        });

        if (!isDryRun) {
          await Question.updateOne(
            { _id: res.id },
            { $set: { explanationDraft: res.text } }
          );
        }
      } else {
        totalFailed++;
        fixFailures.push({ questionId: res.id, error: res.error });
      }
    }

    fs.writeFileSync(resolve(process.cwd(), "fix-report.json"), JSON.stringify(fixReport, null, 2));
    fs.writeFileSync(resolve(process.cwd(), "fix-failures.json"), JSON.stringify(fixFailures, null, 2));

    if (i + BATCH_SIZE < poorQuestions.length) {
      await new Promise(r => setTimeout(r, 6500));
    }
  }

  console.log("\n--- FIX EXPLANATIONS SUMMARY ---");
  console.log(`Mode: ${isDryRun ? "DRY RUN (No DB Writes)" : "APPLY (Wrote to DB)"}`);
  console.log(`Total Flagged (Processed): ${poorQuestions.length}`);
  console.log(`Total Succeeded: ${totalSucceeded}`);
  console.log(`Total Failed: ${totalFailed}`);

  process.exit(0);
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
