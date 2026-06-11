// scripts/auditIndexes.js
import mongoose from '../src/config/mongodb.js';
import { connectMongoDB } from '../src/config/mongodb.js';

const collections = ['users', 'questions', 'examresults', 'subscriptions', 'sessions', 'notifications'];

async function run() {
  try {
    await connectMongoDB();
    console.log("Auditing indexes...");
    for (const name of collections) {
      const col = mongoose.connection.collection(name);
      try {
        const indexes = await col.indexes();
        let stats = [];
        try {
          stats = await col.aggregate([{ $indexStats: {} }]).toArray();
        } catch (err) {
          // stats might not be supported on free tier if aggregate is restricted or if collection doesn't exist
        }
        console.log(`\n=== ${name} ===`);
        console.log('Indexes:', indexes.map(i => i.key));
        console.log('Usage:', stats.map(s => ({ name: s.name, ops: s.accesses?.ops })));
      } catch (err) {
        console.log(`\n=== ${name} ===`);
        console.log(`Collection error or not found: ${err.message}`);
      }
    }
  } catch (error) {
    console.error("Audit run error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
