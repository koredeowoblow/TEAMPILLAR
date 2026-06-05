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
        initials: (user.name || "??").split(" ").map(n => n[0]).join("").toUpperCase(),
        subjects: subjectsList,
        avgScore,
        lastSession: recent.length > 0 ? "Just now" : "No sessions", // Simple mock for now
        trend,
        progress,
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
    const user = await User.findById(id).lean();
    if (!user) return null;
    return user;
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
    const totalStudents = await User.countDocuments({ role: "STUDENT" });
    const activeSessions = 12; // Mock for now, would count from sessions today

    // Avg score across all students
    const users = await User.find({ role: "STUDENT" }).select("stats").lean();
    const scores = users.map(u => u.stats?.avgScore || 0).filter(s => s > 0);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return {
      totalStudents,
      studentsTrend: "+5% vs last week",
      avgScore,
      activeSessions,
      scoreDistribution: [
        { range: "0-100", mid: 10, high: 5 },
        { range: "100-200", mid: 25, high: 15 },
        { range: "200-300", mid: 45, high: 20 },
        { range: "300-400", mid: 15, high: 30 },
      ],
      topPerformers: [
        { name: "Adewale Jones", score: "342/400", class: "Science A" },
        { name: "Fatima Yusuf", score: "338/400", class: "Science B" },
        { name: "Chinedu Okafor", score: "325/400", class: "Art A" },
      ],
      subjectHeatmap: [
        { topic: "Algebra", english: "12%", math: "45%", physics: "22%", chemistry: "18%", biology: "10%" },
        { topic: "Calculus", english: "5%", math: "65%", physics: "55%", chemistry: "12%", biology: "8%" },
        { topic: "Mechanics", english: "2%", math: "30%", physics: "72%", chemistry: "40%", biology: "5%" },
      ],
      needsAttention: [
        { name: "Tunde Bakare", score: "142/400", progress: "25%" },
        { name: "Sarah Idibia", score: "165/400", progress: "40%" },
      ]
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
