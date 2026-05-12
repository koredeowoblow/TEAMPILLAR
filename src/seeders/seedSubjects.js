#!/usr/bin/env node
import "../config/env.js";
import { connectMongoDB } from "../config/mongodb.js";
import Subject from "../models/SubjectModel.js";

async function run() {
  try {
    await connectMongoDB();

    const subjects = [
      {
        name: "Physics",
        code: "PHY-01",
        description: "Physics - Motion, Forces, Energy",
        questionCount: 0,
      },
      {
        name: "Chemistry",
        code: "CHEM-01",
        description: "Chemistry - Reactions, Bonds, Equilibrium",
        questionCount: 0,
      },
      {
        name: "Biology",
        code: "BIO-01",
        description: "Biology - Cells, Organisms, Ecology",
        questionCount: 0,
      },
      {
        name: "Mathematics",
        code: "MATH-01",
        description: "Mathematics - Algebra, Calculus, Geometry",
        questionCount: 0,
      },
      {
        name: "English",
        code: "ENG-01",
        description: "English - Literature, Grammar, Comprehension",
        questionCount: 0,
      },
    ];

    let created = 0;
    for (const subj of subjects) {
      const existing = await Subject.findOne({ name: subj.name });
      if (existing) {
        console.log(`Subject exists: ${subj.name}`);
        continue;
      }

      const newSubj = new Subject(subj);
      await newSubj.save();
      created++;
      console.log(`Created subject: ${subj.name}`);
    }

    console.log(`\nSeeding complete. Created ${created} subject(s).`);
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message || err);
    process.exit(1);
  }
}

run();
