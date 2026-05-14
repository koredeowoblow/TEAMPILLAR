import cache from "../src/utils/cache.js";

const clearCache = async () => {
  try {
    console.log("Clearing Redis and LRU cache...");
    await cache.flush();
    console.log("✓ Cache cleared successfully");
    process.exit(0);
  } catch (error) {
    console.error("✗ Error clearing cache:", error.message);
    process.exit(1);
  }
};

clearCache();
