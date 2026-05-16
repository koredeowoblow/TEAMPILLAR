#!/usr/bin/env node
import "../config/env.js";
import { connectMongoDB } from "../config/mongodb.js";
import { userRepository } from "../repository/UserRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import Subject from "../models/SubjectModel.js";

async function run() {
  try {
    await connectMongoDB();

    const count = Number.parseInt(process.env.SEED_SESSIONS_COUNT || "20", 10);
    const studentsPerSession = Number.parseInt(
      process.env.SEED_SESSIONS_PER_STUDENT || "3",
      10,
    );

    // Get all students
    const students = await userRepository.find({ role: "STUDENT" });
    if (students.length === 0) {
      console.log("No students found. Run seedStudents.js first.");
      process.exit(0);
    }

    // Get all subjects
    const subjects = await Subject.find({}).limit(5).lean();
    if (subjects.length === 0) {
      console.log("No subjects found. Seed some subjects first.");
      process.exit(0);
    }

    const weakTopics = [
      "Calculus",
      "Electrochemistry",
      "Quantum Mechanics",
      "Thermodynamics",
      "Organic Chemistry",
    ];
    let created = 0;

    for (const student of students) {
      for (let i = 0; i < studentsPerSession; i++) {
        const subject = subjects[Math.floor(Math.random() * subjects.length)];
        const score = Math.floor(Math.random() * 100) + 1; // 1-100
        const topicMistake =
          weakTopics[Math.floor(Math.random() * weakTopics.length)];

        const session = await practiceRepository.create({
          userId: student._id,
          subjectId: subject._id,
          sessionStatus: "COMPLETED",
          startTime: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ), // Within 30 days
          endTime: new Date(),
          score,
          responses: [],
          security: {
            tabSwitches: Math.floor(Math.random() * 3),
            ipAddress: "::1",
          },
          analytics: {
            topMistakeTopic: topicMistake,
            timeSpent: Math.floor(Math.random() * 3600) + 300, // 5-60 minutes
          },
        });

        created++;
        console.log(
          `Created session ${created}: ${student.name} - ${subject._id} - Score: ${score}`,
        );
      }
    }

    console.log(`\nSeeding complete. Created ${created} practice session(s).`);
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message || err);
    process.exit(1);
  }
}

run();
