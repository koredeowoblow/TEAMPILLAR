#!/usr/bin/env node
import "../config/env.js";
import { connectMongoDB } from "../config/mongodb.js";
import { userRepository } from "../repository/UserRepository.js";
import Subject from "../models/SubjectModel.js";
import Question from "../models/QuestionModel.js";
import PracticeSession from "../models/PracticeSessionModel.js";

const questionBlueprints = [
  {
    subject: "Mathematics",
    topic: "Calculus",
    questionIdLabel: "Q-101",
    content: {
      text: "What is the derivative of x^2?",
    },
    options: [
      { id: "A", text: "2x", isCorrect: true },
      { id: "B", text: "x", isCorrect: false },
      { id: "C", text: "x^2", isCorrect: false },
      { id: "D", text: "1", isCorrect: false },
    ],
  },
  {
    subject: "Physics",
    topic: "Optics",
    questionIdLabel: "Q-204",
    content: {
      text: "Which lens is used to correct myopia?",
    },
    options: [
      { id: "A", text: "Convex lens", isCorrect: false },
      { id: "B", text: "Concave lens", isCorrect: true },
      { id: "C", text: "Cylindrical lens", isCorrect: false },
      { id: "D", text: "Plano lens", isCorrect: false },
    ],
  },
  {
    subject: "Chemistry",
    topic: "Electrochemistry",
    questionIdLabel: "Q-305",
    content: {
      text: "What happens at the cathode in electrolysis?",
    },
    options: [
      { id: "A", text: "Oxidation occurs", isCorrect: false },
      { id: "B", text: "Reduction occurs", isCorrect: true },
      { id: "C", text: "Neutralization occurs", isCorrect: false },
      { id: "D", text: "Evaporation occurs", isCorrect: false },
    ],
  },
  {
    subject: "Biology",
    topic: "Genetics",
    questionIdLabel: "Q-408",
    content: {
      text: "Which cell organelle contains genetic material?",
    },
    options: [
      { id: "A", text: "Mitochondrion", isCorrect: false },
      { id: "B", text: "Nucleus", isCorrect: true },
      { id: "C", text: "Ribosome", isCorrect: false },
      { id: "D", text: "Golgi body", isCorrect: false },
    ],
  },
  {
    subject: "English",
    topic: "Grammar",
    questionIdLabel: "Q-512",
    content: {
      text: "Choose the correct sentence.",
    },
    options: [
      { id: "A", text: "He go to school daily.", isCorrect: false },
      { id: "B", text: "He goes to school daily.", isCorrect: true },
      { id: "C", text: "He going to school daily.", isCorrect: false },
      { id: "D", text: "He gone to school daily.", isCorrect: false },
    ],
  },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function run() {
  try {
    await connectMongoDB();

    const students = await userRepository.find({ role: "STUDENT" });
    if (students.length === 0) {
      console.log("No students found. Run seedStudents.js first.");
      process.exit(0);
    }

    const subjectDocs = await Subject.find({}).lean();
    if (subjectDocs.length === 0) {
      console.log("No subjects found. Run seedSubjects.js first.");
      process.exit(0);
    }

    const subjectMap = {};
    subjectDocs.forEach((subject) => {
      subjectMap[subject.name] = subject;
    });

    const seededQuestions = [];
    for (const blueprint of questionBlueprints) {
      const subject = subjectMap[blueprint.subject];
      if (!subject) {
        console.log(`Skipping ${blueprint.questionIdLabel}: subject ${blueprint.subject} not found`);
        continue;
      }

      const existing = await Question.findOne({
        subjectId: subject._id,
        "metadata.topic": blueprint.topic,
      });

      if (existing) {
        existing.metadata = {
          ...(existing.metadata || {}),
          questionCode: blueprint.questionIdLabel,
        };
        await existing.save();
        seededQuestions.push(existing);
        console.log(`Question exists: ${blueprint.questionIdLabel} (${blueprint.topic})`);
        continue;
      }

      const question = await Question.create({
        subjectId: subject._id,
        content: blueprint.content,
        options: blueprint.options,
        explanation: `This question was seeded for ${blueprint.topic}.`,
        metadata: {
          year: new Date().getFullYear(),
          topic: blueprint.topic,
          questionCode: blueprint.questionIdLabel,
          difficulty: "MEDIUM",
        },
      });

      seededQuestions.push(question);
      console.log(`Created question: ${blueprint.questionIdLabel} (${blueprint.topic})`);
    }

    if (seededQuestions.length === 0) {
      console.log("No questions were seeded. Aborting session generation.");
      process.exit(0);
    }

    const sessionCountPerQuestion = Number.parseInt(
      process.env.SEED_COMMON_MISTAKES_SESSIONS_PER_QUESTION || "12",
      10,
    );
    const daysBack = Number.parseInt(process.env.SEED_COMMON_MISTAKES_DAYS_BACK || "90", 10);

    let createdSessions = 0;
    for (const question of seededQuestions) {
      const correctOption = question.options.find((option) => option.isCorrect);
      const wrongOptions = question.options.filter((option) => !option.isCorrect);
      const mostLikelyWrong = wrongOptions[0] || correctOption;

      for (let i = 0; i < sessionCountPerQuestion; i++) {
        const student = students[randomInt(0, students.length - 1)];
        const sessionDate = new Date();
        sessionDate.setDate(sessionDate.getDate() - randomInt(1, daysBack));
        sessionDate.setHours(randomInt(8, 20), randomInt(0, 59), 0, 0);

        const responses = [
          {
            questionId: question._id,
            selectedOption:
              i % 3 === 0
                ? mostLikelyWrong.id
                : wrongOptions[randomInt(0, wrongOptions.length - 1)]?.id || mostLikelyWrong.id,
            timeTaken: randomInt(18, 120),
          },
        ];

        const score = randomInt(15, 55);

        await PracticeSession.create({
          userId: student._id,
          subjectId: question.subjectId,
          sessionStatus: "COMPLETED",
          responses,
          analytics: {
            accuracy: 0,
            speedPerQuestion: randomInt(20, 90),
            topMistakeTopic: question.metadata?.topic || "General",
          },
          security: {
            tabSwitches: randomInt(0, 2),
            ipAddress: "::1",
          },
          startTime: new Date(sessionDate.getTime() - randomInt(15, 45) * 60 * 1000),
          endTime: new Date(sessionDate.getTime() + randomInt(10, 35) * 60 * 1000),
          score,
          createdAt: sessionDate,
          updatedAt: sessionDate,
        });

        createdSessions += 1;
      }

      console.log(`Seeded ${sessionCountPerQuestion} mistake sessions for ${question.metadata?.topic}`);
    }

    console.log(`\nSeeding complete. Created ${seededQuestions.length} questions and ${createdSessions} mistake sessions.`);
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message || err);
    process.exit(1);
  }
}

run();
