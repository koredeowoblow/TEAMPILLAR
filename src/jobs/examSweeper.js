import cron from "node-cron";
import PracticeSessionModel from "../models/PracticeSessionModel.js";
import MockTestService from "../services/MockTestService.js";
import { logger } from "../core/logger.js";

// Run every 5 minutes
export const startExamSweeper = () => {
  cron.schedule("*/5 * * * *", async () => {
    logger.info("[ExamSweeper] Starting sweep for abandoned mock exams...");
    try {
      // Find all ACTIVE mock sessions
      const activeSessions = await PracticeSessionModel.find({
        isMockTest: true,
        sessionStatus: "ACTIVE"
      });

      let sweptCount = 0;

      for (const session of activeSessions) {
        // Calculate if session is expired
        const elapsedSeconds = Math.floor((Date.now() - session.createdAt.getTime()) / 1000);
        // Add a 60-second grace period
        if (elapsedSeconds > session.totalDuration + 60) {
          logger.info(`[ExamSweeper] Session ${session._id} (User: ${session.userId}) is expired. Sweeping...`);
          try {
            await MockTestService.submitMockTest(
              { _id: session.userId },
              session._id,
              [],
              { isSweeper: true, tabSwitches: session.security?.tabSwitches || 0 }
            );
            sweptCount++;
            logger.info(`[ExamSweeper] Successfully swept session ${session._id}`);
          } catch (err) {
            logger.error(`[ExamSweeper] Failed to sweep session ${session._id}: ${err.message}`);
          }
        }
      }

      logger.info(`[ExamSweeper] Sweep complete. Swept ${sweptCount} sessions.`);
    } catch (error) {
      logger.error(`[ExamSweeper] Error during sweep: ${error.message}`);
    }
  });

  logger.info("Exam Sweeper initialized and scheduled (runs every 5 minutes).");
};
