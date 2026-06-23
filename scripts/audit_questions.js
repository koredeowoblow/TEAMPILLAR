import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Question from '../src/models/QuestionModel.js';
import Subject from '../src/models/SubjectModel.js';
import fs from 'fs';

dotenv.config();

const auditQuestions = async () => {
  const isAutoHeal = process.argv.includes('--auto-heal');
  
  console.log(`Connecting to database...`);
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || 'teampillar'
  });

  console.log(`Starting Question Quality Audit... Auto-heal enabled: ${isAutoHeal}`);
  const subjects = await Subject.find({});
  const physicsSubject = subjects.find(s => s.name.toLowerCase().includes('physics'));
  const englishSubject = subjects.find(s => s.name.toLowerCase().includes('english'));

  const reports = {
    totalQuestions: 0,
    invalidQuestions: 0,
    missingOptions: [],
    missingInstructions: [],
    orphanPassages: [],
    duplicates: [],
    misclassifiedPhysics: [],
    lowQualityQuestions: [],
    quarantinedCount: 0,
    regeneratedCount: 0
  };

  const codeSet = new Set();
  const textTrigramSets = [];

  const getTrigrams = (text) => {
    const trigrams = new Set();
    const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.length < 3) return new Set([normalized]);
    for (let i = 0; i < normalized.length - 2; i++) {
      trigrams.add(normalized.substring(i, i + 3));
    }
    return trigrams;
  };

  const calculateJaccardSimilarity = (set1, set2) => {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  };

  const questions = await Question.find({}).lean();
  reports.totalQuestions = questions.length;

  for (const q of questions) {
    if (q.isQuarantined) continue; // Skip already quarantined

    let corrupted = false;
    let reason = [];

    // 1. Missing Options / Text / Answers
    if (!q.content?.text && !q.content?.image && !q.text) {
      reason.push("Missing text");
      reports.lowQualityQuestions.push(q._id.toString());
      corrupted = true;
    }
    if (!q.options || q.options.length < 4) {
      reason.push("Missing options");
      reports.missingOptions.push(q._id.toString());
      corrupted = true;
    }
    if (q.options && !q.options.some(o => o.isCorrect)) {
      reason.push("Missing correct answer");
      reports.lowQualityQuestions.push(q._id.toString());
      corrupted = true;
    }

    // 2. English Instruction check
    if (englishSubject && q.subjectId.toString() === englishSubject._id.toString()) {
      if (!q.metadata?.instruction && !q.instruction) {
        reason.push("Missing English Instruction");
        reports.missingInstructions.push(q._id.toString());
        corrupted = true;
      }
    }

    // Passage check
    const textLower = (q.content?.text || q.text || '').toLowerCase();
    if (textLower.includes('passage') || textLower.includes('extract')) {
      if (!q.passageId) {
        reason.push("Missing linked passage");
        reports.orphanPassages.push(q._id.toString());
        corrupted = true;
      }
    }

    // 3. Subject Misclassification (Physics Engineering)
    if (physicsSubject && q.subjectId.toString() === physicsSubject._id.toString()) {
      const engKeywords = ['thermodynamics engine', 'civil engineering', 'auto mechanic', 'structural load'];
      if (engKeywords.some(k => textLower.includes(k))) {
        reason.push("Engineering terminology in Physics");
        reports.misclassifiedPhysics.push(q._id.toString());
        corrupted = true;
      }
    }

    // 4. Duplicates check
    let isDuplicate = false;
    if (q.metadata?.questionCode && codeSet.has(q.metadata.questionCode)) {
      isDuplicate = true;
    } else if (q.content?.text && q.content.text.length > 20) {
      const tSet = getTrigrams(q.content.text.trim());
      for (const existingSet of textTrigramSets) {
        if (calculateJaccardSimilarity(tSet, existingSet) > 0.85) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        textTrigramSets.push(tSet);
        if (q.metadata?.questionCode) codeSet.add(q.metadata.questionCode);
      }
    }

    if (isDuplicate) {
      reason.push("Duplicate content");
      reports.duplicates.push(q._id.toString());
      corrupted = true;
    }

    // Auto-Heal Execution
    if (corrupted) {
      reports.invalidQuestions++;
      if (isAutoHeal) {
        await Question.updateOne({ _id: q._id }, { 
          $set: { 
            isQuarantined: true, 
            quarantineReason: reason.join(", "),
            quarantineDate: new Date()
          } 
        });
        reports.quarantinedCount++;
      }
    }
  }

  console.log("\n--- AUDIT REPORT ---");
  const finalJson = JSON.stringify({
    totalQuestions: reports.totalQuestions,
    invalidQuestions: reports.invalidQuestions,
    missingOptions: reports.missingOptions.length, // Truncate array output for CLI
    missingInstructions: reports.missingInstructions.length,
    orphanPassages: reports.orphanPassages.length,
    duplicates: reports.duplicates.length,
    misclassifiedPhysics: reports.misclassifiedPhysics.length,
    lowQualityQuestions: reports.lowQualityQuestions.length,
    quarantinedCount: reports.quarantinedCount,
    regeneratedCount: reports.regeneratedCount,
    remainingRisks: reports.invalidQuestions - reports.quarantinedCount
  }, null, 2);
  
  console.log(finalJson);
  fs.writeFileSync('audit_report.json', JSON.stringify(reports, null, 2));
  console.log("Full array dump saved to audit_report.json");
  
  process.exit(0);
};

auditQuestions().catch(console.error);
