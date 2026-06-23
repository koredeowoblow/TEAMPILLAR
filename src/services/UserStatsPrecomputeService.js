import User from "../models/UserModel.js";
import { default as PracticeSessionModel } from "../models/PracticeSessionModel.js";
import { logger } from "../core/logger.js";

export default class UserStatsPrecomputeService {
  /**
   * Recalculates user stats based on latest session activity.
   * This is triggered asynchronously after exam grading to keep reads O(1).
   */
  static async recalculateAndSave(userId) {
    try {
      const sessions = await PracticeSessionModel.find({ 
        userId, 
        sessionStatus: 'COMPLETED',
        score: { $gt: 0 }
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

      const sessionCount = await PracticeSessionModel.countDocuments({ userId });
      
      let avgScoreUTME = 0;
      let recentScores = [];

      if (sessions.length > 0) {
        let totalScaledScore = 0;
        
        for (const s of sessions) {
          let scaledScore = s.score || 0;
          // Scale to 400 if it's not a full mock
          if (s.sessionType !== "smart-mock" && s.subjectId !== null) {
            scaledScore *= 4;
          }
          totalScaledScore += scaledScore;
          
          if (recentScores.length < 3) {
            recentScores.push(scaledScore);
          }
        }
        
        avgScoreUTME = Math.round(totalScaledScore / sessions.length);
      }

      await User.findByIdAndUpdate(userId, {
        $set: {
          'stats.avgScoreUTME': avgScoreUTME,
          'stats.sessionCount': sessionCount,
          'stats.recentScores': recentScores
        }
      });
      
      logger.info(`Precomputed stats for user ${userId} (Avg: ${avgScoreUTME}, Sessions: ${sessionCount})`);
    } catch (err) {
      logger.error(`Error precomputing stats for user ${userId}`, err);
    }
  }
}
