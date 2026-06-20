import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import dns from "node:dns";
import AIService from "../src/services/AIService.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
dotenv.config({ path: resolve(process.cwd(), ".env") });

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "teampillar" });
    console.log("Connected to MongoDB.");

    // Create a mock user ID
    const userId = new mongoose.Types.ObjectId();
    
    console.log("\nTesting AIService.generateTutorChatReply...");
    const result = await AIService.generateTutorChatReply({
      userId: userId,
      message: "Explain the first law of thermodynamics",
      subject: "Physics",
      sessionId: null, // Will create a new session
      history: []
    });

    console.log("\n✅ AI Response successfully generated!");
    console.log("Reply Text:", result.reply.substring(0, 100) + "...");
    console.log("Suggested Follow Ups:", result.suggestedFollowUps);
    console.log("Topics Referenced:", result.topicsReferenced);
    console.log("Session ID created:", result.sessionId);
    
    // Test that the session was actually saved
    console.log("\nChecking database persistence...");
    const AITutorSession = (await import("../src/models/AITutorSessionModel.js")).default;
    const AITutorMessage = (await import("../src/models/AITutorMessageModel.js")).default;
    
    const session = await AITutorSession.findById(result.sessionId);
    console.log("Session exists in DB:", !!session);
    
    const messages = await AITutorMessage.find({ sessionId: result.sessionId }).sort({ createdAt: 1 });
    console.log(`Found ${messages.length} messages in DB (Should be at least 1 user message. The assistant message might be delayed because it's fire-and-forget).`);
    
    // Wait a little bit for fire-and-forget message to save
    await new Promise(r => setTimeout(r, 500));
    const messagesAfter = await AITutorMessage.find({ sessionId: result.sessionId }).sort({ createdAt: 1 });
    console.log(`Found ${messagesAfter.length} messages in DB after 500ms.`);
    messagesAfter.forEach(m => console.log(`[${m.role}] ${m.content.substring(0, 50)}...`));

    // Cleanup
    await AITutorMessage.deleteMany({ sessionId: result.sessionId });
    await AITutorSession.deleteOne({ _id: result.sessionId });
    console.log("\nCleanup done.");

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

test();
