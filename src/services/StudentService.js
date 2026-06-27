import { userRepository } from "../repository/UserRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import Subject from "../models/SubjectModel.js";
import { AppError } from "../utils/AppError.js";
import { toUserDTO } from "../dto/index.js";
import FreemiumGuard from "./FreemiumGuard.js";
import { invalidateCachedSessionUser } from "../utils/authSessionCache.js";
import mongoose from "mongoose";

class StudentService {
  /* ── UTME exam date: set UTME_DATE in .env as YYYY-MM-DD ── */
  static getDaysToExam() {
    const utmeDate = process.env.UTME_DATE
      ? new Date(process.env.UTME_DATE)
      : null;
    if (!utmeDate || Number.isNaN(utmeDate.getTime())) return null;
    const diff = Math.ceil((utmeDate - Date.now()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }

  /* ── Determine next badge from streak / session count ── */
  static deriveNextBadge(streak, sessionCount) {
    const BADGES = [
      { name: "Consistent Learner", description: "Study for 7 days in a row.", threshold: 7, field: "streak" },
      { name: "Speedster", description: "Complete 3 mocks with 90%+ accuracy to unlock.", threshold: 3, field: "sessions" },
      { name: "Century Scholar", description: "Complete 100 practice sessions.", threshold: 100, field: "sessions" },
      { name: "Fortnight Warrior", description: "Maintain a 14-day study streak.", threshold: 14, field: "streak" },
    ];

    for (const badge of BADGES) {
      const current = badge.field === "streak" ? streak : sessionCount;
      if (current < badge.threshold) {
        return {
          name: badge.name,
          description: badge.description,
          progress: current,
          total: badge.threshold,
        };
      }
    }
    return null;
  }

  /* ── Generate Dynamic AI Insights ── */
  static generateAIInsights(subjectMastery, streak, avgAccuracy) {
    const insights = [];

    const weakSubjects = subjectMastery.filter(m => m.score < 60).sort((a, b) => a.score - b.score);
    if (weakSubjects.length > 0) {
      const weakSubject = weakSubjects[0];
      insights.push({
        id: 'weak-area',
        type: 'alert',
        title: `Weak area alert — ${weakSubject.subject}`,
        description: `Your ${weakSubject.subject} mastery is currently at ${weakSubject.score}%. Prioritise this subject before your next mock test.`
      });
    }

    const strongSubjects = subjectMastery.filter(m => m.score >= 70).sort((a, b) => b.score - a.score);
    if (strongSubjects.length > 0) {
      const strongSubject = strongSubjects[0];
      insights.push({
        id: 'strong-area',
        type: 'success',
        title: `${strongSubject.subject} is your strongest subject`,
        description: `At ${strongSubject.score}%, use it to boost confidence during timed mock tests this week.`
      });
    } else if (streak >= 3) {
      insights.push({
        id: 'streak',
        type: 'success',
        title: `Great consistency!`,
        description: `You are on a ${streak}-day learning streak. Consistent daily practice is the key to a high UTME score.`
      });
    }

    insights.push({
      id: 'strategy',
      type: 'strategy',
      title: 'Time Management',
      description: `Pace yourself! Try skimming theory-based questions faster to save more time for calculations.`
    });

    return insights.slice(0, 3);
  }

  static async updateOnboarding(authUser, payload, tokenHash) {
    const userId = authUser?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const { subjects, targetScore, studyHours } = payload;

    if (subjects !== undefined) {
      if (subjects && Array.isArray(subjects)) {
        FreemiumGuard.checkSubjectLimit(subjects.length, authUser);

        if (subjects.length > 6) {
          throw new AppError("You can select a maximum of 6 subjects", 400);
        }

        const validSubjects = await Subject.find({ _id: { $in: subjects }, isActive: { $ne: false } }).lean();
        if (validSubjects.length !== subjects.length) {
          throw new AppError("One or more of the selected subjects are currently unavailable.", 400);
        }
      }
      if (!user.onboarding) user.onboarding = {};
      user.onboarding.subjectsSelected = true;
      user.onboarding.subjects = subjects;
      user.selectedSubjects = subjects;
      user.lastSubjectUpdate = new Date();
    }

    if (targetScore !== undefined) {
      if (!user.onboarding) user.onboarding = {};
      user.onboarding.targetScoreSet = true;
      user.onboarding.targetScore = targetScore;
    }

    if (studyHours !== undefined) {
      if (!user.onboarding) user.onboarding = {};
      user.onboarding.studyHoursSet = true;
      user.onboarding.studyHoursPerDay = studyHours;
    }

    const o = user.onboarding || {};
    const emailVerified = user.emailVerified === true;
    if (emailVerified && o.subjectsSelected && o.targetScoreSet && o.studyHoursSet) {
      user.onboarding.completed = true;
    }

    user.markModified("onboarding");
    const updated = await user.save();

    if (tokenHash) {
      await invalidateCachedSessionUser(tokenHash);
    }

    return toUserDTO(updated);
  }

  static async updateSelectedSubjects(authUser, subjects, tokenHash) {
    const userId = authUser?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    if (!subjects || !Array.isArray(subjects)) {
      throw new AppError("Subjects array is required", 400);
    }

    FreemiumGuard.checkSubjectLimit(subjects.length, authUser);

    if (subjects.length > 6) {
      throw new AppError("You can select a maximum of 6 subjects", 400);
    }

    const validSubjects = await Subject.find({ _id: { $in: subjects }, isActive: { $ne: false } }).lean();
    if (validSubjects.length !== subjects.length) {
      throw new AppError("One or more of the selected subjects are currently unavailable.", 400);
    }

    const user = await userRepository.findById(userId, { lean: true, select: "_id lastSubjectUpdate" });
    if (!user) throw new AppError("User not found", 404);

    if (user.lastSubjectUpdate) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      if (user.lastSubjectUpdate > oneWeekAgo) {
        const nextAllowedDate = new Date(user.lastSubjectUpdate);
        nextAllowedDate.setDate(nextAllowedDate.getDate() + 7);
        throw new AppError(
          `You can only change your subjects once a week. Next change allowed after ${nextAllowedDate.toLocaleDateString()}`,
          403,
        );
      }
    }

    const updated = await userRepository.updateUser(userId, {
      selectedSubjects: subjects,
      lastSubjectUpdate: new Date(),
    });

    if (tokenHash) {
      await invalidateCachedSessionUser(tokenHash);
    }

    return toUserDTO(updated);
  }

  static async getDashboard(authUser) {
    if (!authUser) throw new AppError("Unauthorized", 401);

    const user = await userRepository.findById(authUser.id);
    if (!user) throw new AppError("User not found", 404);

    const objectId = new mongoose.Types.ObjectId(user.id);

    const dashboardMetrics = await practiceRepository.aggregate([
      { $match: { userId: objectId } },
      { 
        $facet: {
          globalStats: [
            { 
              $group: { 
                _id: null, 
                totalSessions: { $sum: 1 },
                avgScore: { $avg: "$score" },
                questionsAttempted: { $sum: "$totalQuestions" }
              }
            }
          ],
          subjectMastery: [
            { $group: { _id: "$subjectId", score: { $avg: "$score" } } },
            {
              $lookup: {
                from: "subjects",
                localField: "_id",
                foreignField: "_id",
                as: "subjectDetails"
              }
            },
            { $unwind: { path: "$subjectDetails", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                subject: { $ifNull: ["$subjectDetails.name", "General"] },
                score: { $round: ["$score", 0] },
                fullMark: { $literal: 100 }
              }
            }
          ],
          recentMocks: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: "subjects",
                localField: "subjectId",
                foreignField: "_id",
                as: "subjectDetails"
              }
            },
            { $unwind: { path: "$subjectDetails", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                id: { $toString: "$_id" },
                score: { $ifNull: ["$score", 0] },
                subject: { $ifNull: ["$subjectDetails.name", "General"] },
                createdAt: 1,
                sessionType: { $ifNull: ["$sessionType", "Practice Sprint"] },
                questionsCount: { $size: { $ifNull: ["$responses", []] } },
                durationMinutes: {
                  $max: [1, { $round: [ { $divide: [ { $sum: "$responses.timeTaken" }, 60 ] }, 0 ] }]
                }
              }
            }
          ]
        }
      }
    ]);

    const metrics = dashboardMetrics[0] || {};
    const globalStats = (metrics.globalStats && metrics.globalStats[0]) || { totalSessions: 0, avgScore: 0, questionsAttempted: 0 };
    
    const total = globalStats.totalSessions;
    const avgPercent = Math.round(globalStats.avgScore || 0);
    const avgScore = Math.round(avgPercent * 4);
    const targetScore = user.onboarding?.targetScore || 300;
    const progressPercent = Math.min(
      Math.round((avgScore / targetScore) * 100),
      100,
    );

    let streak = 0;
    try {
      const { achievementRepository } = await import("../repository/AchievementRepository.js");
      const streakDoc = await achievementRepository.getStreakByUser(user.id);
      const today = new Date();
      streak = 1;

      if (streakDoc) {
        const lastStreakDate = new Date(streakDoc.updatedAt);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastStreakDate.toDateString() === yesterday.toDateString()) {
           streak = streakDoc.streakCount + 1;
        } else if (lastStreakDate.toDateString() === today.toDateString()) {
           streak = streakDoc.streakCount;
        } else {
           streak = 1;
        }
      }
      
      if (!streakDoc || new Date(streakDoc.updatedAt).toDateString() !== today.toDateString()) {
         await achievementRepository.updateStreak(user.id, streak);
      }
    } catch (err) {
      console.error("Error fetching/syncing streak:", err);
    }
    
    const studyHoursTotal = Math.round((total * 20) / 60 * 10) / 10;

    const questionsAttempted =
      user.analytics?.questionsAttempted
      ?? user.analytics?.total_questions
      ?? (globalStats.questionsAttempted || 0);

    const subjectMastery = metrics.subjectMastery || [];
    const recentMockTests = metrics.recentMocks || [];

    const dailyTasks = Array.isArray(user.onboarding?.studyPlan)
      ? user.onboarding.studyPlan.map((task, i) => ({
        id: task.id || String(i),
        topic: task.topic || task.title || "Study Session",
        title: task.topic || task.title || "Study Session",
        subject: task.subject || "General",
        duration: Number(task.duration) || 20,
        subjectId: task.subjectId || null,
        type: task.type || "Practice",
        completed: Boolean(task.completed),
      }))
      : [];

    const schedule = Array.isArray(user.onboarding?.schedule)
      ? user.onboarding.schedule.map((item, i) => ({
        id: item.id || String(i),
        time: item.time || item.date || "TBD",
        title: item.title || item.name || "Scheduled Session",
        desc: item.description || item.desc || "",
        color: item.color || "#1B2A5E",
      }))
      : [];

    const nextBadge = this.deriveNextBadge(streak, total);

    return {
      name: (user.name || "Student").split(" ")[0],
      avgScore,
      predictedScore: questionsAttempted > 0 ? (user.stats?.predictedScore || 0) : 0,
      isPredictedScoreConfident: questionsAttempted > 0 ? (user.stats?.isPredictedScoreConfident || false) : false,
      predictedScoreDetails: user.stats?.predictedScoreDetails || null,
      sessionsNeeded: user.stats?.sessionsNeededForPrediction || 0,
      targetScore,
      progressPercent,
      questionsAttempted,
      highestMockScore: user.stats?.highestMockScore || 0,
      totalMocksTaken: user.stats?.totalMocksTaken || 0,
      avgMockScore: user.stats?.avgMockScore || 0,
      streak,
      studyHours: studyHoursTotal,
      daysToExam: this.getDaysToExam(),
      subjectMastery,
      dailyTasks,
      schedule,
      nextBadge,
      recentMockTests,
      globalRank: user.analytics?.globalRank ?? user.analytics?.global_rank ?? null,
      avgAccuracy: avgPercent,
      mockTestsCount: user.stats?.totalMocksTaken || 0,
      weakTopicsCount: subjectMastery.filter((m) => m.score < 60).length,
      aiInsights: this.generateAIInsights(subjectMastery, streak, avgPercent)
    };
  }
}

export default StudentService;
