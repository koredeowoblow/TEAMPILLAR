import AchievementService from "../services/AchievementService.js";
import { userRepository } from "../repository/UserRepository.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import {
  toAchievementDTO,
  toStreakDTO,
  toLeaderboardDTO,
} from "../dto/index.js";

class AchievementController {
  static async getAchievements(req, res) {
    const { tab } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("Authentication required", 401);
    }

    const data = await AchievementService.getAchievementsData(userId, tab);

    let mappedData;
    if (tab === "leaderboard") {
      mappedData = data.map(toLeaderboardDTO);
    } else if (tab === "milestones" || tab === "history") {
      mappedData = data.map(toAchievementDTO);
    } else {
      // If no tab is specified, return all grouped together
      mappedData = {
        milestones: data.milestones.map(toAchievementDTO),
        leaderboard: data.leaderboard.map(toLeaderboardDTO),
        history: data.history.map(toAchievementDTO),
      };
    }

    return sendSuccess(res, {
      message: "Achievements retrieved",
      data: mappedData,
      statusCode: 200,
    });
  }

  static async updateStreak(req, res) {
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      throw new AppError("Authentication required", 401);
    }

    let streakCount = req.body.streakCount;

    if (streakCount === undefined) {
      const user = await userRepository.findById(userId);
      streakCount = (user?.analytics?.streak || 0) + 1;
      
      if (user) {
        if (!user.analytics) user.analytics = {};
        user.analytics.streak = streakCount;
        user.markModified('analytics');
        await user.save();
      }
    }

    const updatedStreak = await AchievementService.updateStreak(
      userId,
      streakCount,
    );

    return sendSuccess(res, {
      message: "Streak updated successfully",
      data: toStreakDTO(updatedStreak),
      statusCode: 200,
    });
  }

  static async getLeaderboard(req, res) {
    const { limit } = req.query;

    const leaderboard = await AchievementService.getLeaderboard(limit);

    return sendSuccess(res, {
      message: "Leaderboard retrieved",
      data: leaderboard.map(toLeaderboardDTO),
      statusCode: 200,
    });
  }
}

export default AchievementController;
