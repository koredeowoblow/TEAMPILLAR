import { practiceRepository } from "../repository/PracticeRepository.js";
import { userRepository } from "../repository/UserRepository.js";
import Question from "../models/QuestionModel.js";
import Subject from "../models/SubjectModel.js";
import cache from "../utils/cache.js";
import AIService from "./AIService.js";
import { CONSTANTS } from "../config/constants.js";
import FocusAreaAnalysisService from "./FocusAreaAnalysisService.js";
import UserAnalytics from "../models/UserAnalyticsModel.js";

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

class AnalyticsService {
  static async getReports({ from, to } = {}) {
    const cacheKey = `analytics:reports:${from || "all"}:${to || "all"}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const match = {};
    if (from || to) match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);

    const sessions = await practiceRepository.find(match, {
      sort: { createdAt: 1 },
      limit: 1000,
      lean: true,
      select: "createdAt score subjectId responses.questionId responses.selectedOption"
    });

    const students = await userRepository.find(
      { role: "STUDENT" },
      { sort: { createdAt: 1 }, limit: 5000, lean: true, select: "createdAt" },
    );

    const subjects = await Subject.find({ isActive: { $ne: false } }).select("_id name").lean();
    const subjectMap = {};
    subjects.forEach((subject) => {
      subjectMap[String(subject._id)] = subject.name;
    });

    const monthlyScores = new Map();
    const subjectScores = new Map();
    const monthlySessionCounts = new Map();
    const monthlyStudentCounts = new Map();

    for (const session of sessions) {
      const createdAt = new Date(session.createdAt);
      const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = monthLabels[createdAt.getMonth()];
      const score = Number(session.score || 0);

      if (!monthlyScores.has(monthKey)) {
        monthlyScores.set(monthKey, { month: monthLabel, scores: [] });
      }
      monthlyScores.get(monthKey).scores.push(score);
      monthlySessionCounts.set(monthKey, (monthlySessionCounts.get(monthKey) || 0) + 1);

      const subjectId = String(session.subjectId?._id || session.subjectId?.id || session.subjectId || "Unknown");
      if (!subjectScores.has(subjectId)) {
        subjectScores.set(subjectId, []);
      }
      subjectScores.get(subjectId).push(score);
    }

    for (const student of students) {
      const createdAt = new Date(student.createdAt || Date.now());
      const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
      monthlyStudentCounts.set(monthKey, (monthlyStudentCounts.get(monthKey) || 0) + 1);
    }

    const performanceTrend = [...monthlyScores.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => {
        const score = Math.round(
          value.scores.reduce((sum, current) => sum + current, 0) /
          value.scores.length,
        );
        return {
          month: value.month,
          score,
          average: score,
        };
      });

    const subjectComparison = [...subjectScores.entries()]
      .map(([subjectId, scores]) => {
        const performance = Math.round(
          scores.reduce((sum, current) => sum + current, 0) / scores.length,
        );
        return {
          subject: subjectMap[subjectId] || subjectId,
          performance,
        };
      })
      .sort((a, b) => b.performance - a.performance)
      .slice(0, 10);

    const reportMonthKeys = [
      ...new Set([
        ...monthlySessionCounts.keys(),
        ...monthlyStudentCounts.keys(),
      ]),
    ].sort((a, b) => a.localeCompare(b));

    const enrollmentTrend = reportMonthKeys.map((monthKey) => {
      const [, monthPart] = monthKey.split("-");
      const month = monthLabels[Math.max(0, Number(monthPart) - 1)] || "Unknown";
      return {
        month,
        students: monthlyStudentCounts.get(monthKey) || 0,
        active: monthlySessionCounts.get(monthKey) || 0,
      };
    });

    const subjectAverages = subjectComparison.map((item) => ({
      subject: item.subject,
      score: item.performance,
      target: Number.parseInt(process.env.SUBJECT_TARGET_SCORE || "75", 10),
    }));

    const questionIds = new Set();
    for (const session of sessions) {
      if (!Array.isArray(session.responses)) continue;
      for (const response of session.responses) {
        if (response?.questionId) {
          questionIds.add(String(response.questionId));
        }
      }
    }

    const questions = questionIds.size
      ? await Question.find({ _id: { $in: [...questionIds] } })
        .select("-explanationDetails -explanation")
        .populate("subjectId", "name")
        .lean()
      : [];
    const questionMap = {};
    questions.forEach((question) => {
      questionMap[String(question._id)] = question;
    });

    const responseStats = new Map();
    for (const questionId of questionIds) {
      responseStats.set(questionId, {
        total: 0,
        wrong: 0,
        wrongOptions: {},
      });
    }

    for (const session of sessions) {
      if (!Array.isArray(session.responses)) continue;
      for (const response of session.responses) {
        const questionId = String(response.questionId);
        const question = questionMap[questionId];
        const stat = responseStats.get(questionId);
        if (!question || !stat) continue;

        stat.total += 1;

        const correctOptionId = question.options?.find(
          (option) => option.isCorrect,
        )?.id;
        const selectedOptionId = response.selectedOption
          ? String(response.selectedOption)
          : null;
        if (!selectedOptionId || selectedOptionId === correctOptionId) continue;

        stat.wrong += 1;
        stat.wrongOptions[selectedOptionId] =
          (stat.wrongOptions[selectedOptionId] || 0) + 1;
      }
    }

    const commonMistakes = [...responseStats.entries()]
      .map(([questionId, stat], index) => {
        const question = questionMap[questionId];
        const wrongChoices = Object.entries(stat.wrongOptions).sort(
          (a, b) => b[1] - a[1],
        );
        const mostCommonWrongOptionId = wrongChoices[0]?.[0] || null;
        const mostCommonWrongOptionText =
          question?.options?.find(
            (option) => option.id === mostCommonWrongOptionId,
          )?.text ||
          (mostCommonWrongOptionId
            ? `Option ${mostCommonWrongOptionId}`
            : "Unknown");

        const failRate = stat.total
          ? Math.round((stat.wrong / stat.total) * 100)
          : 0;

        return {
          id: question?.metadata?.questionCode || `Q-${String(questionId).slice(-6).toUpperCase()}`,
          _id: questionId,
          subject: question?.subjectId?.name || subjectMap[String(question?.subjectId)] || "Unknown",
          failureRate: failRate,
          distractor: mostCommonWrongOptionText,
          topic: question?.metadata?.topic || "General",
          content: question?.content,
          metadata: question?.metadata,
          options: question?.options,
          _sortIndex: index,
        };
      })
      .sort((a, b) => b.failureRate - a.failureRate || a._sortIndex - b._sortIndex)
      .slice(0, 10)
      .map(({ _sortIndex, ...item }) => item);

    const aiInsights = await AIService.generateAnalyticsInsights({
      performanceTrend,
      subjectComparison,
      commonMistakes,
      enrollmentTrend,
    });

    const finalReport = {
      performanceTrend,
      subjectComparison,
      enrollmentTrend,
      subjectAverages,
      commonMistakes,
      aiInsights,
      briefingConfig: {
        active: process.env.BRIEFING_ACTIVE !== "false",
        frequency: process.env.BRIEFING_FREQUENCY || "weekly",
      },
    };

    await cache.set(cacheKey, finalReport, CONSTANTS.CACHE.ANALYTICS_REPORTS_TTL);
    return finalReport;
  }

  static async getSummary() {
    const cacheKey = "analytics:summary";
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const totalStudents = await userRepository.count({ role: "STUDENT" });
    const totalSessions = await practiceRepository.count({});
    const avgScorePipeline = [
      { $group: { _id: null, avgScore: { $avg: "$score" } } },
    ];
    const agg = await practiceRepository.aggregate(avgScorePipeline);
    const avgScore = agg && agg[0] ? Math.round(agg[0].avgScore) : 0;
    const topPerformer = await userRepository.findOne(
      { role: "STUDENT" },
      { sort: { "analytics.overallScore": -1 }, lean: true, select: "name analytics.overallScore" },
    );
    const finalSummary = {
      totalStudents,
      totalSessions,
      engagementRate: totalStudents
        ? Math.round((totalSessions / totalStudents) * 10)
        : 0,
      averageScore: avgScore,
      topPerformer: {
        name: topPerformer?.name || "No data",
        initials:
          topPerformer?.name
            ?.split(" ")
            .map((n) => n[0])
            .join("") || "??",
        avgScore: topPerformer?.analytics?.overallScore || 0,
      },
    };
    // Add AI Insights to Summary
    try {
      const aiInsights = await AIService.generateAnalyticsInsights({
        averageScore: avgScore,
        enrollmentTrend: [{ students: totalStudents }], // Simple wrap for context
        subjectComparison: [], // Summary doesn't have subject breakdown yet
      });
      finalSummary.aiInsights = aiInsights;
    } catch (err) {
      console.warn("AI Summary Insight Error:", err.message);
    }
    await cache.set(cacheKey, finalSummary, CONSTANTS.CACHE.ANALYTICS_SUMMARY_TTL);
    return finalSummary;
  }

  static async getStudentAnalytics(userId) {
    const user = await userRepository.findById(userId, { lean: true, select: "onboarding.targetScore" });
    if (!user) return { error: "User not found" };

    const objectId = new mongoose.Types.ObjectId(userId);

    // 1. Aggregation for overall stats (avg score, max score, total sessions, avg speed)
    const statsAgg = await practiceRepository.aggregate([
      { $match: { userId: objectId } },
      { 
        $group: { 
          _id: null, 
          totalSessions: { $sum: 1 },
          averageScore: { $avg: "$score" },
          overallScore: { $max: "$score" },
          avgSpeed: { 
            $avg: { 
              $cond: [ { $eq: ["$sessionStatus", "COMPLETED"] }, "$analytics.speedPerQuestion", null ] 
            } 
          }
        } 
      }
    ]);

    const stats = statsAgg[0] || { totalSessions: 0, averageScore: 0, overallScore: 0, avgSpeed: 0 };
    const avgScore = Math.round(stats.averageScore || 0);
    const overallScore = Math.round(stats.overallScore || 0);
    const total = stats.totalSessions || 0;
    const averageTimePerQuestion = `${Math.round(stats.avgSpeed || 0)}s`;

    // 2. Score History (limit 100)
    const scoreHistoryDocs = await practiceRepository.find(
      { userId: objectId },
      { sort: { createdAt: -1 }, limit: 100, lean: true, select: "score createdAt" }
    );
    const scoreHistory = scoreHistoryDocs
      .map((s) => ({
        date: new Date(s.createdAt).toISOString().split("T")[0],
        score: s.score || 0,
      }))
      .reverse();

    // 3. Subject Performance
    const subjectAgg = await practiceRepository.aggregate([
      { $match: { userId: objectId, score: { $ne: null } } },
      {
        $group: {
          _id: "$subjectId",
          score: { $avg: "$score" }
        }
      },
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
          name: { $ifNull: ["$subjectDetails.name", "Unknown"] },
          score: { $round: ["$score", 0] }
        }
      }
    ]);
    const subjectPerformance = subjectAgg;

    // 4. Weak Topics
    const weakTopicsAgg = await practiceRepository.aggregate([
      { $match: { userId: objectId, "analytics.topMistakeTopic": { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { topic: "$analytics.topMistakeTopic", subjectId: "$subjectId" },
          frequency: { $sum: 1 }
        }
      },
      { $sort: { frequency: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "subjects",
          localField: "_id.subjectId",
          foreignField: "_id",
          as: "subjectDetails"
        }
      },
      { $unwind: { path: "$subjectDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: "$_id.topic",
          subject: { $ifNull: ["$subjectDetails.name", "Unknown"] },
          frequency: 1
        }
      }
    ]);
    const weakTopicsList = weakTopicsAgg;

    // Try to load pre-calculated background analytics
    const preGenerated = await UserAnalytics.findOne({ userId: objectId }).lean();

    let aiRecommendations;
    let focusAreas;
    let priorityRecommendations;

    if (preGenerated) {
      aiRecommendations = {
        tips: preGenerated.tips,
        generatedAt: preGenerated.updatedAt,
        ai: { used: true, model: "groq", fallback: false }
      };
      focusAreas = preGenerated.focusAreas || [];
      priorityRecommendations = preGenerated.priorityRecommendations || [];
    } else {
      focusAreas = await FocusAreaAnalysisService.getOrCreateFocusAreas(userId);
      priorityRecommendations = FocusAreaAnalysisService.getRecommendations(userId, focusAreas);

      aiRecommendations = await AIService.generateStudentInsights({
        userId,
        averageScore: avgScore,
        targetScore: user.onboarding?.targetScore || 280,
        weakTopics: weakTopicsList,
        priorityRecommendations,
      });
    }

    return {
      targetScore: user.onboarding?.targetScore || 280,
      overallScore,
      averageScore: avgScore,
      scoreHistory,
      subjectPerformance,
      weakTopics: weakTopicsList,
      totalSessions: total,
      averageTimePerQuestion,
      aiRecommendations,
      focusAreas,
      priorityRecommendations,
    };
  }
}

export default AnalyticsService;
