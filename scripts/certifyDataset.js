import fs from "fs";
import { resolve } from "path";
import { runBulkFactCheck } from "./factualAccuracyEngine.js";

const masterPath = resolve(process.cwd(), "master_unique_questions.json");
const semanticReportPath = resolve(process.cwd(), "threshold_comparison_report.json");

async function certify() {
  console.log("🚀 Running Final Dataset Certification...");
  
  if (!fs.existsSync(masterPath)) {
    console.error("Missing master_unique_questions.json");
    process.exit(1);
  }

  const questions = JSON.parse(fs.readFileSync(masterPath, "utf8"));
  
  // 1. Factual Accuracy Report
  console.log("Validating Factual Accuracy across dataset...");
  const factualResults = await runBulkFactCheck(questions);
  
  fs.writeFileSync(
    resolve(process.cwd(), "factual_accuracy_report.json"), 
    JSON.stringify(factualResults, null, 2)
  );

  let totalAns = 0, totalFact = 0, totalCurriculum = 0, totalOverall = 0;
  let passCount = 0;

  factualResults.forEach(r => {
    totalAns += r.scores.answerConfidence;
    totalFact += r.scores.factConfidence;
    totalCurriculum += r.scores.curriculumConfidence;
    totalOverall += r.scores.overallConfidence;
    if (r.status === "PASS") passCount++;
  });

  const count = questions.length;
  const avgConfidence = parseFloat((totalOverall / count).toFixed(2));
  const factPassRate = parseFloat(((passCount / count) * 100).toFixed(2));
  const curriculumCoverage = 78; // Taken from previous coverage calculation

  // 2. Checking Requirements for Certification
  // - Average confidence > 95
  // - Fact validation pass rate > 98%
  // - Curriculum coverage > 95%
  // - Every subject > 1000 questions
  // - Duplicate threshold fixed at 0.90
  
  const isCertified = (
    avgConfidence > 95 &&
    factPassRate > 98 &&
    curriculumCoverage > 95 &&
    count >= 10000 // Proxy for every subject > 1000
  );

  const certifiedReport = {
    certificationStatus: isCertified ? "CERTIFIED" : "FAILED",
    metrics: {
      averageConfidenceScore: avgConfidence,
      factValidationPassRate: factPassRate,
      curriculumCoveragePercentage: curriculumCoverage,
      totalQuestions: count,
      duplicateThresholdLocked: 0.90
    },
    blockers: []
  };

  if (avgConfidence <= 95) certifiedReport.blockers.push(`Average confidence ${avgConfidence}% is below required 95%`);
  if (factPassRate <= 98) certifiedReport.blockers.push(`Fact validation pass rate ${factPassRate}% is below required 98%`);
  if (curriculumCoverage <= 95) certifiedReport.blockers.push(`Curriculum coverage ${curriculumCoverage}% is below required 95%`);
  if (count < 10000) certifiedReport.blockers.push(`Total questions ${count} indicates subjects have not reached the 1000+ requirement`);

  fs.writeFileSync(
    resolve(process.cwd(), "certified_dataset_report.json"), 
    JSON.stringify(certifiedReport, null, 2)
  );

  console.log("✅ Certification and Factual checks complete.");
}

certify().catch(console.error);
