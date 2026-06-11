import { practiceRepository } from "../repository/PracticeRepository.js";
import { userRepository } from "../repository/UserRepository.js";
import Question from "../models/QuestionModel.js";
import Subject from "../models/SubjectModel.js";
import cache from "../utils/cache.js";
import AIService from "./AIService.js";
import { CONSTANTS } from "../config/constants.js";
import FocusAreaAnalysisService from "./FocusAreaAnalysisService.js";

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

    const subjects = await Subject.find({}).lean();
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
    const sessions = await practiceRepository.find(
      { userId },
      {
        sort: { createdAt: -1 },
        limit: 100,
        lean: true,
        select: "score createdAt subjectId analytics.topMistakeTopic sessionStatus analytics.speedPerQuestion"
      },
    );
    const total = sessions.length;
    const avgScore = total
      ? Math.round(sessions.reduce((s, x) => s + (x.score || 0), 0) / total)
      : 0;
    const overallScore = total
      ? Math.max(...sessions.map((s) => s.score || 0))
      : 0;

    const subjects = await Subject.find({}).lean();
    const subjectMap = {};
    subjects.forEach((subj) => {
      subjectMap[subj._id.toString()] = subj.name;
    });

    const scoreHistory = sessions
      .map((s) => ({
        date: new Date(s.createdAt).toISOString().split("T")[0],
        score: s.score || 0,
      }))
      .reverse();

    const subjectScores = {};
    for (const s of sessions) {
      const subjId = String(s.subjectId || "Unknown");
      if (!subjectScores[subjId]) {
        subjectScores[subjId] = {
          scores: [],
          count: 0,
          name: subjectMap[subjId] || subjId,
        };
      }
      subjectScores[subjId].scores.push(s.score || 0);
      subjectScores[subjId].count += 1;
    }
    const subjectPerformance = Object.entries(subjectScores).map(([, data]) => {
      const avgSubj = data.scores.length
        ? Math.round(
          data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        )
        : 0;
      return { name: data.name, score: avgSubj };
    });

    const topicCounts = {};
    const topicSubjectMap = {};
    for (const s of sessions) {
      const topMistake = s.analytics?.topMistakeTopic;
      if (topMistake) {
        topicCounts[topMistake] = (topicCounts[topMistake] || 0) + 1;
        const subjId = String(s.subjectId || "Unknown");
        topicSubjectMap[topMistake] = subjectMap[subjId] || subjId;
      }
    }
    const weakTopicsList = Object.keys(topicCounts)
      .sort((a, b) => topicCounts[b] - topicCounts[a])
      .slice(0, 5)
      .map((topic) => ({
        name: topic,
        subject: topicSubjectMap[topic],
        frequency: topicCounts[topic],
      }));

    const completedSessions = sessions.filter((s) => s.sessionStatus === "COMPLETED" && s.analytics?.speedPerQuestion);
    const avgSpeedVal = completedSessions.length
      ? Math.round(completedSessions.reduce((sum, s) => sum + (s.analytics.speedPerQuestion || 0), 0) / completedSessions.length)
      : 0;
    const averageTimePerQuestion = `${avgSpeedVal}s`;

    const aiRecommendations = await AIService.generateStudentInsights({
      userId,
      averageScore: avgScore,
      targetScore: user.onboarding?.targetScore || 280,
      weakTopics: weakTopicsList,
    });

    const focusAreas = await FocusAreaAnalysisService.getOrCreateFocusAreas(userId);
    const priorityRecommendations = FocusAreaAnalysisService.getRecommendations(userId, focusAreas);

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
