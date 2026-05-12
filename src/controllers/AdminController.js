import AuthService from "../services/AuthService.js";
import { questionRepository } from "../repository/QuestionRepository.js";
import AnalyticsService from "../services/AnalyticsService.js";
import { sendSuccess } from "../core/response.js";
import { userRepository } from "../repository/UserRepository.js";
import PracticeSession from "../models/PracticeSessionModel.js";
import Subject from "../models/SubjectModel.js";
import ClassModel from "../models/ClassModel.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class AdminController {
  static async listStudents(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 50, 1);
    const skip = (page - 1) * limit;
    const search = req.query.search || req.query.q;

    const filter = { role: "STUDENT" };
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ name: regex }, { email: regex }];
    }

    const students = await userRepository.find(filter, {
      skip,
      limit,
      sort: { createdAt: -1 },
    });

    const studentIds = students.map((student) => String(student._id));
    const sessions = studentIds.length
      ? await PracticeSession.find({ userId: { $in: studentIds } })
          .sort({ createdAt: -1 })
          .lean()
      : [];

    const subjectIds = [
      ...new Set(
        sessions
          .map((session) => (session.subjectId ? String(session.subjectId) : null))
          .filter(Boolean),
      ),
    ];

    const subjects = subjectIds.length
      ? await Subject.find({ _id: { $in: subjectIds } }).lean()
      : [];
    const subjectMap = {};
    subjects.forEach((subject) => {
      subjectMap[String(subject._id)] = subject.name;
    });

    const sessionsByUser = {};
    sessions.forEach((session) => {
      const userId = String(session.userId);
      if (!sessionsByUser[userId]) sessionsByUser[userId] = [];
      sessionsByUser[userId].push(session);
    });

    const data = students.map((student) => {
      const userId = String(student._id);
      const userSessions = sessionsByUser[userId] || [];
      const scoreList = userSessions.map((session) => Number(session.score || 0));

      const avgPercent = scoreList.length
        ? Math.round(scoreList.reduce((sum, score) => sum + score, 0) / scoreList.length)
        : 0;
      const avgScore = clamp(avgPercent * 4, 0, 400);

      const recent = scoreList.slice(0, 3);
      const previous = scoreList.slice(3, 6);
      const recentAvg = recent.length
        ? recent.reduce((sum, score) => sum + score, 0) / recent.length
        : avgPercent;
      const previousAvg = previous.length
        ? previous.reduce((sum, score) => sum + score, 0) / previous.length
        : avgPercent;
      const trend = recentAvg >= previousAvg ? "up" : "down";

      const derivedSubjects = [
        ...new Set(
          userSessions
            .map((session) => subjectMap[String(session.subjectId)] || null)
            .filter(Boolean),
        ),
      ];

      const subjectsList = Array.isArray(student.onboarding?.subjects) && student.onboarding.subjects.length
        ? student.onboarding.subjects
        : derivedSubjects;

      const progressRaw = Number(student.stats?.progress || student.onboarding?.progress || 0);
      const progress = progressRaw > 0
        ? clamp(Math.round(progressRaw), 0, 100)
        : clamp(Math.round((userSessions.length / 20) * 100), 0, 100);

      return {
        id: userId,
        name: student.name || "",
        subjects: subjectsList,
        avgScore,
        trend,
        progress,
      };
    });

    return sendSuccess(res, {
      message: "Students retrieved",
      data,
      statusCode: 200,
    });
  }

  static async getStudent(req, res) {
    const { id } = req.params;
    const user = await AuthService.getUserById(id);
    const profile = {
      name: user.name || "",
      email: user.email || "",
      targetScore: user.onboarding?.targetScore || 280,
      subjects: user.onboarding?.subjects || [],
      emailVerified: user.emailVerified || false,
      role: user.role || "STUDENT",
    };
    return sendSuccess(res, {
      message: "Student retrieved",
      data: profile,
      statusCode: 200,
    });
  }

  static async uploadQuestions(req, res) {
    const questions = req.body.questions || req.body;
    if (!Array.isArray(questions)) {
      return sendSuccess(res, {
        message: "Provide an array of questions",
        data: null,
        statusCode: 400,
      });
    }
    const created = [];
    for (const q of questions) {
      const saved = await questionRepository.create(q);
      created.push(saved);
    }
    return sendSuccess(res, {
      message: "Questions uploaded",
      data: { created: created.length },
      statusCode: 201,
    });
  }

  static async getTutors(_req, res) {
    const tutors = await userRepository.find({ role: "TUTOR" }, { sort: { createdAt: -1 } });
    const tutorIds = tutors.map((tutor) => String(tutor._id));

    const classDocs = tutorIds.length
      ? await ClassModel.find({ teacherId: { $in: tutorIds } }).lean()
      : [];

    const classesByTutor = {};
    classDocs.forEach((classDoc) => {
      const tutorId = classDoc.teacherId ? String(classDoc.teacherId) : null;
      if (!tutorId) return;
      if (!classesByTutor[tutorId]) classesByTutor[tutorId] = [];
      classesByTutor[tutorId].push(classDoc);
    });

    const data = tutors.map((tutor) => {
      const tutorId = String(tutor._id);
      const tutorClasses = classesByTutor[tutorId] || [];

      let studentCount = 0;
      const subjectsSet = new Set();

      tutorClasses.forEach((classDoc) => {
        const meta = classDoc.metadata || {};
        if (Array.isArray(meta.studentIds)) {
          studentCount += meta.studentIds.length;
        } else {
          studentCount += Number(meta.studentCount || 0);
        }

        if (Array.isArray(meta.subjects)) {
          meta.subjects.forEach((subject) => subjectsSet.add(subject));
        }
      });

      if (Array.isArray(tutor.onboarding?.subjects)) {
        tutor.onboarding.subjects.forEach((subject) => subjectsSet.add(subject));
      }

      const subjects = [...subjectsSet];
      const primary = subjects[0] || "General";
      const title = tutor.onboarding?.title || `Senior ${primary} Tutor`;

      return {
        id: tutorId,
        name: tutor.name || "",
        title,
        studentCount,
        subjects,
      };
    });

    return sendSuccess(res, {
      message: "Tutors retrieved",
      data,
      statusCode: 200,
    });
  }

  static async analyticsReports(req, res) {
    const { from, to } = req.query;
    const results = await AnalyticsService.getReports({ from, to });
    return sendSuccess(res, {
      message: "Reports generated",
      data: results,
      statusCode: 200,
    });
  }

  static async dashboardStats(_req, res) {
    const summary = await AnalyticsService.getSummary();
    return sendSuccess(res, {
      message: "Dashboard stats",
      data: {
        totalStudents: summary.totalStudents || 0,
        engagementRate: summary.engagementRate || 0,
        topPerformer: {
          name: summary.topPerformer?.name || "No data",
          avgScore: summary.topPerformer?.avgScore || 0,
        },
      },
      statusCode: 200,
    });
  }

  static async getSettings(_req, res) {
    const settings = {
      environment: process.env.NODE_ENV || "development",
      port: process.env.PORT || 3000,
      allowedOrigins: process.env.ALLOWED_ORIGINS || "",
    };
    return sendSuccess(res, {
      message: "Application settings",
      data: settings,
      statusCode: 200,
    });
  }
}

export default AdminController;
