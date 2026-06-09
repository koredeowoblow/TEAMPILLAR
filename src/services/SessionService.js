import PracticeSession from "../models/PracticeSessionModel.js";
import { logger } from "../core/logger.js";

class SessionService {
  /**
   * End all active practice/mock exam sessions for a specific user.
   * Typically called on user logout or inactivity timeout.
   * Sets status to "ABANDONED" and ends the session.
   * @param {string} userId - The user ID
   */
  static async endSessionsForUser(userId) {
    try {
      if (!userId) return;
      const result = await PracticeSession.updateMany(
        { userId, sessionStatus: "ACTIVE" },
        {
          $set: {
            sessionStatus: "ABANDONED",
            endTime: new Date(),
          },
        }
      );
      logger.info(`Cleaned up ${result.modifiedCount} active practice sessions for user ${userId}`);
      return result;
    } catch (error) {
      logger.error(`Failed to clean up active practice sessions for user ${userId}:`, error);
      throw error;
    }
  }
}

export default SessionService;
