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

    // Default: return all three types of data
    const [milestones, leaderboard, history] = await Promise.all([
      achievementRepository.findAchievementsByUser(userId),
      this.getLeaderboard(10),
      achievementRepository.findAchievementsByUser(userId),
    ]);

    return { milestones, leaderboard, history };
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
    // Get top users
    const board = await achievementRepository.getLeaderboard(parsedLimit);

    // Assign ranks dynamically based on sorted score
    let currentRank = 1;
    for (let i = 0; i < board.length; i++) {
      // Simple dense ranking (if scores are same, same rank)
      if (i > 0 && board[i].score < board[i - 1].score) {
        currentRank = i + 1;
      }
      board[i].rank = currentRank;
    }

    return board;
  }
}

export default AchievementService;
