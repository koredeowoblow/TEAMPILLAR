import fs from "fs";
import { resolve } from "path";

const masterPath = resolve(process.cwd(), "master_unique_questions.json");
const syllabusPath = resolve(process.cwd(), "scripts/syllabus.json");
const coverageOutPath = resolve(process.cwd(), "coverage_report.json");

if (!fs.existsSync(masterPath) || !fs.existsSync(syllabusPath)) {
  console.error("Missing required files.");
  process.exit(1);
}

const questions = JSON.parse(fs.readFileSync(masterPath, "utf8"));
const syllabus = JSON.parse(fs.readFileSync(syllabusPath, "utf8"));

const coverageReport = [];

const TARGET_MIN_PER_TOPIC = 50;
const TARGET_MAX_PER_TOPIC = 150;

// Count current questions per topic
const counts = {};
questions.forEach(q => {
  const subj = q.subject || "Unknown";
  const topic = q.topic || "General";
  if (!counts[subj]) counts[subj] = {};
  if (!counts[subj][topic]) counts[subj][topic] = 0;
  counts[subj][topic]++;
});

for (const [subj, topics] of Object.entries(syllabus)) {
  for (const topic of topics) {
    const currentQuestions = (counts[subj] && counts[subj][topic]) ? counts[subj][topic] : 0;
    
    // Coverage is essentially what % of the 50 min target is reached
    const coverage = Math.min(100, Math.round((currentQuestions / TARGET_MIN_PER_TOPIC) * 100));
    const missing = Math.max(0, TARGET_MIN_PER_TOPIC - currentQuestions);

    let priority = "Low";
    if (currentQuestions === 0) priority = "Critical (Missing)";
    else if (currentQuestions < 20) priority = "High (Underrepresented)";
    else if (currentQuestions < TARGET_MIN_PER_TOPIC) priority = "Medium (Weak)";
    else if (currentQuestions > 300) priority = "Warning (Over-represented)";

    coverageReport.push({
      subject: subj,
      topic: topic,
      currentQuestions,
      targetMinimum: TARGET_MIN_PER_TOPIC,
      targetMaximum: TARGET_MAX_PER_TOPIC,
      coveragePercentage: coverage,
      missingQuestionCount: missing,
      generationPriority: priority
    });
  }
}

// Add any topics that exist in DB but not in syllabus
for (const subj in counts) {
  for (const topic in counts[subj]) {
    const isSyllabusTopic = syllabus[subj] && syllabus[subj].includes(topic);
    if (!isSyllabusTopic) {
      coverageReport.push({
        subject: subj,
        topic: topic,
        currentQuestions: counts[subj][topic],
        targetMinimum: TARGET_MIN_PER_TOPIC,
        targetMaximum: TARGET_MAX_PER_TOPIC,
        coveragePercentage: 100,
        missingQuestionCount: 0,
        generationPriority: "Unmapped Topic (Review)"
      });
    }
  }
}

fs.writeFileSync(coverageOutPath, JSON.stringify(coverageReport, null, 2));
console.log(`✅ Coverage report generated: ${coverageOutPath}`);
