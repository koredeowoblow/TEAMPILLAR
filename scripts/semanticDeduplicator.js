import fs from "fs";
import { resolve } from "path";
import { pipeline } from "@xenova/transformers";

const masterPath = resolve(process.cwd(), "master_unique_questions.json");
const semanticReportPath = resolve(process.cwd(), "semantic_duplicate_report.json");

if (!fs.existsSync(masterPath)) {
  console.error("Missing master_unique_questions.json");
  process.exit(1);
}

const questions = JSON.parse(fs.readFileSync(masterPath, "utf8"));

// Helper: Cosine Similarity
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function runSemanticDeduplication() {
  console.log("🚀 Starting Phase 2: Semantic Duplicate Detection");
  console.log(`Loading embedding model (Xenova/bge-small-en-v1.5)...`);
  
  // We use bge-small because it's fast locally and supported. 
  // It gives excellent embeddings.
  const extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", {
    quantized: true, // Keep it fast and memory efficient
  });

  console.log(`✅ Model loaded. Generating embeddings for ${questions.length} questions...`);
  
  const embeddings = [];
  const report = [];
  
  // To avoid memory overflow, we can do it in batches or subject by subject.
  // Actually, computing O(N^2) for 3000 items is ~4.5 million comparisons. That takes a few seconds in JS.
  
  // Let's group by subject to optimize speed.
  const subjectGroups = {};
  questions.forEach(q => {
    const s = q.subject || "General";
    if (!subjectGroups[s]) subjectGroups[s] = [];
    subjectGroups[s].push(q);
  });

  for (const [subj, subjQuestions] of Object.entries(subjectGroups)) {
    if (subjQuestions.length < 2) continue;
    
    console.log(`   -> Embedding ${subjQuestions.length} questions for ${subj}...`);
    
    // Generate embeddings
    const subjectEmbeddings = [];
    for (const q of subjQuestions) {
      // Create a context string: Question + Options
      const context = `Question: ${q.question} Options: A) ${q.options.A} B) ${q.options.B} C) ${q.options.C} D) ${q.options.D}`;
      
      const output = await extractor(context, { pooling: "mean", normalize: true });
      subjectEmbeddings.push({
        id: q.id,
        vector: Array.from(output.data)
      });
    }
    
    // Compare within subject
    for (let i = 0; i < subjectEmbeddings.length; i++) {
      for (let j = i + 1; j < subjectEmbeddings.length; j++) {
        const sim = cosineSimilarity(subjectEmbeddings[i].vector, subjectEmbeddings[j].vector);
        
        if (sim >= 0.80) { // Semantic threshold from prompt
          let status = "Unique";
          if (sim > 0.90) status = "Exact semantic duplicate";
          else status = "Manual review queue";
          
          report.push({
            subject: subj,
            questionIdA: subjectEmbeddings[i].id,
            questionIdB: subjectEmbeddings[j].id,
            similarityScore: parseFloat(sim.toFixed(4)),
            action: status
          });
        }
      }
    }
  }

  // Dump report
  fs.writeFileSync(semanticReportPath, JSON.stringify(report, null, 2));
  console.log(`✅ Semantic deduplication complete. Found ${report.length} potential duplicates.`);
  console.log(`Saved report to ${semanticReportPath}`);
}

runSemanticDeduplication().catch(console.error);
