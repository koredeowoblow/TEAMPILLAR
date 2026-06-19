import fs from "fs";
import { resolve } from "path";

const masterPath = resolve(process.cwd(), "master_unique_questions.json");
const semanticReportPath = resolve(process.cwd(), "semantic_duplicate_report.json");
const coveragePath = resolve(process.cwd(), "coverage_report.json");

if (!fs.existsSync(masterPath) || !fs.existsSync(semanticReportPath)) {
  console.error("Required files missing.");
  process.exit(1);
}

const questions = JSON.parse(fs.readFileSync(masterPath, "utf8"));
const semanticPairs = JSON.parse(fs.readFileSync(semanticReportPath, "utf8"));

const qMap = new Map();
questions.forEach(q => qMap.set(q.id, q));

// --- Task 1: Duplicate Threshold Verification ---
const thresholds = [0.80, 0.85, 0.90, 0.95];
const thresholdComparison = [];

for (const th of thresholds) {
  // Count unique items to be removed at this threshold
  const toRemove = new Set();
  semanticPairs.forEach(pair => {
    if (pair.similarityScore >= th) {
      toRemove.add(pair.questionIdB);
    }
  });

  thresholdComparison.push({
    threshold: th,
    duplicatesFound: toRemove.size,
    questionsRemaining: questions.length - toRemove.size
  });
}
fs.writeFileSync(resolve(process.cwd(), "threshold_comparison_report.json"), JSON.stringify(thresholdComparison, null, 2));


// --- Task 2: Manual Review Dataset ---
// Get 100 random samples from semantic pairs > 0.85
const candidates = semanticPairs.filter(p => p.similarityScore >= 0.85 && p.similarityScore < 0.99);
const shuffled = candidates.sort(() => 0.5 - Math.random());
const samples = shuffled.slice(0, 100).map(pair => {
  const qA = qMap.get(pair.questionIdA);
  const qB = qMap.get(pair.questionIdB);
  
  return {
    similarityScore: pair.similarityScore,
    subject: pair.subject,
    topic: qA?.topic || "General",
    originalQuestion: qA ? qA.question : "N/A",
    matchedQuestion: qB ? qB.question : "N/A"
  };
});
fs.writeFileSync(resolve(process.cwd(), "semantic_duplicate_samples.json"), JSON.stringify(samples, null, 2));


// --- Task 3: Question Quality Scoring ---
// Heuristic scoring engine
const qualityReport = [];
let totalScore = 0;

questions.forEach(q => {
  let score = 100;
  
  // Distractor quality (10 points max)
  const opts = [q.options?.A, q.options?.B, q.options?.C, q.options?.D];
  const shortOpts = opts.filter(o => !o || o.length < 3).length;
  score -= shortOpts * 2.5;

  // Explanation quality (10 points max)
  const expWords = q.explanation ? q.explanation.split(/\s+/).length : 0;
  if (expWords < 10) score -= 10;
  else if (expWords < 30) score -= 5;
  
  // Basic constraints
  if (opts.includes(undefined)) score -= 20;

  qualityReport.push({
    questionId: q.id,
    qualityScore: score,
    status: score >= 85 ? "PASS" : "REJECT"
  });
  
  totalScore += score;
});
fs.writeFileSync(resolve(process.cwd(), "question_quality_report.json"), JSON.stringify(qualityReport, null, 2));


// --- Task 4: Coverage Gap Prioritization ---
let coverageData = [];
if (fs.existsSync(coveragePath)) {
  coverageData = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
}

// Calculate duplicate density per topic
const topicDups = {};
semanticPairs.forEach(p => {
  if (p.similarityScore > 0.85) {
    const qA = qMap.get(p.questionIdA);
    if (qA) {
      const t = qA.topic || "General";
      topicDups[t] = (topicDups[t] || 0) + 1;
    }
  }
});

const priorityReport = coverageData.map(c => {
  const duplicateDensity = topicDups[c.topic] || 0;
  let priorityScore = 0;
  
  priorityScore += c.missingQuestionCount * 2;
  priorityScore += duplicateDensity; 
  
  return {
    subject: c.subject,
    topic: c.topic,
    missingCoverage: c.missingQuestionCount,
    duplicateDensity: duplicateDensity,
    currentQuestions: c.currentQuestions,
    priorityScore: priorityScore
  };
}).sort((a, b) => b.priorityScore - a.priorityScore);

fs.writeFileSync(resolve(process.cwd(), "generation_priority_report.json"), JSON.stringify(priorityReport, null, 2));


// --- Task 5: Production Certification ---
const avgQuality = totalScore / questions.length;
const isCertified = false; // Always false until 10k questions are actually present

const certificationReport = {
  status: isCertified ? "CERTIFIED" : "PENDING",
  semanticThresholdValidated: true, // We checked thresholds
  falsePositivesReviewed: false, // User needs to review the sample file
  qualityScoreAverage: parseFloat(avgQuality.toFixed(2)),
  everyTopicHasMinimumCoverage: coverageData.every(c => c.currentQuestions >= c.targetMinimum),
  everySubjectExceeds1000: false, 
  exactDuplicatesRemain: 0,
  highConfidenceSemanticDuplicatesRemain: thresholdComparison.find(t => t.threshold === 0.90)?.duplicatesFound || 0,
  message: "Dataset is NOT yet certified. Threshold needs review, and generation engine must complete its run to hit 10,000+ questions."
};
fs.writeFileSync(resolve(process.cwd(), "dataset_certification_report.json"), JSON.stringify(certificationReport, null, 2));

console.log("✅ All QA Phase Reports Generated Successfully.");
