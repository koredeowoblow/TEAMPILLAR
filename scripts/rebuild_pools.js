import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import QuestionPoolService from '../src/services/QuestionPoolService.js';
import { connectMongoDB } from '../src/config/mongodb.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const rebuild = async () => {
  console.log("Connecting to DB...");
  await connectMongoDB();
  
  console.log("Rebuilding Redis Question Pools to apply AI Healed Instructions...");
  await QuestionPoolService.rebuildAllPools();
  
  console.log("Redis Pool Rebuild Complete.");
  process.exit(0);
};

rebuild().catch(console.error);
