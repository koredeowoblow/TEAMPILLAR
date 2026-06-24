import AnalyticsService from "../services/AnalyticsService.js";
import { sendSuccess } from "../core/response.js";
import PracticeSession from "../models/PracticeSessionModel.js";
import Question from "../models/QuestionModel.js";
import Subject from "../models/SubjectModel.js";

/**
 * Controller for handling platform-wide and student-specific analytics.
 * All endpoints are enriched with AI-driven strategic insights and pedagogical recommendations.
 */
class AnalyticsController {
  static async summary(req, res) {
    const data = await AnalyticsService.getSummary();
    return sendSuccess(res, {
      message: "Analytics summary",
      data,
      statusCode: 200,
    });
  }

  static async reports(req, res) {
    const { from, to } = req.query || {};
    const data = await AnalyticsService.getReports({ from, to });
    return sendSuccess(res, {
      message: "Analytics reports",
      data,
      statusCode: 200,
    });
  }

  static async studentAnalytics(req, res) {
    const { id } = req.params;
    const targetId = id === "me" ? req.user?.id : id;
    const data = await AnalyticsService.getStudentAnalytics(targetId);
    return sendSuccess(res, {
      message: "Student analytics",
      data,
      statusCode: 200,
    });
  }

  static async _getUserCompletedSessionsData(userId) {
    const sessions = await PracticeSession.find({
      userId,
      sessionStatus: { $in: ["COMPLETED", "ABANDONED"] },
    }).lean();

    const questionIds = [];
    sessions.forEach(session => {
      if (session.responses) {
        session.responses.forEach(r => {
          if (r.questionId) {
            questionIds.push(r.questionId);
          }
        });
      }
    });

    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    const questionMap = new Map(questions.map(q => [String(q._id), q]));

    return { sessions, questionMap };
  }

  static async getOverviewStats(req, res) {
    const userId = req.user?.id;
    const { sessions, questionMap } = await AnalyticsController._getUserCompletedSessionsData(userId);

    const totalPracticeSessions = sessions.length;
    const averageScore = sessions.length > 0
      ? sessions.reduce((acc, s) => acc + (s.score || 0), 0) / sessions.length
      : 0;

    let correctCount = 0;
    let totalResponses = 0;
    let studyTimeMinutes = 0;

    sessions.forEach(session => {
      if (session.startTime && session.endTime) {
        const diffMs = new Date(session.endTime) - new Date(session.startTime);
        studyTimeMinutes += Math.max(0, Math.round(diffMs / 1000 / 60));
      }

      if (session.responses) {
        session.responses.forEach(r => {
          const q = questionMap.get(String(r.questionId));
          if (q) {
            totalResponses++;
            const correctOption = q.options?.find(o => o.isCorrect);
            if (correctOption && String(r.selectedOption) === String(correctOption.id)) {
              correctCount++;
            }
          }
        });
      }
    });

    const overallAccuracy = totalResponses > 0 ? (correctCount / totalResponses) * 100 : 0;
    const totalQuestionsAnswered = totalResponses;

    return sendSuccess(res, {
      message: "Overview stats retrieved successfully",
      data: {
        totalPracticeSessions,
        averageScore: Math.round(averageScore * 100) / 100,
        overallAccuracy: Math.round(overallAccuracy * 100) / 100,
        totalQuestionsAnswered,
        studyTimeMinutes,
      },
      statusCode: 200,
    });
  }

  static async getSubjectPerformance(req, res) {
    const userId = req.user?.id;
    const { sessions, questionMap } = await AnalyticsController._getUserCompletedSessionsData(userId);

    const subjectGroups = {};
    sessions.forEach(s => {
      if (s.subjectId) {
        const subIdStr = String(s.subjectId);
        if (!subjectGroups[subIdStr]) {
          subjectGroups[subIdStr] = [];
        }
        subjectGroups[subIdStr].push(s);
      }
    });

    const subjectIds = Object.keys(subjectGroups);
    const subjects = await Subject.find({ _id: { $in: subjectIds } }).lean();
    const subjectMap = new Map(subjects.map(sub => [String(sub._id), sub]));

    const data = [];
    for (const [subIdStr, subSessions] of Object.entries(subjectGroups)) {
      const subjectDoc = subjectMap.get(subIdStr);
      const subjectName = subjectDoc ? subjectDoc.name : "Unknown Subject";

      const sessionsCount = subSessions.length;
      const averageScore = subSessions.reduce((acc, s) => acc + (s.score || 0), 0) / sessionsCount;

      let correctCount = 0;
      let totalResponses = 0;

      subSessions.forEach(session => {
        if (session.responses) {
          session.responses.forEach(r => {
            const q = questionMap.get(String(r.questionId));
            if (q) {
              totalResponses++;
              const correctOption = q.options?.find(o => o.isCorrect);
              if (correctOption && String(r.selectedOption) === String(correctOption.id)) {
                correctCount++;
              }
            }
          });
        }
      });

      const accuracy = totalResponses > 0 ? (correctCount / totalResponses) * 100 : 0;
      const masteryLevel = `${Math.round(accuracy)}%`;

      data.push({
        subjectId: subIdStr,
        name: subjectName,
        averageScore: Math.round(averageScore * 100) / 100,
        accuracy: Math.round(accuracy * 100) / 100,
        sessionsCount,
        masteryLevel,
      });
    }

    return sendSuccess(res, {
      message: "Subject performance retrieved successfully",
      data,
      statusCode: 200,
    });
  }

  static async getTopicPerformance(req, res) {
    const userId = req.user?.id;
    const { subjectId } = req.query;
    const { sessions, questionMap } = await AnalyticsController._getUserCompletedSessionsData(userId);

    const topicGroups = {};
    sessions.forEach(session => {
      if (session.responses) {
        session.responses.forEach(r => {
          const q = questionMap.get(String(r.questionId));
          if (q) {
            // Apply subjectId filter if provided
            if (subjectId && String(q.subjectId) !== String(subjectId)) {
              return;
            }

            const topicName = q.metadata?.topic || "General";
            const correctOption = q.options?.find(o => o.isCorrect);
            const isCorrect = correctOption && String(r.selectedOption) === String(correctOption.id);

            if (!topicGroups[topicName]) {
              topicGroups[topicName] = {
                correctCount: 0,
                totalQuestions: 0,
                subjectId: q.subjectId,
              };
            }
            topicGroups[topicName].totalQuestions++;
            if (isCorrect) {
              topicGroups[topicName].correctCount++;
            }
          }
        });
      }
    });

    const uniqueSubjectIds = Array.from(new Set(Object.values(topicGroups).map(t => String(t.subjectId)).filter(Boolean)));
    const topicsSubjects = await Subject.find({ _id: { $in: uniqueSubjectIds } }).lean();
    const topicsSubjectMap = new Map(topicsSubjects.map(sub => [String(sub._id), sub]));

    const data = [];
    for (const [topicName, stats] of Object.entries(topicGroups)) {
      const subjectDoc = topicsSubjectMap.get(String(stats.subjectId));
      const subjectName = subjectDoc ? subjectDoc.name : "Unknown Subject";
      const accuracy = stats.totalQuestions > 0 ? (stats.correctCount / stats.totalQuestions) * 100 : 0;

      data.push({
        topic: topicName,
        subjectName,
        correctCount: stats.correctCount,
        totalQuestions: stats.totalQuestions,
        accuracy: Math.round(accuracy * 100) / 100,
      });
    }

    return sendSuccess(res, {
      message: "Topic performance retrieved successfully",
      data,
      statusCode: 200,
    });
  }

  static async getPerformanceTrends(req, res) {
    const userId = req.user?.id;
    const { sessions, questionMap } = await AnalyticsController._getUserCompletedSessionsData(userId);

    const getStartOfWeek = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day; // adjust when day is sunday
      const start = new Date(d.setDate(diff));
      start.setHours(0, 0, 0, 0);
      return start;
    };

    const weeks = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const startOfWeek = getStartOfWeek(d);
      const key = startOfWeek.toISOString().split("T")[0];
      weeks.push({
        key,
        startOfWeek,
        sessions: [],
      });
    }

    sessions.forEach(s => {
      const sessionDate = new Date(s.createdAt || s.startTime);
      const sessionTime = sessionDate.getTime();
      for (const week of weeks) {
        const start = week.startOfWeek.getTime();
        const end = start + 7 * 24 * 60 * 60 * 1000;
        if (sessionTime >= start && sessionTime < end) {
          week.sessions.push(s);
          break;
        }
      }
    });

    const data = weeks.map(week => {
      const sessionsCount = week.sessions.length;
      let totalScore = 0;
      let correctCount = 0;
      let totalResponses = 0;

      week.sessions.forEach(session => {
        totalScore += (session.score || 0);
        if (session.responses) {
          session.responses.forEach(r => {
            const q = questionMap.get(String(r.questionId));
            if (q) {
              totalResponses++;
              const correctOption = q.options?.find(o => o.isCorrect);
              if (correctOption && String(r.selectedOption) === String(correctOption.id)) {
                correctCount++;
              }
            }
          });
        }
      });

      const averageScore = sessionsCount > 0 ? totalScore / sessionsCount : 0;
      const accuracy = totalResponses > 0 ? (correctCount / totalResponses) * 100 : 0;

      return {
        week: week.key,
        averageScore: Math.round(averageScore * 100) / 100,
        accuracy: Math.round(accuracy * 100) / 100,
        sessionsCount,
      };
    });

    return sendSuccess(res, {
      message: "Performance trends retrieved successfully",
      data,
      statusCode: 200,
    });
  }

  static async getSessionTrend(req, res) {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit, 10) || 10;

    const sessions = await PracticeSession.find({
      userId,
      sessionStatus: { $in: ["COMPLETED", "ABANDONED"] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("subjectId", "name")
      .lean();

    const data = sessions.map(s => {
      let subjectName = "Mixed";
      if (s.sessionType !== "smart-mock" && s.subjectId?.name) {
        subjectName = s.subjectId.name;
      }
      return {
        sessionId: s._id,
        date: s.createdAt,
        score: s.score || 0,
        subjectName,
        sessionType: s.sessionType || "standard",
      };
    });

    data.reverse();

    return sendSuccess(res, {
      message: "Session trend retrieved successfully",
      data,
      statusCode: 200,
    });
  }
}

export default AnalyticsController;
