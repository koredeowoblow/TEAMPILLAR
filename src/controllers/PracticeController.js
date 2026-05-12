import PracticeService from "../services/PracticeService.js";
import Subject from "../models/SubjectModel.js";
import { sendSuccess, sendError } from "../core/response.js";
import { AppError } from "../utilis/AppError.js";

class PracticeController {
  static async getQuestions(req, res) {
    const { subjectId, limit } = req.query;
    if (!subjectId) throw new AppError("subjectId is required", 400);
    const questions = await PracticeService.getQuestionsForSubject(subjectId, {
      limit: Number(limit) || 20,
    });
    return sendSuccess(res, {
      message: "Questions retrieved",
      data: questions,
      statusCode: 200,
    });
  }

  static async getSubjects(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 50, 1);
    const result = await PracticeService.getSubjects({ page, limit });
    return sendSuccess(res, {
      message: "Subjects retrieved",
      data: result,
      statusCode: 200,
    });
  }

  static async submit(req, res) {
    const { sessionId, responses, tabSwitches, endTime, ipAddress } = req.body;
    if (!sessionId || !responses)
      throw new AppError("sessionId and responses are required", 400);
    const result = await PracticeService.submitSession(sessionId, {
      responses,
      tabSwitches,
      endTime,
      ipAddress,
    });
    return sendSuccess(res, {
      message: "Session graded",
      data: result,
      statusCode: 200,
    });
  }

  static async getResult(req, res) {
    const { id } = req.params;
    const session = await PracticeService.getSessionResult(id);
    return sendSuccess(res, {
      message: "Session retrieved",
      data: session,
      statusCode: 200,
    });
  }

  static async startSession(req, res) {
    const userId = req.user?.id;
    const { subjectId } = req.body;
    if (!userId) throw new AppError("Unauthorized", 401);
    if (!subjectId) throw new AppError("subjectId is required", 400);
    const session = await PracticeService.startSession(userId, subjectId);
    return sendSuccess(res, {
      message: "Session started",
      data: session,
      statusCode: 201,
    });
  }

  static async recordVisibility(req, res) {
    const { sessionId, increment } = req.body;
    if (!sessionId) throw new AppError("sessionId is required", 400);
    const ip = req.ip;
    const result = await PracticeService.recordVisibility(sessionId, {
      increment: Number(increment || 1),
      ipAddress: ip,
    });
    return sendSuccess(res, {
      message: "Visibility recorded",
      data: result,
      statusCode: 200,
    });
  }

  // Admin: create a new subject
  static async createSubject(req, res) {
    const { name, code, description, questionCount } = req.body;
    if (!name || !code) throw new AppError("name and code are required", 400);
    const existing = await Subject.findOne({ $or: [{ name }, { code }] });
    if (existing)
      throw new AppError("Subject with same name or code exists", 409);
    const subj = await Subject.create({
      name,
      code,
      description,
      questionCount: Number(questionCount || 0),
    });
    return sendSuccess(res, {
      message: "Subject created",
      data: {
        id: String(subj._id),
        name: subj.name,
        code: subj.code,
        description: subj.description,
        questionCount: subj.questionCount,
      },
      statusCode: 201,
    });
  }

  static async updateSubject(req, res) {
    const { id } = req.params;
    const { name, code, description, questionCount } = req.body;
    const subj = await Subject.findById(id);
    if (!subj) throw new AppError("Subject not found", 404);
    if (name) subj.name = name;
    if (code) subj.code = code;
    if (description !== undefined) subj.description = description;
    if (questionCount !== undefined) subj.questionCount = Number(questionCount);
    await subj.save();
    return sendSuccess(res, {
      message: "Subject updated",
      data: {
        id: String(subj._id),
        name: subj.name,
        code: subj.code,
        description: subj.description,
        questionCount: subj.questionCount,
      },
      statusCode: 200,
    });
  }

  static async deleteSubject(req, res) {
    const { id } = req.params;
    const subj = await Subject.findById(id);
    if (!subj) throw new AppError("Subject not found", 404);
    await subj.remove();
    return sendSuccess(res, {
      message: "Subject deleted",
      data: { id: String(id) },
      statusCode: 200,
    });
  }
}

export default PracticeController;
