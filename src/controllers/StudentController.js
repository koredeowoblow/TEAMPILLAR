import { sendSuccess } from "../core/response.js";
import { userRepository } from "../repository/UserRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import Subject from "../models/SubjectModel.js";
import { AppError } from "../utils/AppError.js";
import { toUserDTO } from "../dto/index.js";
import FreemiumGuard from "../services/FreemiumGuard.js";
import { invalidateCachedSessionUser } from "../utils/authSessionCache.js";
import mongoose from "mongoose";

/* ── UTME exam date: set UTME_DATE in .env as YYYY-MM-DD ── */
function getDaysToExam() {
  const utmeDate = process.env.UTME_DATE
    ? new Date(process.env.UTME_DATE)
    : null;
  if (!utmeDate || Number.isNaN(utmeDate.getTime())) return null;
  const diff = Math.ceil((utmeDate - Date.now()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/* ── Determine next badge from streak / session count ── */
function deriveNextBadge(streak, sessionCount) {
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
  return null; // All basic badges unlocked
}

class StudentController {
  static async updateOnboarding(req, res) {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const { subjects, targetScore, studyHours } = req.body;

    if (subjects !== undefined) {
      if (subjects && Array.isArray(subjects)) {
        // Freemium Guard: Subject limit
        FreemiumGuard.checkSubjectLimit(subjects.length, req.user);

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
      if (!user.stats) user.stats = {};
      user.stats.predictedScore = targetScore;
    }

    if (studyHours !== undefined) {
      if (!user.onboarding) user.onboarding = {};
      user.onboarding.studyHoursSet = true;
      user.onboarding.studyHoursPerDay = studyHours;
    }

    // Check completion
    const o = user.onboarding || {};
    const emailVerified = user.emailVerified === true;
    if (emailVerified && o.subjectsSelected && o.targetScoreSet && o.studyHoursSet) {
      user.onboarding.completed = true;
    }

    user.markModified("onboarding");
    const updated = await user.save();

    if (req.tokenHash) {
      await invalidateCachedSessionUser(req.tokenHash);
    }

    return sendSuccess(res, {
      message: "Onboarding saved",
      data: toUserDTO(updated),
      statusCode: 200,
    });
  }

  static async updateSelectedSubjects(req, res) {
    const userId = req.user?.id;
    const { subjects } = req.body;

    if (!subjects || !Array.isArray(subjects)) {
      throw new AppError("Subjects array is required", 400);
    }

    // Freemium Guard: Subject limit
    FreemiumGuard.checkSubjectLimit(subjects.length, req.user);

    if (subjects.length > 6) {
      throw new AppError("You can select a maximum of 6 subjects", 400);
    }

    const validSubjects = await Subject.find({ _id: { $in: subjects }, isActive: { $ne: false } }).lean();
    if (validSubjects.length !== subjects.length) {
      throw new AppError("One or more of the selected subjects are currently unavailable.", 400);
    }

    const user = await userRepository.findById(userId, { lean: true, select: "_id lastSubjectUpdate" });
    if (!user) throw new AppError("User not found", 404);

    // Check if the user has updated subjects in the last week
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

    if (req.tokenHash) {
      await invalidateCachedSessionUser(req.tokenHash);
    }

    return sendSuccess(res, {
      message: "Subjects updated successfully",
      data: toUserDTO(updated),
      statusCode: 200,
    });
  }

  static async getDashboard(req, res) {
    const user = req.user;
    if (!user) throw new AppError("Unauthorized", 401);

    const objectId = new mongoose.Types.ObjectId(user.id);

    // ── Single MongoDB Aggregation for all Dashboard Metrics ─────────────────
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
    
    // ── Core score metrics ──────────────────────────────────
    const total = globalStats.totalSessions;
    const avgPercent = Math.round(globalStats.avgScore || 0);
    const avgScore = Math.round(avgPercent * 4); // % → /400 UTME scale
    const targetScore = user.onboarding?.targetScore || 300;
    const progressPercent = Math.min(
      Math.round((avgScore / targetScore) * 100),
      100,
    );

    // ── Streak & study time ──────────────────────────────────
    const streak = user.analytics?.streak ?? user.analytics?.streakDays ?? 0;
    const studyHoursTotal = user.analytics?.totalStudyHours
      ?? user.analytics?.total_study_hours
      ?? Math.round((total * 20) / 60 * 10) / 10; // fallback: 20min per session

    const questionsAttempted =
      user.analytics?.questionsAttempted
      ?? user.analytics?.total_questions
      ?? (globalStats.questionsAttempted || 0);

    const subjectMastery = metrics.subjectMastery || [];
    const recentMockTests = metrics.recentMocks || [];

    // ── Daily tasks from study plan ──────────────────────────
    // The study plan is saved during onboarding. Each item: { id, topic, subject, duration, completed }
    const dailyTasks = Array.isArray(user.onboarding?.studyPlan)
      ? user.onboarding.studyPlan.map((task, i) => ({
        id: task.id || String(i),
        topic: task.topic || task.title || "Study Session",   // frontend reads task.topic
        title: task.topic || task.title || "Study Session",
        subject: task.subject || "General",
        duration: Number(task.duration) || 20,               // never send null — default 20 min
        subjectId: task.subjectId || null,
        type: task.type || "Practice",
        completed: Boolean(task.completed),
      }))
      : [];

    // ── Upcoming schedule from onboarding ───────────────────
    const schedule = Array.isArray(user.onboarding?.schedule)
      ? user.onboarding.schedule.map((item, i) => ({
        id: item.id || String(i),
        time: item.time || item.date || "TBD",
        title: item.title || item.name || "Scheduled Session",
        desc: item.description || item.desc || "",
        color: item.color || "#1B2A5E",
      }))
      : [];

    // ── Next badge ───────────────────────────────────────────
    const nextBadge = deriveNextBadge(streak, total);

    // ── Build response ───────────────────────────────────────
    const dashboard = {
      // Identity
      name: (user.name || "Student").split(" ")[0],

      // Score metrics
      avgScore,
      predictedScore: user.stats?.predictedScore || 0,
      isPredictedScoreConfident: user.stats?.isPredictedScoreConfident || false,
      predictedScoreDetails: user.stats?.predictedScoreDetails || null,
      targetScore,
      progressPercent,
      questionsAttempted,
      highestMockScore: user.stats?.highestMockScore || 0,
      totalMocksTaken: user.stats?.totalMocksTaken || 0,
      avgMockScore: user.stats?.avgMockScore || 0,

      // Time
      streak,
      studyHours: studyHoursTotal,
      daysToExam: getDaysToExam(),

      // Chart
      subjectMastery,

      // Task plan
      dailyTasks,

      // Schedule
      schedule,

      // Achievement
      nextBadge,

      // Recent practice
      recentMockTests,

      // Global rank (from analytics if available)
      globalRank: user.analytics?.globalRank ?? user.analytics?.global_rank ?? null,
      avgAccuracy: avgPercent,
      mockTestsCount: sessions.filter((s) => s.sessionType === "smart-mock").length,
      weakTopicsCount: subjectMastery.filter((m) => m.score < 60).length,
    };

    return sendSuccess(res, {
      message: "Dashboard retrieved",
      data: dashboard,
      statusCode: 200,
    });
  }
}

export default StudentController;
