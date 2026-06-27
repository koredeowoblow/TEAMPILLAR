import { achievementRepository } from "../repository/AchievementRepository.js";
import { AppError } from "../utils/AppError.js";
import mongoose from "mongoose";

class AchievementService {
  static async getAchievementsData(userId, tab) {
    const { practiceRepository } = await import("../repository/PracticeRepository.js");
    const sessionCount = await practiceRepository.count({ userId, sessionStatus: "COMPLETED" }) || 0;
    const { userRepository } = await import("../repository/UserRepository.js");
    const { default: Subject } = await import("../models/SubjectModel.js");
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");

    const user = await userRepository.findById(userId);
    const userSubjectsIds = user?.onboarding?.subjects || [];
    const highestMockScore = user?.stats?.highestMockScore || 0;

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
      // Session Milestones
      { id: "m1", title: "The Journey Begins", description: "Take the plunge and complete your first ever practice session.", threshold: 1, field: "sessionCount", category: "MILESTONE" },
      { id: "s10", title: "Getting Warmed Up", description: "Complete 10 practice sessions. You're finding your rhythm.", threshold: 10, field: "sessionCount", category: "MILESTONE" },
      { id: "m5", title: "Knowledge Seeker", description: "Complete 25 practice sessions. You're building a solid foundation.", threshold: 25, field: "sessionCount", category: "MILESTONE" },
      { id: "s50", title: "Halfway to Greatness", description: "Complete 50 practice sessions. The grind is real.", threshold: 50, field: "sessionCount", category: "MILESTONE" },
      { id: "m6", title: "The Grind Never Stops", description: "Hit the 100 practice session milestone. Dedication personified.", threshold: 100, field: "sessionCount", category: "MILESTONE" },
      { id: "m7", title: "Unstoppable Force", description: "Demolish 250 practice sessions like a true UTME champion.", threshold: 250, field: "sessionCount", category: "MILESTONE" },
      { id: "s500", title: "Titan of Practice", description: "An unbelievable 500 practice sessions. You are a machine.", threshold: 500, field: "sessionCount", category: "MILESTONE" },
      { id: "s1000", title: "God Tier", description: "1,000 practice sessions. The examiners fear you.", threshold: 1000, field: "sessionCount", category: "MILESTONE" },

      // Streak Milestones
      { id: "m2", title: "Weekend Warrior", description: "Study for 3 days in a row. A solid start!", threshold: 3, field: "streak", category: "CONSISTENCY" },
      { id: "m3", title: "Relentless Scholar", description: "Keep the fire alive with a 10-day study streak.", threshold: 10, field: "streak", category: "CONSISTENCY" },
      { id: "m4", title: "Iron Will", description: "Maintain an incredible 30-day streak. No days off!", threshold: 30, field: "streak", category: "CONSISTENCY" },
      { id: "st50", title: "Unbreakable Habit", description: "Study for 50 consecutive days. Incredible discipline.", threshold: 50, field: "streak", category: "CONSISTENCY" },
      { id: "st100", title: "Century Streak", description: "100 days of non-stop studying. True mastery takes time.", threshold: 100, field: "streak", category: "CONSISTENCY" },

      // Score Milestones
      { id: "sc200", title: "Breaking 200", description: "Score 200+ in a Full Mock Exam. The journey begins.", threshold: 200, field: "highestMockScore", category: "HIGH SCORE" },
      { id: "sc250", title: "Quarter-Thousand", description: "Score 250+ in a Full Mock Exam. You are highly competitive.", threshold: 250, field: "highestMockScore", category: "HIGH SCORE" },
      { id: "sc300", title: "The 300 Club", description: "Score 300+ in a Full Mock Exam. Elite status achieved.", threshold: 300, field: "highestMockScore", category: "HIGH SCORE" },
      { id: "sc350", title: "Jambite Supreme", description: "Score 350+ in a Full Mock Exam. Medical/Engineering guaranteed.", threshold: 350, field: "highestMockScore", category: "HIGH SCORE" },
    ];

    // Fetch Subject names
    const subjects = await Subject.find({ _id: { $in: userSubjectsIds } }).select("name").lean();
    
    // Fetch user's completed sessions per subject
    const subjectStats = await PracticeSessionModel.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), sessionStatus: "COMPLETED" } },
      { $group: { _id: "$subjectId", count: { $sum: 1 } } }
    ]);
    
    const subjectSessionMap = {};
    subjectStats.forEach(stat => {
      if (stat._id) subjectSessionMap[stat._id.toString()] = stat.count;
    });

    subjects.forEach((subj) => {
      const count = subjectSessionMap[subj._id.toString()] || 0;
      
      // Tier 1: Beginner (3 sessions)
      BADGES.push({
        id: `subj-beg-${subj._id}`,
        title: `${subj.name} Initiate`,
        description: `Complete 3 practice sessions in ${subj.name}. The first step towards mastery.`,
        threshold: 3,
        field: `subject_${subj._id}`,
        currentCount: count,
        category: "SUBJECT"
      });

      // Tier 2: Amateur (15 sessions)
      BADGES.push({
        id: `subj-ama-${subj._id}`,
        title: `${subj.name} Challenger`,
        description: `Complete 15 practice sessions in ${subj.name}. You're getting the hang of this!`,
        threshold: 15,
        field: `subject_${subj._id}`,
        currentCount: count,
        category: "SUBJECT"
      });

      // Tier 3: Pro (30 sessions)
      BADGES.push({
        id: `subj-pro-${subj._id}`,
        title: `${subj.name} Legend`,
        description: `Complete 30 practice sessions in ${subj.name}. Absolute dominance.`,
        threshold: 30,
        field: `subject_${subj._id}`,
        currentCount: count,
        category: "SUBJECT"
      });
    });

    const computedMilestones = BADGES.map(badge => {
      let current;
      if (badge.currentCount !== undefined) {
        current = badge.currentCount;
      } else if (badge.field === "streak") {
        current = streakCount;
      } else if (badge.field === "highestMockScore") {
        current = highestMockScore;
      } else {
        current = sessionCount;
      }
      
      const progress = Math.min((current / badge.threshold) * 100, 100);
      const completed = current >= badge.threshold;
      
      return {
        id: badge.id,
        title: badge.title,
        description: badge.description,
        category: badge.category || "MILESTONE",
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
    const CACHE_KEY = "leaderboard:top10";
    const CACHE_TTL = 60; // seconds

    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();

    // 1. Try Redis first
    try {
      if (redisClient) {
        const cached = await redisClient.get(CACHE_KEY);
        if (cached) {
          const board = JSON.parse(cached);
          return board;
        }
      }
    } catch (redisErr) {
      // Redis is down — log and fall through to MongoDB
      console.error("[Leaderboard Cache] Redis read failed:", redisErr.message);
    }

    // 2. Cache miss — query MongoDB exactly as before
    const { userRepository } = await import("../repository/UserRepository.js");
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    
    // Fetch users sorted by their highest mock score
    const topUsers = await userRepository.find({}, {
       sort: { "stats.highestMockScore": -1 },
       limit: parsedLimit,
       select: "firstName lastName name stats photoUrl profilePicture username email privacySettings",
       lean: true
    });

    const board = topUsers.map(user => {
       const score = user.stats?.highestMockScore || 0;
       return {
         userId: user._id,
         user: user, 
         score: score
       };
    }).filter(u => u.score > 0)
      .sort((a, b) => b.score - a.score);

    let currentRank = 1;
    for (let i = 0; i < board.length; i++) {
      if (i > 0 && board[i].score < board[i - 1].score) {
        currentRank = i + 1;
      }
      board[i].rank = currentRank;
    }

    // 3. Store result in Redis before returning
    try {
      if (redisClient) {
        await redisClient.set(
          CACHE_KEY,
          JSON.stringify(board), 
          "EX",
          CACHE_TTL
        );
      }
    } catch (redisErr) {
      // Redis write failed — not critical, just log it
      console.error("[Leaderboard Cache] Redis write failed:", redisErr.message);
    }

    return board;
  }
}

export default AchievementService;
