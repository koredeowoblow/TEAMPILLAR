import mongoose from "mongoose";
import "./env.js";
import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";

export const connectMongoDB = async () => {
  let retries = 5;
  while (retries > 0) {
    console.log("Connecting to MongoDB...");
    try {
      await mongoose.connect(mongoUri, {
        dbName: process.env.MONGO_DB_NAME,
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE) || 20,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
      });
      console.log("✅ MongoDB connection established successfully.");
      return;
    } catch (error) {
      console.error(`❌ MongoDB connection error:`, error.message);
      retries -= 1;
      if (retries === 0) {
        throw error;
      }
      console.log(
        `Retrying MongoDB connection... (${5 - retries}/5) in 5 seconds...`,
      );
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
};

export default mongoose;
