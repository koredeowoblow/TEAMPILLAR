import { questionRepository } from "../repository/QuestionRepository.js";
import AnalyticsService from "../services/AnalyticsService.js";
import { sendSuccess, sendError } from "../core/response.js";
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
    const { page, limit, search } = req.query;
    const data = await AdminService.listStudents({
      page: Number.parseInt(page) || 1,
      limit: Number.parseInt(limit) || 10,
      search,
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
    return sendSuccess(res, { data: { tutors: [] }, message: "Tutors retrieved" });
  }

  /* ─────────────────── ANALYTICS ─────────────────── */

  static async analyticsReports(req, res) {
    const data = await AdminService.getDashboardStats(); // Using dashboard stats for now as it contains similar data
    return sendSuccess(res, { data, message: "Analytics reports retrieved" });
  }

  static async exportAnalytics(req, res) {
    return sendSuccess(res, { data: { message: "Exporting..." }, message: "Analytics export started" });
  }

  static async scheduleReport(req, res) {
    return sendSuccess(res, { data: { success: true }, message: "Report scheduled" });
  }

  static async dashboardStats(req, res) {
    const data = await AdminService.getDashboardStats();
    return sendSuccess(res, { data, message: "Dashboard stats retrieved" });
  }

  /* ─────────────────── SETTINGS ─────────────────── */

  static async getSettings(req, res) {
    return sendSuccess(res, { data: { settings: {} }, message: "Settings retrieved" });
  }
}

export default AdminController;
