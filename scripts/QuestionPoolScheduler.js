import { questionPoolQueue } from "../src/queues/QuestionPoolQueue.js";
import { logger } from "../src/core/logger.js";

async function scheduleQuestionPoolHydration() {
  try {
    // 1. Queue an immediate rebuild to hydrate empty pools on boot
    await questionPoolQueue.add("startup-hydration", { type: "REBUILD_ALL" });
    logger.info("Queued initial REBUILD_ALL question pool hydration on startup.");

    // 2. Schedule a repeatable job to refresh pools every 6 hours
    await questionPoolQueue.add(
      "scheduled-hydration",
      { type: "REBUILD_ALL" },
      {
        repeat: {
          pattern: "0 */6 * * *", // Every 6 hours
        },
        jobId: "scheduled-hydration-job",
      }
    );
    logger.info("Scheduled 6-hour REBUILD_ALL question pool hydration.");
  } catch (error) {
    logger.error("Failed to schedule Question Pool Hydration:", error);
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scheduleQuestionPoolHydration().then(() => {
    logger.info("Hydration scheduler script completed.");
    process.exit(0);
  });
}

export default scheduleQuestionPoolHydration;
