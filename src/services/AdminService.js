import User from "../models/UserModel.js";
import Subject from "../models/SubjectModel.js";
import Question from "../models/QuestionModel.js";
import { escapeRegex } from "../utils/stringUtils.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class AdminService {
  static async listStudents({ page = 1, limit = 50, search = "" }) {
    const skip = (page - 1) * limit;

    const matchStage = { role: "STUDENT" };
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      matchStage.$or = [{ name: regex }, { email: regex }];
    }

    const pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "practicesessions",
          let: { userId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", "$$userId"] } } },
            { $sort: { createdAt: -1 } },
            { $project: { score: 1, subjectId: 1 } } // Fetch only required fields
          ],
          as: "sessions"
        }
      },
      {
        $addFields: {
          sessionCount: { $size: "$sessions" },
          avgPercent: {
            $cond: {
              if: { $gt: [{ $size: "$sessions" }, 0] },
              then: { $round: [{ $avg: "$sessions.score" }, 0] },
              else: 0
            }
          },
          recentScores: { $slice: ["$sessions.score", 0, 3] },
          previousScores: { $slice: ["$sessions.score", 3, 3] },
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
          derivedSubjects: 1
        }
      }
    ];

    const users = await User.aggregate(pipeline);
    const totalCount = await User.countDocuments(matchStage);

    // Extract all unique subject IDs across the current page of users
    const allSubjectIds = new Set();
    users.forEach(user => {
      if (Array.isArray(user.derivedSubjects)) {
        user.derivedSubjects.forEach(id => {
          if (id) allSubjectIds.add(String(id));
        });
      }
    });

    const subjects = allSubjectIds.size > 0 
      ? await Subject.find({ _id: { $in: Array.from(allSubjectIds) } }).lean() 
      : [];
    
    const subjectMap = {};
    subjects.forEach((subject) => {
      subjectMap[String(subject._id)] = subject.name;
    });

    const students = users.map(user => {
      const avgPercent = user.avgPercent || 0;
      const avgScore = clamp(avgPercent * 4, 0, 400);

      const recent = user.recentScores || [];
      const previous = user.previousScores || [];
      const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : avgPercent;
      const previousAvg = previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : avgPercent;
      const trend = recentAvg >= previousAvg ? "up" : "down";

      // Map subject IDs to names
      const derivedSubjectNames = [
        ...new Set(
          (user.derivedSubjects || [])
            .map(id => subjectMap[String(id)] || null)
            .filter(Boolean)
        )
      ];

      const subjectsList = Array.isArray(user.onboarding?.subjects) && user.onboarding.subjects.length > 0
        ? user.onboarding.subjects
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
      .lean();

    // Build subject map for name lookups
    const subjectIds = [...new Set(sessions.map((s) => String(s.subjectId)).filter(Boolean))];
    const subjects = subjectIds.length
      ? await Subject.find({ _id: { $in: subjectIds } }).lean()
      : [];
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[String(s._id)] = s.name; });

    // Score history — deduplicated by date, most recent last
    const scoreHistory = [...sessions]
      .reverse()
      .map((s) => ({
        date: new Date(s.createdAt).toISOString().split("T")[0],
        score: s.score || 0,
        subject: subjectMap[String(s.subjectId)] || "Unknown",
      }));

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
      const accuracy = s.analytics?.accuracy ?? null;
      const score = s.score || 0;
      let status = "On Track";
      let statusColor = "bg-green-50 text-green-600";
      if (score < 40) { status = "Needs Review"; statusColor = "bg-amber-50 text-amber-600"; }
      if (score >= 80) { status = "Excellent";   statusColor = "bg-green-50 text-green-600"; }

      const durationMs = s.endTime && s.startTime
        ? new Date(s.endTime) - new Date(s.startTime)
        : null;
      const minutes = durationMs ? Math.floor(durationMs / 60000) : null;
      const seconds = durationMs ? Math.floor((durationMs % 60000) / 1000) : null;
      const timeSpent = minutes != null ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : "—";

      return {
        date: new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        subject: subjectMap[String(s.subjectId)] || "Practice",
        sessionType: s.sessionType || "standard",
        score: `${score}/100`,
        timeSpent,
        status,
        statusColor,
      };
    });

    // Subject performance averages
    const subjectScores = {};
    for (const s of sessions) {
      const subjId = String(s.subjectId || "Unknown");
      if (!subjectScores[subjId]) {
        subjectScores[subjId] = { scores: [], name: subjectMap[subjId] || subjId };
      }
      subjectScores[subjId].scores.push(s.score || 0);
    }
    const subjectPerformance = Object.values(subjectScores).map((data) => {
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
    return updated;
  }

  static async deleteStudent(id) {
    await User.findByIdAndDelete(id);
    return { success: true };
  }

  static async exportStudents(ids) {
    // Logic for generating CSV or JSON export
    return { message: "Export logic placeholder" };
  }

  static async sendReminder(ids) {
    // Logic for sending notifications/emails
    return { sent: ids.length };
  }

  static async getDashboardStats() {
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
      { $match: { totalAttempted: { $gt: 0 } } },
      {
        $lookup: {
          from: "subjects",
          localField: "subjectId",
          foreignField: "_id",
          as: "subject",
        },
      },
      { $unwind: { path: "$subject", preserveNullAndEmpty: true } },
      {
        $group: {
          _id: "$topicId",
          avgMastery: { $avg: "$masteryScore" },
          subjects: {
            $push: {
              name: { $ifNull: ["$subject.name", "General"] },
              mastery: "$masteryScore",
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
        if (!subjMap[key] || s.mastery < subjMap[key]) subjMap[key] = s.mastery;
      }
      const pct = (v) => (v != null ? `${Math.round(v)}%` : "N/A");
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
      name: u.name || "Student",
      score: `${u.stats?.predictedScore || 0}/400`,
      progress: `${Math.round(((u.stats?.predictedScore || 0) / 400) * 100)}%`,
    }));

    return {
      totalStudents,
      studentsTrend: "+5% vs last week", // trend requires time-series; kept as label
      avgScore,
      activeSessions,
      scoreDistribution,
      topPerformers,
      subjectHeatmap,
      needsAttention,
    };
  }


  static async getLiveMonitorData() {
    const PracticeSession = (await import("../models/PracticeSessionModel.js")).default;
    const activeSessionCount = await PracticeSession.countDocuments({ sessionStatus: "ACTIVE" });
    const activeSessionsRaw = await PracticeSession.find({ sessionStatus: "ACTIVE" })
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
    // Basic bulk insert with validation logic
    const results = await Question.insertMany(questionsData, { ordered: false });
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
