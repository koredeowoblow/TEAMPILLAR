import { questionRepository } from "../repository/QuestionRepository.js";
import AnalyticsService from "../services/AnalyticsService.js";
import { sendSuccess } from "../core/response.js";
import { userRepository } from "../repository/UserRepository.js";
import Subject from "../models/SubjectModel.js";
import ClassModel from "../models/ClassModel.js";
import AdminService from "../services/AdminService.js";
import { sanitizeQuestion } from "../utils/sanitizers.js";
import mongoose from "mongoose";
import { toAdminUserDTO, toAdminQuestionDTO, toAdminClassDTO } from "../dto/index.js";

/* ── Inline CSV serialiser (zero external deps) ── */
function toCSV(rows, headers) {
  const sanitizeCSV = (val) => {
    let str = String(val ?? "");
    if (/^[=+\-@]/.test(str)) {
      str = "'" + str;
    }
    return str;
  };

  const esc = (v) => {
    const s = sanitizeCSV(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const header = headers.map((h) => esc(h.label)).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h.key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

class AdminController {
  /* ─────────────────── STUDENTS ─────────────────── */

  static async listStudents(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const search = req.query.search || req.query.q;
    const data = await AdminService.listStudents({ page, limit, search });
    return sendSuccess(res, { message: "Students retrieved", data: { ...data, items: data.items?.map(toAdminUserDTO) }, statusCode: 200 });
  }

  static async getStudent(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return sendSuccess(res, { message: "Invalid student ID", data: null, statusCode: 400 });

    const user = await userRepository.findById(id);
    if (!user || user.role !== "STUDENT")
      return sendSuccess(res, { message: "Student not found", data: null, statusCode: 404 });

    return sendSuccess(res, {
      message: "Student retrieved",
      data: toAdminUserDTO(user),
      statusCode: 200,
    });
  }

  static async updateStudent(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return sendSuccess(res, { message: "Invalid student ID", data: null, statusCode: 400 });

    // Whitelist — admins cannot touch password or role via this endpoint
    const ALLOWED = ["name", "onboarding", "emailVerified", "status"];
    const updateData = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }

    const updated = await userRepository.updateUser(id, updateData);
    if (!updated || updated.role !== "STUDENT")
      return sendSuccess(res, { message: "Student not found", data: null, statusCode: 404 });

    return sendSuccess(res, {
      message: "Student updated",
      data: { id: String(updated._id), name: updated.name, email: updated.email },
      statusCode: 200,
    });
  }

  static async deleteStudent(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return sendSuccess(res, { message: "Invalid student ID", data: null, statusCode: 400 });

    const user = await userRepository.findById(id);
    if (!user || user.role !== "STUDENT")
      return sendSuccess(res, { message: "Student not found", data: null, statusCode: 404 });

    await userRepository.deleteUser(id);
    return sendSuccess(res, { message: "Student deleted", data: { id }, statusCode: 200 });
  }

  static async exportStudents(req, res) {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const filter = { role: "STUDENT" };

    if (ids.length > 0) {
      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length > 0) filter._id = { $in: validIds };
    }

    const students = await userRepository.find(filter, { limit: 5000, sort: { createdAt: -1 } });

    const headers = [
      { key: "name", label: "Full Name" },
      { key: "email", label: "Email" },
      { key: "targetScore", label: "Target Score" },
      { key: "subjects", label: "Subjects" },
      { key: "emailVerified", label: "Email Verified" },
      { key: "createdAt", label: "Joined" },
    ];

    const rows = students.map((s) => ({
      name: s.name || "",
      email: s.email || "",
      targetScore: s.onboarding?.targetScore || "",
      subjects: (s.onboarding?.subjects || []).join("; "),
      emailVerified: s.emailVerified ? "Yes" : "No",
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString().split("T")[0] : "",
    }));

    const csv = toCSV(rows, headers);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="pillar-students-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    return res.status(200).send(csv);
  }

  static async sendReminder(req, res) {
    const { studentIds, message } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0)
      return sendSuccess(res, { message: "Provide at least one student ID", data: null, statusCode: 400 });

    const validIds = studentIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0)
      return sendSuccess(res, { message: "No valid student IDs", data: null, statusCode: 400 });

    const reminderNote = {
      sentAt: new Date(),
      message: message || "Keep up your UTME preparation on Pillar!",
      sentBy: req.user?.id,
    };

    // Fire-and-forget batch update — record reminder on each user doc
    await Promise.all(
      validIds.map((id) =>
        userRepository.updateUser(id, {
          $push: { "notifications.reminders": reminderNote },
        }),
      ),
    );

    return sendSuccess(res, { message: "Reminders sent", data: { sent: validIds.length }, statusCode: 200 });
  }

  /* ─────────────────── QUESTIONS ─────────────────── */

  static async uploadQuestions(req, res) {
    const rawQuestions = req.body.questions || req.body;
    const questions = Array.isArray(rawQuestions) ? rawQuestions : [rawQuestions];

    const sanitized = questions.map((q) => {
      const sq = sanitizeQuestion(q);
      // Map correctAnswer string (A,B,C,D) to isCorrect flag in options array
      if (q.correctAnswer && Array.isArray(sq.options)) {
        sq.options = sq.options.map((opt) => ({
          ...opt,
          isCorrect: String(opt.id).toUpperCase() === String(q.correctAnswer).toUpperCase(),
        }));
      }
      return sq;
    });

    const created = await questionRepository.insertMany(sanitized);
    return sendSuccess(res, { message: "Questions uploaded", data: { created: created.length }, statusCode: 201 });
  }

  static async updateQuestion(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return sendSuccess(res, { message: "Invalid question ID", data: null, statusCode: 400 });

    const sanitized = sanitizeQuestion(req.body);
    // Map correctAnswer string (A,B,C,D) to isCorrect flag in options array
    if (req.body.correctAnswer && Array.isArray(sanitized.options)) {
      sanitized.options = sanitized.options.map((opt) => ({
        ...opt,
        isCorrect: String(opt.id).toUpperCase() === String(req.body.correctAnswer).toUpperCase(),
      }));
    }
    const updated = await questionRepository.findByIdAndUpdate(id, sanitized, { new: true });
    if (!updated)
      return sendSuccess(res, { message: "Question not found", data: null, statusCode: 404 });

    return sendSuccess(res, { message: "Question updated", data: toAdminQuestionDTO(updated), statusCode: 200 });
  }

  static async deleteQuestion(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return sendSuccess(res, { message: "Invalid question ID", data: null, statusCode: 400 });

    const deleted = await questionRepository.findByIdAndDelete(id);
    if (!deleted)
      return sendSuccess(res, { message: "Question not found", data: null, statusCode: 404 });

    return sendSuccess(res, { message: "Question deleted", data: { id }, statusCode: 200 });
  }

  static async listQuestions(req, res) {
    const { page = 1, limit = 50, search, subjectId, difficulty, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) {
      filter.$or = [
        { "content.text": { $regex: search, $options: "i" } },
        { "metadata.questionCode": { $regex: search, $options: "i" } }
      ];
    }
    if (subjectId) filter.subjectId = subjectId;
    if (difficulty) filter["metadata.difficulty"] = difficulty.toLowerCase();
    if (status) filter["metadata.status"] = status;

    const questions = await questionRepository.find(filter, { skip, limit, sort: { createdAt: -1 } });
    
    // Transform to match frontend Question interface
    const data = questions.map(q => ({
      id: String(q._id),
      code: q.metadata?.questionCode || `Q-${String(q._id).slice(-6).toUpperCase()}`,
      subject: q.metadata?.subjectName || "Unknown",
      topic: q.metadata?.topic || "General",
      snippet: q.content?.text?.slice(0, 100) + (q.content?.text?.length > 100 ? "..." : ""),
      difficulty: q.metadata?.difficulty ? q.metadata.difficulty.charAt(0).toUpperCase() + q.metadata.difficulty.slice(1) : "Medium",
      status: q.metadata?.status || "Live"
    }));

    return sendSuccess(res, { message: "Questions retrieved", data, statusCode: 200 });
  }

  static async questionStats(req, res) {
    const total = await questionRepository.count({});
    const newToday = await questionRepository.count({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    
    // Mock values for now for specific statuses if they don't exist in model
    const pendingAI = await questionRepository.count({ "metadata.status": "Pending AI Review" });
    const flaggedErrors = await questionRepository.count({ "metadata.status": "Flagged" });

    return sendSuccess(res, {
      message: "Question stats",
      data: {
        total,
        newToday,
        growth: 12, // Mock growth
        pendingAI,
        flaggedErrors
      },
      statusCode: 200
    });
  }

  /* ─────────────────── TUTORS ─────────────────── */

  static async getTutors(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 50, 1);
    const skip = (page - 1) * limit;

    const tutors = await userRepository.find({ role: "TUTOR" }, { skip, limit, sort: { createdAt: -1 } });
    const tutorIds = tutors.map((t) => String(t._id));

    const classDocs = tutorIds.length
      ? await ClassModel.find({ teacherId: { $in: tutorIds } }).lean()
      : [];

    const classesByTutor = {};
    classDocs.forEach((c) => {
      const tid = c.teacherId ? String(c.teacherId) : null;
      if (!tid) return;
      if (!classesByTutor[tid]) classesByTutor[tid] = [];
      classesByTutor[tid].push(c);
    });

    const data = tutors.map((tutor) => {
      const tid = String(tutor._id);
      const tutorClasses = classesByTutor[tid] || [];
      let studentCount = 0;
      const subjectsSet = new Set();

      tutorClasses.forEach((c) => {
        const meta = c.metadata || {};
        studentCount += Array.isArray(meta.studentIds) ? meta.studentIds.length : Number(meta.studentCount || 0);
        if (Array.isArray(meta.subjects)) meta.subjects.forEach((s) => subjectsSet.add(s));
      });

      if (Array.isArray(tutor.onboarding?.subjects))
        tutor.onboarding.subjects.forEach((s) => subjectsSet.add(s));

      const subjects = [...subjectsSet];
      const primary = subjects[0] || "General";
      return { id: tid, name: tutor.name || "", title: tutor.onboarding?.title || `Senior ${primary} Tutor`, studentCount, subjects };
    });

    return sendSuccess(res, { message: "Tutors retrieved", data, statusCode: 200 });
  }

  /* ─────────────────── ANALYTICS ─────────────────── */

  static async analyticsReports(req, res) {
    const { from, to } = req.query;
    const results = await AnalyticsService.getReports({ from, to });
    return sendSuccess(res, { message: "Reports generated", data: results, statusCode: 200 });
  }

  static async exportAnalytics(req, res) {
    const { from, to } = req.query;
    const results = await AnalyticsService.getReports({ from, to });
    
    const rows = results.commonMistakes || [];
    const headers = [
      { label: "Question ID", key: "id" },
      { label: "Subject", key: "subject" },
      { label: "Topic", key: "topic" },
      { label: "Top Distractor", key: "distractor" },
      { label: "Fail Rate (%)", key: "failRate" }
    ];

    const csvStr = toCSV(rows, headers);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="analytics_${new Date().toISOString().split("T")[0]}.csv"`);
    return res.status(200).send(csvStr);
  }

  static async scheduleReport(req, res) {
    const { email, frequency } = req.body;
    if (!email || !frequency) {
      return sendSuccess(res, { message: "Email and frequency are required", data: null, statusCode: 400 });
    }
    console.log(`[STUB] Scheduled ${frequency} report for ${email}`);
    return sendSuccess(res, { message: "Report schedule saved", data: { email, frequency }, statusCode: 200 });
  }

  static async dashboardStats(_req, res) {
    const summary = await AnalyticsService.getSummary();
    return sendSuccess(res, {
      message: "Dashboard stats",
      data: {
        totalStudents: summary.totalStudents ?? 0,
        engagementRate: summary.engagementRate ?? 0,
        studentGrowth: summary.studentGrowth ?? null,
        topPerformer: summary.topPerformer
          ? {
              id: summary.topPerformer.id ?? null,
              name: summary.topPerformer.name ?? null,
              avgScore: summary.topPerformer.avgScore ?? 0,
              initials: summary.topPerformer.initials ?? "??",
            }
          : null,
      },
      statusCode: 200,
    });
  }

  /* ─────────────────── SETTINGS ─────────────────── */

  static async getSettings(_req, res) {
    return sendSuccess(res, {
      message: "Application settings",
      data: {
        maintenanceMode: process.env.MAINTENANCE_MODE === "true",
        signupsEnabled: process.env.SIGNUPS_ENABLED !== "false",
        examDate: process.env.UTME_DATE || null,
        maxQuestionsPerSession: Number(process.env.MAX_QUESTIONS_PER_SESSION || 60),
        supportEmail: process.env.SUPPORT_EMAIL || null,
      },
      statusCode: 200,
    });
  }
}

export default AdminController;
