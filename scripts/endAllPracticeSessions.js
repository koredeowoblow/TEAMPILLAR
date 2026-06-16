import "../src/config/env.js";
import { connectMongoDB } from "../src/config/mongodb.js";
import PracticeSession from "../src/models/PracticeSessionModel.js";

async function endAllSessions() {
  console.log("Starting script to end all active practice sessions...");
  
  try {
    await connectMongoDB();
    
    const now = new Date();
    
    // Find all sessions that are ACTIVE and mark them as COMPLETED with an endTime
    const result = await PracticeSession.updateMany(
      { sessionStatus: "ACTIVE" },
      { 
        $set: { 
          sessionStatus: "COMPLETED", 
          endTime: now 
        } 
      }
    );
    
    console.log("Process completed successfully.");
    console.log(`Total sessions found and ended: ${result.modifiedCount}`);
    
    process.exit(0);
  } catch (err) {
    console.error("Failed to end active practice sessions:", err);
    process.exit(1);
  }
}

endAllSessions();
