import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import fs from "fs";
import dns from "node:dns";
import Subject from "../src/models/SubjectModel.js";
import Question from "../src/models/QuestionModel.js";

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), ".env") });

// DNS override for SRV resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const JSON_PATH = resolve(process.cwd(), "utme_questions1.json");

async function seed() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error("MONGO_URI missing");

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri, { dbName: "teampillar" });
    console.log("Connected.");

    const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    const subjects = data.subjects;

    for (const [subjectName, questions] of Object.entries(subjects)) {
      console.log(`Processing subject: ${subjectName} (${questions.length} questions)`);

      // 1. Find or Create Subject
      let subject = await Subject.findOne({ name: subjectName });
      if (!subject) {
        subject = await Subject.create({
          name: subjectName,
          code: subjectName.substring(0, 4).toUpperCase(),
          description: `UTME ${subjectName} Practice Questions`,
        });
        console.log(`Created subject: ${subjectName}`);
      }

      // 2. Transform Questions
      const transformedQuestions = questions.map((q) => {
        const options = Object.entries(q.options).map(([key, text]) => ({
          id: key,
          text: text,
          isCorrect: key === q.answer,
        }));

        return {
          subjectId: subject._id,
          content: {
            text: q.question,
          },
          options: options,
          metadata: {
            topic: q.topic,
            difficulty: "medium", // Default
            questionCode: q.id,
          },
        };
      });

      // 3. Insert in chunks to avoid payload limits
      const chunkSize = 100;
      for (let i = 0; i < transformedQuestions.length; i += chunkSize) {
        const chunk = transformedQuestions.slice(i, i + chunkSize);
        await Question.insertMany(chunk);
        console.log(`Inserted chunk ${Math.floor(i / chunkSize) + 1} for ${subjectName}`);
      }

      // 4. Update Subject Question Count
      const count = await Question.countDocuments({ subjectId: subject._id });
      await Subject.findByIdAndUpdate(subject._id, { questionCount: count });
    }

    console.log("Seeding complete!");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

seed();
