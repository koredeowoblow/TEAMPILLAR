import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import Question from '../src/models/QuestionModel.js';
import { connectMongoDB } from '../src/config/mongodb.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

async function deleteQuarantined() {
  await connectMongoDB();
  
  console.log("🚀 Checking for quarantined questions to delete...");
  
  const quarantinedCount = await Question.countDocuments({ isQuarantined: true });
  
  if (quarantinedCount === 0) {
    console.log("✅ No quarantined questions found. Database is clean.");
  } else {
    const result = await Question.deleteMany({ isQuarantined: true });
    console.log(`✅ Successfully permanently deleted ${result.deletedCount} quarantined questions from the database!`);
  }
  
  process.exit(0);
}

deleteQuarantined().catch(console.error);
