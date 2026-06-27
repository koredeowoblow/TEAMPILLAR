import { getRedisClient, closeRedis } from "./src/config/redis.js";

async function flushRedis() {
  try {
    console.log("Connecting to Redis...");
    const redis = await getRedisClient();
    
    if (!redis) {
      console.error("Failed to connect to Redis.");
      process.exit(1);
    }

    console.log("Flushing all Redis databases...");
    await redis.flushall();
    console.log("✅ Redis successfully flushed.");

  } catch (error) {
    console.error("❌ Error flushing Redis:", error.message);
  } finally {
    await closeRedis();
    process.exit(0);
  }
}

flushRedis();
