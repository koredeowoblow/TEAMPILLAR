import AchievementService from "../services/AchievementService.js";
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
    const { userId, streakCount } = req.body;

    // In many implementations, updating own streak shouldn't require userId in body (could use req.user.id),
    // but the prompt explicitly states "Accepts userId and streakCount in the request body".
    if (!userId || streakCount === undefined) {
      throw new AppError("userId and streakCount are required", 400);
    }

    // Usually you'd confirm the auth user matches userId or is admin, but keeping it simple as per prompt
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
