import Achievement from "../models/AchievementModel.js";
import Streak from "../models/StreakModel.js";
import Leaderboard from "../models/LeaderboardModel.js";

class AchievementRepository {
  // --- Achievements ---
  async findAchievementsByUser(userId) {
    return await Achievement.find({ userId }).sort({ createdAt: -1 }).lean().exec();
  }

  async createAchievement(data) {
    const achievement = new Achievement(data);
    return await achievement.save();
  }

  // --- Streaks ---
  async getStreakByUser(userId) {
    return await Streak.findOne({ userId }).lean().exec();
  }

  async updateStreak(userId, streakCount) {
    return await Streak.findOneAndUpdate(
      { userId },
      { streakCount },
      { new: true, upsert: true },
    ).exec();
  }

  // --- Leaderboard ---
  async getLeaderboard(limit = 10) {
    return await Leaderboard.find({})
      .sort({ score: -1 })
      .limit(limit)
      .populate("userId", "name photo")
      .lean()
      .exec();
  }

  async getUserLeaderboard(userId) {
    return await Leaderboard.findOne({ userId }).lean().exec();
  }

  async updateLeaderboardScore(userId, score) {
    return await Leaderboard.findOneAndUpdate(
      { userId },
      { score },
      { new: true, upsert: true },
    ).exec();
  }
}

export const achievementRepository = new AchievementRepository();
