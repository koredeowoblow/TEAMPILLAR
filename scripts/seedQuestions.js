import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import fs from "fs";
import dns from "node:dns";

import Subject from "../src/models/SubjectModel.js";
import Question from "../src/models/QuestionModel.js";

// Load environment variables
dotenv.config({
  path: resolve(process.cwd(), ".env"),
});

// DNS override for SRV resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const JSON_PATH = resolve(process.cwd(), "master_unique_questions_certified.json");

function toTitleCase(str) {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function generateSubjectCode(subjectName) {
  return subjectName
    .replace(/[^a-zA-Z]/g, "")
    .substring(0, 4)
    .toUpperCase();
}

async function findOrCreateSubject(rawSubjectName) {
  const subjectName = toTitleCase(rawSubjectName);
  const subjectCode = generateSubjectCode(subjectName);

  let subject = await Subject.findOne({
    $or: [
      { name: subjectName },
      { code: subjectCode },
    ],
  });

  if (!subject) {
    subject = await Subject.create({
      name: subjectName,
      code: subjectCode,
      description: `UTME ${subjectName} Practice Questions`,
      questionCount: 0,
    });

    console.log(`✅ Created subject: ${subjectName}`);
  } else {
    console.log(`ℹ️ Using existing subject: ${subject.name}`);
  }

  return subject;
}

async function seed() {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGO_URI missing from .env");
    }

    console.log("🔌 Connecting to MongoDB...");

    await mongoose.connect(mongoUri, {
      dbName: "teampillar",
    });

    console.log("✅ Connected to MongoDB");

    const rawData = fs.readFileSync(JSON_PATH, "utf8");
    const data = JSON.parse(rawData);

    const subjectsMap = {};
    if (Array.isArray(data)) {
      data.forEach(q => {
        if (!q.subject) return;
        if (!subjectsMap[q.subject]) subjectsMap[q.subject] = [];
        subjectsMap[q.subject].push(q);
      });
    } else if (data.subjects) {
      Object.assign(subjectsMap, data.subjects);
    } else {
      throw new Error("Invalid JSON format. Expected flat array or data.subjects object.");
    }

    for (const [subjectName, questions] of Object.entries(subjectsMap)) {
      console.log(
        `\n📚 Processing ${subjectName} (${questions.length} questions)`
      );

      const subject = await findOrCreateSubject(subjectName);

      const usedCodes = new Set();

      const transformedQuestions = questions.map((q, index) => {
        let questionCode = q.id?.trim();

        if (!questionCode) {
          questionCode = `${subject.code}_${index + 1}`;
        }

        while (usedCodes.has(questionCode)) {
          questionCode = `${questionCode}_${index}`;
        }

        usedCodes.add(questionCode);

        return {
          subjectId: subject._id,

          content: {
            text: q.question,
          },

          options: Object.entries(q.options || {}).map(([key, text]) => ({
            id: key,
            text,
            isCorrect: key === (q.correctAnswer || q.answer),
          })),

          explanation: q.explanation,
          explanationStatus: q.explanation ? "generated" : "pending",
          explanationSource: q.explanation ? "ai" : "manual",
          explanationGeneratedAt: q.explanation ? new Date() : null,

          metadata: {
            topic: q.topic || "General",
            difficulty: q.difficulty || "medium",
            questionCode,
          },
        };
      });

      const batchSize = 100;

      for (
        let i = 0;
        i < transformedQuestions.length;
        i += batchSize
      ) {
        const batch = transformedQuestions.slice(
          i,
          i + batchSize
        );

        const operations = batch.map((question) => ({
          updateOne: {
            filter: {
              subjectId: question.subjectId,
              "metadata.questionCode":
                question.metadata.questionCode,
            },
            update: {
              $set: question,
            },
            upsert: true,
          },
        }));

        const result = await Question.bulkWrite(
          operations,
          {
            ordered: false,
          }
        );

        console.log(
          `✅ Batch ${Math.floor(i / batchSize) + 1} synced`
        );

        console.log({
          inserted: result.upsertedCount || 0,
          modified: result.modifiedCount || 0,
        });
      }

      const totalQuestions =
        await Question.countDocuments({
          subjectId: subject._id,
        });

      await Subject.findByIdAndUpdate(
        subject._id,
        {
          questionCount: totalQuestions,
        },
        {
          new: true,
        }
      );

      console.log(
        `📊 ${subjectName}: ${totalQuestions} total questions`
      );
    }

    console.log("\n🎉 Question seeding completed successfully!");
  } catch (error) {
    console.error("\n❌ Seeding failed");
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected");
  }
}

seed();