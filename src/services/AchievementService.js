import { achievementRepository } from "../repository/AchievementRepository.js";
import { AppError } from "../utils/AppError.js";

class AchievementService {
  /**
   * Get achievements data based on the requested tab
   */
  static async getAchievementsData(userId, tab) {
    if (tab === "milestones") {
      return await achievementRepository.findAchievementsByUser(userId);
    }

    if (tab === "leaderboard") {
      return await this.getLeaderboard(10);
    }

    if (tab === "history") {
      return await achievementRepository.findAchievementsByUser(userId);
    }

    const [userAchievements, leaderboard] = await Promise.all([
      achievementRepository.findAchievementsByUser(userId),
      this.getLeaderboard(10),
    ]);

    return { milestones: userAchievements, leaderboard, history: userAchievements };
  }

  static async updateStreak(userId, streakCount) {
    if (!userId || streakCount === undefined) {
      throw new AppError("userId and streakCount are required", 400);
    }
    return await achievementRepository.updateStreak(userId, streakCount);
  }

  /**
   * Get ranked leaderboard
   */
  static async getLeaderboard(limit) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const board = await achievementRepository.getLeaderboard(parsedLimit);

    let currentRank = 1;
    for (let i = 0; i < board.length; i++) {
      if (i > 0 && board[i].score < board[i - 1].score) {
        currentRank = i + 1;
      }
      board[i].rank = currentRank;
    }

    return board;
  }
}

export default AchievementService;
