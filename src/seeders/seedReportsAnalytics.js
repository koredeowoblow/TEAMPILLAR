#!/usr/bin/env node
import "../config/env.js";
import { connectMongoDB } from "../config/mongodb.js";
import { userRepository } from "../repository/UserRepository.js";
import PracticeSession from "../models/PracticeSessionModel.js";
import Subject from "../models/SubjectModel.js";

const subjectBaseScores = {
  Mathematics: 58,
  Physics: 64,
  Chemistry: 67,
  Biology: 72,
  English: 75,
};

const subjectWeakTopics = {
  Mathematics: ["Quadratic Equations", "Integration", "Trigonometry"],
  Physics: ["Motion", "Work and Energy", "Thermodynamics"],
  Chemistry: ["Electrochemistry", "Organic Chemistry", "Stoichiometry"],
  Biology: ["Genetics", "Ecology", "Cell Division"],
  English: ["Comprehension", "Vocabulary", "Grammar"],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildSessionDate(monthsBack, indexWithinMonth) {
  const date = new Date();
  date.setDate(10 + indexWithinMonth * 5);
  date.setMonth(date.getMonth() - monthsBack);
  date.setHours(randomInt(8, 18), randomInt(0, 59), 0, 0);
  return date;
}

async function run() {
  try {
    await connectMongoDB();

    const months = Number.parseInt(process.env.SEED_REPORTS_MONTHS || "6", 10);
    const sessionsPerStudentPerMonth = Number.parseInt(
      process.env.SEED_REPORTS_SESSIONS_PER_STUDENT_PER_MONTH || "1",
      10,
    );

    const students = await userRepository.find({ role: "STUDENT" });
    if (students.length === 0) {
      console.log("No students found. Run seedStudents.js first.");
      process.exit(0);
    }

    const subjects = await Subject.find({}).lean();
    if (subjects.length === 0) {
      console.log("No subjects found. Run seedSubjects.js first.");
      process.exit(0);
    }

    const createdIds = [];

    for (let monthOffset = months - 1; monthOffset >= 0; monthOffset--) {
      for (const student of students) {
        for (let i = 0; i < sessionsPerStudentPerMonth; i++) {
          const subject = subjects[randomInt(0, subjects.length - 1)];
          const subjectName = subject.name;
          const baseScore = subjectBaseScores[subjectName] || 65;
          const trendBoost = (months - 1 - monthOffset) * 3;
          const score = clamp(
            baseScore + trendBoost + randomInt(-18, 18),
            1,
            100,
          );
          const weakTopicOptions = subjectWeakTopics[subjectName] || [
            "General Revision",
          ];
          const weakTopic =
            weakTopicOptions[randomInt(0, weakTopicOptions.length - 1)];
          const sessionDate = buildSessionDate(monthOffset, i);

          const session = await PracticeSession.create({
            userId: student._id,
            subjectId: subject._id,
            sessionStatus: "COMPLETED",
            startTime: new Date(
              sessionDate.getTime() - randomInt(20, 60) * 60 * 1000,
            ),
            endTime: new Date(
              sessionDate.getTime() + randomInt(20, 60) * 60 * 1000,
            ),
            score,
            responses: [],
            analytics: {
              accuracy: clamp(score - randomInt(0, 12), 0, 100),
              speedPerQuestion: randomInt(20, 90),
              topMistakeTopic: weakTopic,
            },
            security: {
              tabSwitches: randomInt(0, 3),
              ipAddress: "::1",
            },
            createdAt: sessionDate,
            updatedAt: sessionDate,
          });

          // Ensure the stored timestamps are the seeded ones for charting.
          await PracticeSession.collection.updateOne(
            { _id: session._id },
            {
              $set: {
                createdAt: sessionDate,
                updatedAt: sessionDate,
                startTime: new Date(
                  sessionDate.getTime() - randomInt(20, 60) * 60 * 1000,
                ),
                endTime: new Date(
                  sessionDate.getTime() + randomInt(20, 60) * 60 * 1000,
                ),
              },
            },
          );

          createdIds.push(String(session._id));
          console.log(
            `Seeded ${student.name} | ${subjectName} | ${sessionDate.toISOString().slice(0, 10)} | score=${score}`,
          );
        }
      }
    }

    console.log(
      `\nSeeding complete. Created ${createdIds.length} analytics practice session(s).`,
    );
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message || err);
    process.exit(1);
  }
}

run();
