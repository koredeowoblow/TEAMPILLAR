import { achievementRepository } from "../repository/AchievementRepository.js";
import { AppError } from "../utils/AppError.js";

class AchievementService {
  static async getAchievementsData(userId, tab) {
    const { practiceRepository } = await import("../repository/PracticeRepository.js");
    const sessionCount = await practiceRepository.count({ userId, sessionStatus: "COMPLETED" }) || 0;
    const streakDoc = await achievementRepository.getStreakByUser(userId);
    let streakCount = 1;
    const today = new Date();

    if (streakDoc) {
      const lastStreakDate = new Date(streakDoc.updatedAt);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastStreakDate.toDateString() === yesterday.toDateString()) {
         streakCount = streakDoc.streakCount + 1;
      } else if (lastStreakDate.toDateString() === today.toDateString()) {
         streakCount = streakDoc.streakCount;
      } else {
         streakCount = 1;
      }
    }

    if (!streakDoc || new Date(streakDoc.updatedAt).toDateString() !== today.toDateString()) {
      await achievementRepository.updateStreak(userId, streakCount);
    }

    const BADGES = [
      { id: "m1", title: "First Steps", description: "Complete your first practice session.", threshold: 1, field: "sessionCount" },
      { id: "m2", title: "Consistent Learner", description: "Study for 7 days in a row.", threshold: 7, field: "streak" },
      { id: "m3", title: "Halfway There", description: "Complete 50 practice sessions.", threshold: 50, field: "sessionCount" },
      { id: "m4", title: "Fortnight Warrior", description: "Maintain a 14-day study streak.", threshold: 14, field: "streak" },
      { id: "m5", title: "Century Club", description: "Complete 100 practice sessions.", threshold: 100, field: "sessionCount" },
    ];

    const computedMilestones = BADGES.map(badge => {
      const current = badge.field === "streak" ? streakCount : sessionCount;
      const progress = Math.min((current / badge.threshold) * 100, 100);
      const completed = current >= badge.threshold;
      
      return {
        id: badge.id,
        title: badge.title,
        description: badge.description,
        progress,
        completed,
        createdAt: completed ? new Date() : null
      };
    });

    const computedHistory = computedMilestones.filter(m => m.completed);

    if (tab === "milestones") return computedMilestones;
    if (tab === "history") return computedHistory;

    if (tab === "leaderboard") {
      return await this.getLeaderboard(10);
    }

    const leaderboard = await this.getLeaderboard(10);

    return { milestones: computedMilestones, leaderboard, history: computedHistory };
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
