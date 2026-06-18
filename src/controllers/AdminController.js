import { questionRepository } from "../repository/QuestionRepository.js";
import AnalyticsService from "../services/AnalyticsService.js";
import AuthService from "../services/AuthService.js";
import { sendSuccess, sendError } from "../core/response.js";
import { userRepository } from "../repository/UserRepository.js";
import Subject from "../models/SubjectModel.js";
import ClassModel from "../models/ClassModel.js";
import User from "../models/UserModel.js";
import PracticeSession from "../models/PracticeSessionModel.js";
import PlatformSettings from "../models/PlatformSettingsModel.js";
import AdminService from "../services/AdminService.js";
import { sanitizeQuestion } from "../utils/sanitizers.js";
import mongoose from "mongoose";
import AchievementService from "../services/AchievementService.js";
import { toAdminUserDTO, toAdminQuestionDTO, toAdminClassDTO, toAchievementDTO, toLeaderboardDTO, toPracticeSessionResultDTO } from "../dto/index.js";
import LogService from "../services/LogService.js";
import PracticeService from "../services/practice/index.js";

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
    const { page, limit, search, classArm, subjectFilter, scoreRange } = req.query;
    const data = await AdminService.listStudents({
      page: Number.parseInt(page) || 1,
      limit: Number.parseInt(limit) || 10,
      search,
      classArm,
      subjectFilter,
      scoreRange,
    });
    return sendSuccess(res, { data, message: "Students retrieved" });
  }

  static async getStudent(req, res) {
    const { id } = req.params;
    const data = await AdminService.getStudent(id);
    return sendSuccess(res, { data, message: "Student details retrieved" });
  }

  static async updateStudent(req, res) {
    const { id } = req.params;
    const data = await AdminService.updateStudent(id, req.body);
    return sendSuccess(res, { data, message: "Student updated" });
  }

  static async getStudentPracticeSetup(req, res) {
    const { studentId } = req.params;
    const data = await AdminService.getStudentPracticeSetup(studentId);
    return sendSuccess(res, { data, message: "Student practice setup retrieved" });
  }

  static async getStudentSessionResult(req, res) {
    const { studentId, sessionId } = req.params;
    const session = await PracticeService.getSessionResult(sessionId, studentId);
    return sendSuccess(res, {
      message: "Session result retrieved",
      data: toPracticeSessionResultDTO(session),
      statusCode: 200,
    });
  }

  static async getStudentAISessions(req, res) {
    const { studentId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const data = await AdminService.getStudentAISessions(studentId, page, limit);
    return sendSuccess(res, { data, message: "AI sessions retrieved" });
  }

  static async getStudentAISessionMessages(req, res) {
    const { studentId, sessionId } = req.params;
    const data = await AdminService.getStudentAISessionMessages(sessionId);
    return sendSuccess(res, { data, message: "AI session messages retrieved" });
  }

  static async deleteStudent(req, res) {
    const { id } = req.params;
    const data = await AdminService.deleteStudent(id);
    return sendSuccess(res, { data, message: "Student deleted" });
  }

  static async exportStudents(req, res) {
    const { ids } = req.body;
    const data = await AdminService.exportStudents(ids);
    return sendSuccess(res, { data, message: "Students exported" });
  }

  static async sendReminder(req, res) {
    const { ids } = req.body;
    const data = await AdminService.sendReminder(ids);
    return sendSuccess(res, { data, message: "Reminders sent" });
  }

  /* ─────────────────── USER MANAGEMENT (migrated from AuthRoute) ─────────────────── */

  static async getAllUsers(req, res) {
    const parsedPage = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const parsedLimit = Math.max(Number.parseInt(req.query.limit, 10) || 50, 1);
    const rawSearch =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search
        : typeof req.query.q === "string"
          ? req.query.q
          : "";
    const search = rawSearch.replace(/\s+/g, " ").trim().slice(0, 100);
    const users = await AuthService.getAllUsers({
      page: parsedPage,
      limit: parsedLimit,
      search: search || undefined,
    });
    return sendSuccess(res, {
      message: "Users retrieved successfully",
      data: {
        ...users,
        items: users.data.map(toAdminUserDTO),
      },
      statusCode: 200,
    });
  }

  static async getUserById(req, res) {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, { message: "User ID is required", statusCode: 400 });
    }
    const user = await AuthService.getUserById(userId);
    if (!user) {
      return sendError(res, { message: "Resource not found", statusCode: 404 });
    }
    return sendSuccess(res, {
      message: "User retrieved successfully",
      data: toAdminUserDTO(user),
      statusCode: 200,
    });
  }

  static async toggleAdminStatus(req, res) {
    const { userId } = req.params;
    const result = await AuthService.toggleAdminStatus(userId);

    LogService.logAction({
      userId: req.user?.id,
      userRole: req.user?.role,
      category: "admin_action",
      action: "toggle_admin_status",
      description: `Toggled admin status for user ${userId}`,
      metadata: { targetUserId: userId, newStatus: result.isAdmin },
      req,
    });

    return sendSuccess(res, {
      message: "Admin status toggled successfully",
      data: toAdminUserDTO(result),
      statusCode: 200,
    });
  }

  static async adminUpdateUser(req, res) {
    const { userId } = req.params;
    const allowedUpdates = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      isActive: req.body.isActive,
    };
    Object.keys(allowedUpdates).forEach(
      (key) => allowedUpdates[key] === undefined && delete allowedUpdates[key],
    );
    const result = await AuthService.updateUserByAdmin(userId, allowedUpdates);

    LogService.logAction({
      userId: req.user?.id,
      userRole: req.user?.role,
      category: "admin_action",
      action: "update_user",
      description: `Updated user profile for ${userId}`,
      metadata: { targetUserId: userId, updates: allowedUpdates },
      req,
    });

    return sendSuccess(res, {
      message: "User updated successfully (Admin)",
      data: toAdminUserDTO(result),
      statusCode: 200,
    });
  }

  static async adminTriggerOTP(req, res) {
    const { userId } = req.params;
    await AuthService.adminTriggerPasswordReset(userId);
    return sendSuccess(res, {
      message: "OTP sent to user's email",
      data: null,
      statusCode: 200,
    });
  }

  static async createAdmin(req, res) {
    const admin = await AuthService.createAdmin(req.body);
    return sendSuccess(res, {
      message: "Admin created successfully",
      data: toAdminUserDTO(admin),
      statusCode: 201,
    });
  }

  static async createStudent(req, res) {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return sendError(res, { message: "name, email and password are required", statusCode: 400 });
    }
    // Register through AuthService with role forced to STUDENT
    const result = await AuthService.register({
      fullName: name,
      email,
      password,
      phone: phone || "",
      role: "STUDENT",
    });
    // Mark email as verified since an admin is creating the account
    if (result.user?._id) {
      await User.findByIdAndUpdate(result.user._id, { isEmailVerified: true });
    }
    return sendSuccess(res, {
      message: "Student account created successfully",
      data: toAdminUserDTO(result.user),
      statusCode: 201,
    });
  }

  static async deleteUserProfile(req, res) {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, { message: "User ID is required", statusCode: 400 });
    }
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, { message: "User not found", statusCode: 404 });
    }
    await User.findByIdAndDelete(userId);
    return sendSuccess(res, {
      message: "User profile deleted successfully",
      data: null,
      statusCode: 200,
    });
  }

  /* ─────────────────── QUESTIONS ─────────────────── */

  static async listQuestions(req, res) {
    const { page, limit, subjectId, topic, difficulty } = req.query;
    const data = await AdminService.listQuestions({
      page: Number.parseInt(page) || 1,
      limit: Number.parseInt(limit) || 10,
      subjectId,
      topic,
      difficulty,
    });
    return sendSuccess(res, { data, message: "Questions retrieved" });
  }

  static async getQuestion(req, res) {
    const { id } = req.params;
    const data = await AdminService.getQuestion(id);
    return sendSuccess(res, { data, message: "Question retrieved" });
  }

  static async questionStats(req, res) {
    const data = await AdminService.getQuestionStats();
    return sendSuccess(res, { data, message: "Question stats retrieved" });
  }

  static async uploadQuestions(req, res) {
    const data = await AdminService.uploadQuestions(req.body.questions);
    return sendSuccess(res, { data, message: "Questions uploaded" });
  }

  static async updateQuestion(req, res) {
    const data = await AdminService.updateQuestion(req.params.id, req.body);
    return sendSuccess(res, { data, message: "Question updated" });
  }

  static async deleteQuestion(req, res) {
    const data = await AdminService.deleteQuestion(req.params.id);
    return sendSuccess(res, { data, message: "Question deleted" });
  }

  /* ─────────────────── TUTORS ─────────────────── */

  static async getTutors(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 20, 1);
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";

    const filter = { role: "TUTOR" };
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: regex }, { email: regex }];
    }

    const [tutors, total] = await Promise.all([
      User.find(filter)
        .select("name email role createdAt onboarding selectedSubjects")
        .populate("selectedSubjects", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const data = tutors.map((t) => ({
      id: String(t._id),
      name: t.name || "",
      email: t.email || "",
      role: t.role,
      initials: (t.name || "??").split(" ").map((n) => n[0]).join("").toUpperCase(),
      subjects: (t.selectedSubjects || []).map((s) =>
        typeof s === "object" ? s.name : s,
      ),
      createdAt: t.createdAt,
    }));

    return sendSuccess(res, {
      data: { tutors: data, total, page, totalPages: Math.ceil(total / limit) },
      message: "Tutors retrieved",
    });
  }

  /* ─────────────────── ANALYTICS ─────────────────── */

  static async analyticsReports(req, res) {
    const { from, to } = req.query || {};
    const data = await AnalyticsService.getReports({ from, to });
    return sendSuccess(res, { data, message: "Analytics reports retrieved" });
  }

  static async dashboardStats(req, res) {
    const data = await AdminService.getDashboardStats();
    return sendSuccess(res, { data, message: "Dashboard stats retrieved" });
  }

  /* ─────────────────── SETTINGS ─────────────────── */

  static async getSettings(req, res) {
    let settings = await PlatformSettings.findOne().lean();
    if (!settings) {
      // Seed defaults on first access
      settings = await PlatformSettings.create({});
      settings = settings.toObject();
    }
    return sendSuccess(res, { data: settings, message: "Settings retrieved" });
  }

  static async updateSettings(req, res) {
    const allowedFields = [
      "lowPerformanceAlerts",
      "weeklyReports",
      "twoFactorEnabled",
      "institutionName",
      "institutionAddress",
      "maintenanceMode",
      "maintenanceBanner",
      "lastAnnouncementText",
    ];
    const update = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }
    const settings = await PlatformSettings.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true },
    ).lean();

    LogService.logAction({
      userId: req.user?.id,
      userRole: req.user?.role,
      category: "system",
      action: "update_settings",
      description: "Platform settings updated",
      metadata: { updates: update },
      req,
    });

    return sendSuccess(res, { data: settings, message: "Settings updated" });
  }

  static async liveMonitorData(req, res) {
    const data = await AdminService.getLiveMonitorData();
    return sendSuccess(res, { data, message: "Live monitor data retrieved" });
  }

  static async getStudentAchievements(req, res) {
    const { id } = req.params;
    const { tab } = req.query;
    const data = await AchievementService.getAchievementsData(id, tab);

    let mappedData;
    if (tab === "leaderboard") {
      mappedData = data.map(toLeaderboardDTO);
    } else if (tab === "milestones" || tab === "history") {
      mappedData = data.map(toAchievementDTO);
    } else {
      mappedData = {
        milestones: (data.milestones || []).map(toAchievementDTO),
        leaderboard: (data.leaderboard || []).map(toLeaderboardDTO),
        history: (data.history || []).map(toAchievementDTO),
      };
    }

    return sendSuccess(res, { data: mappedData, message: "Student achievements retrieved" });
  }
}

export default AdminController;
