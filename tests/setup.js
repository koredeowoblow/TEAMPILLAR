import { closeRedis } from "../src/config/redis.js";
import { disconnectMongoDB } from "../src/config/mongodb.js";
import OTPService from "../src/services/OTPService.js";

afterAll(async () => {
  try {
    OTPService.clearCleanupInterval();
    await Promise.all([
      closeRedis(),
      disconnectMongoDB()
    ]);
  } catch (err) {
    console.error("Error during global Jest teardown:", err.message);
  }
});
