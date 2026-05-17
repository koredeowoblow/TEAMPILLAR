import User from "../models/UserModel.js";
import Subject from "../models/SubjectModel.js";
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

    return users.map(user => {
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
  }
}

export default AdminService;
