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
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        // Based on Atlas M10/M20 constraints (1500-3000 max cluster connections)
        // Assuming ~4 Node.js instances behind load balancer. 1500 / 4 = 375.
        // We set 300 to leave headroom for other services/DB ops.
        maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE) || 300,
        minPoolSize: 2,
        // Disable automatic index creation in production to avoid blocking queries on startup
        autoIndex: process.env.NODE_ENV !== "production",
      });
      console.log("✅ MongoDB connection established successfully.");

      // Enable query profiler if supported
      mongoose.connection.db.command({ profile: 1, slowms: 50 })
        .then(() => console.log('[DB] Query profiler enabled — logging queries > 50ms'))
        .catch(err => console.log('[DB] Note: Query profiler could not be enabled:', err.message));
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

export const disconnectMongoDB = async () => {
  try {
    await mongoose.disconnect();
    console.log("MongoDB connection closed cleanly.");
  } catch (err) {
    console.error("Error closing MongoDB connection:", err.message);
  }
};

export default mongoose;
