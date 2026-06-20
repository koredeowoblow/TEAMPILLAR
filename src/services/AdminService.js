import User from "../models/UserModel.js";
import Subject from "../models/SubjectModel.js";
import Question from "../models/QuestionModel.js";
import { questionRepository } from "../repository/QuestionRepository.js";
import EmailService from "./emailService.js";
import NotificationService from "./NotificationService.js";
import { escapeRegex } from "../utils/stringUtils.js";
import cache from "../utils/cache.js";
import AITutorSession from "../models/AITutorSessionModel.js";
import AITutorMessage from "../models/AITutorMessageModel.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class AdminService {
  static async listStudents({ page = 1, limit = 50, search = "", classArm, subjectFilter, scoreRange }) {
    const skip = (page - 1) * limit;

    const matchStage = { role: "STUDENT" };
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      matchStage.$or = [{ name: regex }, { email: regex }];
    }

    if (classArm && classArm !== "All") {
      matchStage["onboarding.courseOfStudy"] = classArm;
    }

    if (subjectFilter && subjectFilter !== "All") {
      const subj = await Subject.findOne({ name: subjectFilter });
      if (subj) {
        matchStage["onboarding.subjects"] = subj._id;
      } else {
        matchStage["onboarding.subjects"] = null;
      }
    }

    const pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "practicesessions",
          let: { userId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", "$$userId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 50 },
            { 
              $project: { 
                score: 1, 
                subjectId: 1,
                sessionType: 1,
                scaledScore: {
                  $cond: {
                    if: { 
                      $or: [
                        { $eq: ["$sessionType", "smart-mock"] },
                        { $eq: ["$subjectId", null] }
                      ] 
                    },
                    then: "$score",
                    else: { $multiply: [{ $ifNull: ["$score", 0] }, 4] }
                  }
                }
              } 
            }
          ],
          as: "sessions"
        }
      },
      {
        $lookup: {
          from: "practicesessions",
          let: { userId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", "$$userId"] } } },
            { $count: "total" }
          ],
          as: "sessionCountArray"
        }
      },
      {
        $addFields: {
          sessionCount: {
            $cond: {
              if: { $gt: [{ $size: "$sessionCountArray" }, 0] },
              then: { $arrayElemAt: ["$sessionCountArray.total", 0] },
              else: 0
            }
          },
          avgPercent: {
            $cond: {
              if: { $gt: [{ $size: "$sessions" }, 0] },
              then: { $round: [{ $avg: "$sessions.scaledScore" }, 0] },
              else: 0
            }
          },
          recentScores: { $slice: ["$sessions.scaledScore", 0, 3] },
          previousScores: { $slice: ["$sessions.scaledScore", 3, 3] },
          derivedSubjects: {
            $map: { input: "$sessions", as: "s", in: "$$s.subjectId" }
          }
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          "onboarding.subjects": 1,
          "stats.progress": 1,
          sessionCount: 1,
          avgPercent: 1,
          recentScores: 1,
          previousScores: 1,
          derivedSubjects: 1,
          avgScoreUTME: {
            $cond: {
              if: { $gt: ["$avgPercent", 400] },
              then: 400,
              else: "$avgPercent"
            }
          }
        }
      }
    ];

    if (scoreRange && scoreRange !== "All") {
      const [minScoreStr, maxScoreStr] = scoreRange.split("-");
      const minScore = parseInt(minScoreStr, 10);
      const maxScore = parseInt(maxScoreStr, 10);
      if (!isNaN(minScore) && !isNaN(maxScore)) {
        pipeline.push({
          $match: {
            avgScoreUTME: { $gte: minScore, $lte: maxScore }
          }
        });
      }
    }

    // Add pagination after all filters
    pipeline.push(
      { $skip: skip },
      { $limit: limit }
    );

    const users = await User.aggregate(pipeline);

    // Calculate total count respecting scoreRange (which is computed)
    let totalCount = 0;
    if (scoreRange && scoreRange !== "All") {
      const countPipeline = [...pipeline];
      // remove skip and limit from count pipeline
      countPipeline.pop();
      countPipeline.pop();
      countPipeline.push({ $count: "total" });
      const countRes = await User.aggregate(countPipeline);
      totalCount = countRes.length > 0 ? countRes[0].total : 0;
    } else {
      totalCount = await User.countDocuments(matchStage);
    }

    // Extract all unique subject IDs across the current page of users
    // Include both practice-session derived IDs and onboarding.subjects IDs
    const allSubjectIds = new Set();
    users.forEach(user => {
      if (Array.isArray(user.derivedSubjects)) {
        user.derivedSubjects.forEach(id => {
          if (id && String(id) !== "undefined" && String(id) !== "null") allSubjectIds.add(String(id));
        });
      }
      if (Array.isArray(user.onboarding?.subjects)) {
        user.onboarding.subjects.forEach(id => {
          if (id && String(id) !== "undefined" && String(id) !== "null") allSubjectIds.add(String(id));
        });
      }
    });

    const subjects = allSubjectIds.size > 0
      ? await Subject.find({ _id: { $in: Array.from(allSubjectIds) } }).select("_id name").lean()
      : [];

    const subjectMap = {};
    subjects.forEach((subject) => {
      subjectMap[String(subject._id)] = subject.name;
    });

    const students = users.map(user => {
      const avgScore = clamp(user.avgScoreUTME || 0, 0, 400);

      const recent = user.recentScores || [];
      const previous = user.previousScores || [];
      const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : avgScore;
      const previousAvg = previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : avgScore;
      const trend = recentAvg >= previousAvg ? "up" : "down";

      // Map subject IDs to names
      const derivedSubjectNames = [
        ...new Set(
          (user.derivedSubjects || [])
            .map(id => subjectMap[String(id)] || null)
            .filter(Boolean)
        )
      ];

      // Resolve onboarding.subjects IDs → names via subjectMap
      const onboardingSubjectNames = [
        ...new Set(
          (user.onboarding?.subjects || [])
            .map(id => subjectMap[String(id)] || null)
            .filter(Boolean)
        )
      ];

      // Prefer onboarding subject names; fall back to subjects derived from practice sessions
      const subjectsList = onboardingSubjectNames.length > 0
        ? onboardingSubjectNames
        : derivedSubjectNames;

      const progressRaw = Number(user.stats?.progress || user.onboarding?.progress || 0);
      const progress = progressRaw > 0
        ? clamp(Math.round(progressRaw), 0, 100)
        : clamp(Math.round(((user.sessionCount || 0) / 20) * 100), 0, 100);

      return {
        id: String(user._id),
        code: `PLR-${new Date(user.createdAt || Date.now()).getFullYear()}-${String(user._id).slice(-4).toUpperCase()}`,
        name: user.name || "",
        email: user.email || "",
        initials: (user.name || "??").split(" ").map(n => n[0]).join("").toUpperCase(),
        subjects: subjectsList,
        avgScore,
        lastSession: recent.length > 0 ? "Just now" : "No sessions", // Simple mock for now
        trend,
        progress,
        sessionCount: user.sessionCount || 0,
      };
    });

    return {
      students,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page
    };
  }

  static async getStudent(id) {
    const user = await User.findById(id)
      .select("-password")
      .populate("selectedSubjects", "name")
      .lean();
    if (!user) return null;

    // Fetch recent practice sessions for this student
    const PracticeSession = (await import("../models/PracticeSessionModel.js")).default;
    const Subject = (await import("../models/SubjectModel.js")).default;

    const sessions = await PracticeSession.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("score subjectId subjectIds subjectScores analytics.topMistakeTopic analytics.accuracy sessionType startTime endTime createdAt questionLimit")
      .lean();

    // Build subject map for name lookups
    const subjectIdSet = new Set();
    sessions.forEach((s) => {
      if (s.subjectId && String(s.subjectId) !== "undefined" && String(s.subjectId) !== "null") {
        subjectIdSet.add(String(s.subjectId));
      }
      if (Array.isArray(s.subjectIds)) {
        s.subjectIds.forEach(id => {
          if (id && String(id) !== "undefined" && String(id) !== "null") subjectIdSet.add(String(id));
        });
      }
      if (Array.isArray(s.subjectScores)) {
        s.subjectScores.forEach(sub => {
          if (sub.subjectId && String(sub.subjectId) !== "undefined" && String(sub.subjectId) !== "null") {
            subjectIdSet.add(String(sub.subjectId));
          }
        });
      }
    });

    const subjects = subjectIdSet.size
      ? await Subject.find({ _id: { $in: Array.from(subjectIdSet) } }).select("_id name").lean()
      : [];
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[String(s._id)] = s.name; });

    // Score history — deduplicated by date, most recent last
    const scoreHistory = [];
    [...sessions].reverse().forEach((s) => {
      const date = new Date(s.createdAt).toISOString().split("T")[0];
      const isMock = s.sessionType === "smart-mock" || !s.subjectId;

      if (isMock && Array.isArray(s.subjectScores) && s.subjectScores.length > 0) {
        s.subjectScores.forEach((sub) => {
          scoreHistory.push({
            date,
            score: sub.score || 0,
            subject: subjectMap[String(sub.subjectId)] || sub.subjectName || "Unknown",
          });
        });
      } else {
        scoreHistory.push({
          date,
          score: s.score || 0,
          subject: isMock ? "Full Mock" : (subjectMap[String(s.subjectId)] || "Unknown"),
        });
      }
    });

    // Weak topics — ranked by frequency of topMistakeTopic across sessions
    const topicCounts = {};
    const topicSubjectMap = {};
    for (const s of sessions) {
      const topic = s.analytics?.topMistakeTopic;
      if (topic) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        topicSubjectMap[topic] = subjectMap[String(s.subjectId)] || "General";
      }
    }
    const weakTopics = Object.keys(topicCounts)
      .sort((a, b) => topicCounts[b] - topicCounts[a])
      .slice(0, 5)
      .map((topic) => ({
        topic,
        subject: topicSubjectMap[topic],
        errors: topicCounts[topic],
      }));

    // Recent sessions — last 10, formatted for the UI table
    const recentSessions = sessions.slice(0, 10).map((s) => {
      const isMock = s.sessionType === "smart-mock" || !s.subjectId;
      const score = s.score || 0;
      const maxScore = isMock ? 400 : 100;
      const pct = (score / maxScore) * 100;

      let status = "On Track";
      let statusColor = "bg-green-50 text-green-600";
      if (pct < 40) { status = "Needs Review"; statusColor = "bg-amber-50 text-amber-600"; }
      if (pct >= 80) { status = "Excellent"; statusColor = "bg-green-50 text-green-600"; }

      const durationMs = s.endTime && s.startTime
        ? new Date(s.endTime) - new Date(s.startTime)
        : null;
      const minutes = durationMs ? Math.floor(durationMs / 60000) : null;
      const seconds = durationMs ? Math.floor((durationMs % 60000) / 1000) : null;
      const timeSpent = minutes != null ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : "—";

      return {
        date: new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        subject: isMock ? "Full Mock" : (subjectMap[String(s.subjectId)] || "Practice"),
        sessionType: s.sessionType || "standard",
        score: `${score}/${maxScore}`,
        timeSpent,
        status,
        statusColor,
      };
    });

    // Subject performance averages
    const subjectScoresMap = {};
    for (const s of sessions) {
      const isMock = s.sessionType === "smart-mock" || !s.subjectId;

      if (isMock && Array.isArray(s.subjectScores) && s.subjectScores.length > 0) {
        for (const sub of s.subjectScores) {
          const subjId = String(sub.subjectId || "Unknown");
          const name = subjectMap[subjId] || sub.subjectName || "Unknown";
          if (!subjectScoresMap[subjId]) {
            subjectScoresMap[subjId] = { scores: [], name };
          }
          subjectScoresMap[subjId].scores.push(sub.score || 0);
        }
      } else {
        const subjId = String(s.subjectId || "Unknown");
        const name = subjectMap[subjId] || subjId;
        if (!subjectScoresMap[subjId]) {
          subjectScoresMap[subjId] = { scores: [], name };
        }
        subjectScoresMap[subjId].scores.push(s.score || 0);
      }
    }
    const subjectPerformance = Object.values(subjectScoresMap).map((data) => {
      const avg = data.scores.length
        ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : 0;
      return { name: data.name, pct: avg };
    });

    const avgScore = sessions.length
      ? Math.round(sessions.reduce((sum, s) => sum + (s.score || 0), 0) / sessions.length)
      : 0;

    return {
      ...user,
      id: String(user._id),
      initials: (user.name || "??").split(" ").map((n) => n[0]).join("").toUpperCase(),
      targetScore: user.onboarding?.targetScore || 280,
      avgScore,
      totalSessions: sessions.length,
      scoreHistory,
      weakTopics,
      recentSessions,
      subjectPerformance,
    };
  }

  static async updateStudent(id, data) {
    const updated = await User.findByIdAndUpdate(id, data, { new: true });
    await cache.del("admin:dashboard:stats");
    return updated;
  }

  static async getStudentPracticeSetup(studentId) {
    const user = await User.findById(studentId).lean();
    if (!user) throw new Error("Student not found");

    const isPro = user.subscription?.status === "active" || user.role === "PRO"; // Adjust based on your pro logic

    // Find all subjects
    const allSubjects = await Subject.find().select("_id name code description questionCount").lean();

    // Determine the student's enrolled subjects
    const onboardingSubjects = user.onboarding?.subjects || user.selectedSubjects || [];
    const onboardingSubjectIds = (Array.isArray(onboardingSubjects) ? onboardingSubjects : [])
      .map(s => String(typeof s === "object" ? s._id || s.id : s))
      .filter(Boolean);

    let enrolledSubjects = allSubjects;
    if (onboardingSubjectIds.length > 0) {
      enrolledSubjects = allSubjects.filter(s => onboardingSubjectIds.includes(String(s._id)));
    }

    // Group distinct topics by subjectId in a single query
    const subjectIds = enrolledSubjects.map(s => s._id);
    const topicsAggregation = await Question.aggregate([
      {
        $match: {
          subjectId: { $in: subjectIds },
          "metadata.topic": { $exists: true, $ne: "" }
        }
      },
      {
        $group: {
          _id: "$subjectId",
          topics: { $addToSet: "$metadata.topic" }
        }
      }
    ]);

    // Map aggregated topics back to enrolledSubjects
    const topicsMap = {};
    for (const item of topicsAggregation) {
      topicsMap[String(item._id)] = item.topics.filter(Boolean).sort((a, b) => a.localeCompare(b));
    }

    const subjectsWithTopics = enrolledSubjects.map(subj => ({
      id: subj._id,
      name: subj.name,
      code: subj.code,
      topics: topicsMap[String(subj._id)] || []
    }));

    return {
      studentId: String(user._id),
      studentName: user.name,
      isPro,
      maxSubjects: isPro ? 6 : 2,
      maxQuestionLimit: isPro ? 100 : 20,
      availableSubjects: subjectsWithTopics,
      allSubjectsCount: allSubjects.length
    };
  }

  static async getStudentAISessions(studentId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const filter = { studentId };

    const sessions = await AITutorSession.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await AITutorSession.countDocuments(filter);

    return {
      sessions,
      total,
      totalPages: Math.ceil(total / limit),
      page: Number(page)
    };
  }

  static async getStudentAISessionMessages(sessionId) {
    const session = await AITutorSession.findById(sessionId).lean();
    if (!session) throw new Error("AI Session not found");

    const messages = await AITutorMessage.find({ sessionId })
      .sort({ createdAt: 1 })
      .lean();

    return { session, messages };
  }

  static async deleteStudent(id) {
    await User.findByIdAndDelete(id);
    await cache.del("admin:dashboard:stats");
    return { success: true };
  }

  static async exportStudents(ids) {
    // Logic for generating CSV or JSON export
    return { message: "Export logic placeholder" };
  }

  static async sendReminder(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return { count: 0 };

    const users = await User.find({ _id: { $in: ids } });

    let count = 0;
    for (const user of users) {
      if (!user.email) continue;

      // Send Email
      await EmailService.sendNudgeEmail(user.email, user.name || "Student");

      // Send In-App Notification
      await NotificationService.create({
        userId: user._id,
        type: "system",
        title: "Time to Study!",
        message: "We noticed you haven't been practicing lately. Jump back in to keep your streak alive and achieve your target score!"
      });

      count++;
    }

    return { count };
  }

  static async getDashboardStats() {
    const cacheKey = "admin:dashboard:stats";
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const PracticeSession = (await import("../models/PracticeSessionModel.js")).default;
    const TopicPerformance = (await import("../models/TopicPerformanceModel.js")).default;

    // ── Core counters ───────────────────────────────────────────────────────
    const totalStudents = await User.countDocuments({ role: "STUDENT" });
    const activeSessions = await PracticeSession.countDocuments({ sessionStatus: "ACTIVE" });

    // ── Avg predicted score across all students ─────────────────────────────
    const scoreAgg = await User.aggregate([
      { $match: { role: "STUDENT", "stats.predictedScore": { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: "$stats.predictedScore" } } },
    ]);
    const avgScore = scoreAgg.length ? Math.round(scoreAgg[0].avg) : 0;

    // ── Score distribution (completed session scores bucketed into UTME bands) ─
    const distAgg = await PracticeSession.aggregate([
      { $match: { sessionStatus: "COMPLETED", score: { $gt: 0 } } },
      {
        $bucket: {
          groupBy: "$score",
          boundaries: [0, 100, 200, 300, 400],
          default: "400+",
          output: { count: { $sum: 1 } },
        },
      },
    ]);
    const bandLabels = ["0-100", "100-200", "200-300", "300-400"];
    const bandBoundaries = [0, 100, 200, 300];
    const distMap = Object.fromEntries(distAgg.map((b) => [b._id, b.count]));
    const scoreDistribution = bandBoundaries.map((lower, i) => ({
      range: bandLabels[i],
      count: distMap[lower] || 0,
    }));

    // ── Top performers (top 5 students by predicted score) ──────────────────
    const topPerformersRaw = await User.find({ role: "STUDENT", "stats.predictedScore": { $gt: 0 } })
      .sort({ "stats.predictedScore": -1 })
      .limit(5)
      .select("name stats.predictedScore onboarding")
      .lean();
    const topPerformers = topPerformersRaw.map((u) => ({
      name: u.name || "Student",
      score: `${u.stats?.predictedScore || 0}/400`,
      class: u.onboarding?.examType || "General",
    }));

    // ── Subject heatmap (top 5 topics by failure rate, pivoted by subject) ──
    const heatmapAgg = await TopicPerformance.aggregate([
      { $match: { totalAttempted: { $gte: 3 } } },
      {
        $group: {
          _id: { topicId: "$topicId", subjectId: "$subjectId" },
          avgMasterySubject: { $avg: "$masteryScore" }
        }
      },
      {
        $lookup: {
          from: "subjects",
          localField: "_id.subjectId",
          foreignField: "_id",
          as: "subject",
        },
      },
      { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id.topicId",
          avgMastery: { $avg: "$avgMasterySubject" },
          subjects: {
            $push: {
              name: { $ifNull: ["$subject.name", "General"] },
              mastery: "$avgMasterySubject",
            },
          },
        },
      },
      { $sort: { avgMastery: 1 } }, // lowest mastery first (most problematic)
      { $limit: 6 },
    ]);

    const subjectHeatmap = heatmapAgg.map((row) => {
      // Build a subject→mastery map from the pushed array
      const subjMap = {};
      for (const s of row.subjects) {
        const key = (s.name || "general").toLowerCase();
        subjMap[key] = s.mastery;
      }
      const pct = (v) => (v != null ? `${Math.round(100 - v)}%` : "N/A");
      return {
        topic: row._id,
        english: pct(subjMap["english"]),
        math: pct(subjMap["mathematics"] ?? subjMap["maths"]),
        physics: pct(subjMap["physics"]),
        chemistry: pct(subjMap["chemistry"]),
        biology: pct(subjMap["biology"]),
      };
    });

    // ── Needs attention (5 students with lowest predicted scores, recently active) ─
    const recentCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // last 14 days
    const recentActiveIds = await PracticeSession.distinct("userId", {
      createdAt: { $gte: recentCutoff },
    });
    const needsAttentionRaw = await User.find({
      role: "STUDENT",
      _id: { $in: recentActiveIds },
      "stats.predictedScore": { $gt: 0 },
    })
      .sort({ "stats.predictedScore": 1 })
      .limit(5)
      .select("name stats.predictedScore")
      .lean();
    const needsAttention = needsAttentionRaw.map((u) => ({
      id: String(u._id),
      name: u.name || "Student",
      score: `${u.stats?.predictedScore || 0}/400`,
      progress: `${Math.round(((u.stats?.predictedScore || 0) / 400) * 100)}%`,
    }));

    // ── Most Struggled Subject ───────────────────────────────────────────────
    const struggledSubjectAgg = await TopicPerformance.aggregate([
      { $match: { totalAttempted: { $gt: 0 } } },
      {
        $group: {
          _id: "$subjectId",
          avgMastery: { $avg: "$masteryScore" }
        }
      },
      { $sort: { avgMastery: 1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: "subjects",
          localField: "_id",
          foreignField: "_id",
          as: "subject"
        }
      },
      { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } }
    ]);
    let mostStruggledSubject = null;
    if (struggledSubjectAgg.length > 0) {
      const subj = struggledSubjectAgg[0];
      mostStruggledSubject = {
        name: subj.subject?.name || "Unknown",
        percent: Math.round(100 - (subj.avgMastery || 0))
      };
    }

    const result = {
      totalStudents,
      studentsTrend: "+5% vs last week", // trend requires time-series; kept as label
      avgScore,
      activeSessions,
      scoreDistribution,
      topPerformers,
      subjectHeatmap,
      needsAttention,
      mostStruggledSubject,
    };
    await cache.set(cacheKey, result, 60); // Cache for 60 seconds
    return result;
  }


  static async getLiveMonitorData() {
    const PracticeSession = (await import("../models/PracticeSessionModel.js")).default;
    const activeSessionCount = await PracticeSession.countDocuments({ sessionStatus: "ACTIVE" });
    const activeSessionsRaw = await PracticeSession.find({ sessionStatus: "ACTIVE" })
      .select("userId subjectId startTime sessionType questionLimit questionIds")
      .populate("userId", "name email")
      .populate("subjectId", "name")
      .sort({ startTime: -1 })
      .lean();

    const activeSessions = activeSessionsRaw.map(s => ({
      id: String(s._id),
      studentName: s.userId?.name || "Unknown",
      studentEmail: s.userId?.email || "Unknown",
      subject: s.subjectId?.name || "Multiple Subjects",
      startTime: s.startTime,
      sessionType: s.sessionType || "standard",
      questionCount: s.questionLimit || s.questionIds?.length || 0,
    }));

    return {
      activeSessionCount,
      activeSessions,
    };
  }

  static async listQuestions({ page = 1, limit = 50, subjectId, topic, difficulty }) {
    const skip = (page - 1) * limit;
    const filter = {};
    if (subjectId) filter.subjectId = subjectId;
    if (topic) filter["metadata.topic"] = topic;
    if (difficulty) filter["metadata.difficulty"] = difficulty;

    const questions = await Question.find(filter)
      .select("subjectId metadata.topic metadata.difficulty content.text metadata.year options")
      .populate("subjectId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Question.countDocuments(filter);

    return {
      questions: questions.map(q => ({
        id: q._id,
        subject: q.subjectId?.name || "Unknown",
        topic: q.metadata?.topic || "General",
        difficulty: q.metadata?.difficulty || "medium",
        text: q.content?.text || "No content",
        year: q.metadata?.year,
        optionsCount: q.options?.length || 0,
      })),
      total,
      totalPages: Math.ceil(total / limit),
      page
    };
  }

  static async getQuestion(id) {
    return Question.findById(id).populate("subjectId", "name").lean();
  }

  static async getQuestionStats() {
    const stats = await Question.aggregate([
      {
        $group: {
          _id: null,
          totalQuestions: { $sum: 1 },
          subjects: { $addToSet: "$subjectId" },
          topics: { $addToSet: "$metadata.topic" },
        }
      }
    ]);

    const result = stats[0] || { totalQuestions: 0, subjects: [], topics: [] };
    return {
      totalQuestions: result.totalQuestions,
      totalSubjects: result.subjects.length,
      totalTopics: result.topics.length,
    };
  }

  static async uploadQuestions(questionsData) {
    // Strip rogue _id fields before bulk insert to prevent conflicts
    const sanitized = questionsData.map(({ _id, __v, ...rest }) => rest);
    const results = await questionRepository.insertMany(sanitized);
    return {
      count: results.length,
      message: `${results.length} questions uploaded successfully.`
    };
  }

  static async updateQuestion(id, data) {
    const updated = await Question.findByIdAndUpdate(id, data, { new: true });
    return updated;
  }

  static async deleteQuestion(id) {
    await Question.findByIdAndDelete(id);
    return { success: true };
  }
}

export default AdminService;
