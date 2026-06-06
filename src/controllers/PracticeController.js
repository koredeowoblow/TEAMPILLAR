import PracticeService from "../services/PracticeService.js";
import AdaptiveEngineService from "../services/AdaptiveEngineService.js";
import { questionRepository } from "../repository/QuestionRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import Subject from "../models/SubjectModel.js";
import mongoose from "mongoose";
import { sendSuccess, sendError } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import { CONSTANTS } from "../config/constants.js";
import {
  toQuestionDTO,
  toPracticeSessionResultDTO,
  toSubjectDTO,
  toPracticeSessionSummaryDTO,
  toCBTQuestionDTO,
} from "../dto/index.js";

// Maximum question count allowed for free-tier users
const FREE_QUESTION_LIMIT = 20;

class PracticeController {
  static async getQuestions(req, res) {
    const { subjectId, limit, difficulty, year, sessionId } = req.query;
    
    // Support multi-subject sessions
    let session = null;
    if (sessionId) {
      session = await practiceRepository.findById(sessionId);
    }

    const questions = await PracticeService.getQuestionsForSubject(subjectId, {
      userId: req.user?.id,
      sessionId,
      isAdmin: req.user?.role === "ADMIN",
      limit: Number(limit) || 20,
      difficulty,
      year: year ? Number(year) : undefined,
    });

    // Strip internal fields and format for the specified CBT shape
    const formattedQuestions = questions.map((q, index) => toCBTQuestionDTO(q, index));

    return sendSuccess(res, {
      message: "Questions retrieved",
      status: "success",
      data: {
        examId: sessionId || "practice",
        duration: formattedQuestions.length * 60, // 1 min per question total
        totalQuestions: formattedQuestions.length,
        questions: formattedQuestions
      },
      statusCode: 200,
    });
  }

  static async getSubjects(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 50, 1);
    const userId = req.user?.id;

    const result = await PracticeService.getSubjects({ page, limit, userId });
    return sendSuccess(res, {
      message: "Subjects retrieved",
      data: { ...result, data: result.data.map(toSubjectDTO) },
      statusCode: 200,
    });
  }

  static async getNextQuestions(req, res) {
    const userId = req.user?.id;
    const { sessionId, subjectId, filters } = req.body;

    if (!userId) throw new AppError("Unauthorized", 401);
    if (!sessionId || !subjectId)
      throw new AppError("sessionId and subjectId are required", 400);

    const midSessionMatch = await AdaptiveEngineService.recalculateMidSession(
      sessionId,
      userId,
      subjectId,
      filters || {},
    );

    const questions = await PracticeService.getQuestionsForSubject(subjectId, {
      userId,
      sessionId,
      limit: 10,
      filters: midSessionMatch,
    });

    return sendSuccess(res, {
      message: "Next questions retrieved",
      data: questions.map(toQuestionDTO),
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
      data: {
        session: toPracticeSessionSummaryDTO(result.session),
        utmeScore: result.utmeScore,
        flagged: result.flagged,
      },
      statusCode: 200,
    });
  }

  /**
   * GET /practice/sessions
   * Returns the current user's completed practice sessions, newest first.
   */
  static async getSessions(req, res) {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 20, 1);
    const skip = (page - 1) * limit;

    const sessions = await practiceRepository.find(
      { userId, sessionStatus: "COMPLETED" },
      { sort: { createdAt: -1 }, skip, limit },
    );

    const total = await practiceRepository.count({ userId, sessionStatus: "COMPLETED" });

    return sendSuccess(res, {
      message: "Sessions retrieved",
      data: {
        sessions: sessions.map(toPracticeSessionSummaryDTO),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
      statusCode: 200,
    });
  }

  static async getResult(req, res) {
    const { id } = req.params;
    const userId = req.user?.id;
    const session = await PracticeService.getSessionResult(id, userId);

    return sendSuccess(res, {
      message: "Session retrieved",
      data: toPracticeSessionResultDTO(session),
      statusCode: 200,
    });
  }

  static async startSession(req, res) {
    const userId = req.user?.id;
    const { subjectId, subjectIds, limit, duration } = req.body;
    if (!userId) throw new AppError("Unauthorized", 401);
    if (!subjectId && (!subjectIds || subjectIds.length === 0)) {
      throw new AppError("subjectId or subjectIds is required", 400);
    }
    // Accept either `limit` or `duration` from the frontend payload
    const questionLimit = Math.min(
      Math.max(Number(limit || duration || 20), 1),
      CONSTANTS.PAGINATION.MAX_LIMIT,
    );

    // Enforce question count restriction for free-tier users
    const isPro = req.user?.isPro === true || 
                 req.user?.subscription === "pro" || 
                 req.user?.subscriptionStatus === "active" || 
                 ["ADMIN", "TUTOR"].includes(req.user?.role);
    
    // Check subject limit for free users
    const requestedSubjects = Array.isArray(subjectIds) && subjectIds.length > 0 ? subjectIds : [subjectId];
    if (!isPro && requestedSubjects.length > 2) {
      throw new AppError(`Subject Limit Reached: Free users can select up to 2 subjects (you selected ${requestedSubjects.length}). Upgrade to Pro for all subjects!`, 403);
    }

    // Check TOTAL question limit for free users
    const totalRequestedQuestions = questionLimit * requestedSubjects.length;
    if (!isPro && totalRequestedQuestions > 40) {
      throw new AppError(
        `Question Limit Reached: Free users are limited to 40 questions total for multi-subject sessions. You requested ${totalRequestedQuestions}. Upgrade to Pro!`,
        403,
      );
    }

    const session = await PracticeService.startSession(userId, subjectId, questionLimit, subjectIds);

    // Fetch questions immediately after session creation so the frontend CBT
    // component can start rendering without a separate round-trip.
    const primarySubjectId = Array.isArray(subjectIds) && subjectIds.length > 0 ? subjectIds[0] : subjectId;
    let questions = [];
    try {
      const rawQuestions = await PracticeService.getQuestionsForSubject(primarySubjectId, {
        userId,
        sessionId: String(session._id),
        limit: questionLimit,
        isAdmin: false,
      });
      questions = rawQuestions.map((q, index) => toCBTQuestionDTO(q, index));
    } catch (qErr) {
      // Non-fatal: frontend will show "No questions" screen with retry option
    }

    return sendSuccess(res, {
      message: "Session started",
      data: {
        sessionId: String(session._id),
        session: toPracticeSessionSummaryDTO(session),
        questions,
      },
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
      data: toSubjectDTO(subj),
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
      data: toSubjectDTO(subj),
      statusCode: 200,
    });
  }

  static async deleteSubject(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new AppError("Invalid subject ID", 400);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const subj = await Subject.findById(id).session(session);
      if (!subj) {
        await session.abortTransaction();
        session.endSession();
        throw new AppError("Subject not found", 404);
      }

      // Cascade delete questions
      await questionRepository.deleteMany({ subjectId: id }, { session });

      // Delete the subject
      await Subject.findByIdAndDelete(id).session(session);

      await session.commitTransaction();
      session.endSession();

      return sendSuccess(res, {
        message: "Subject deleted and associated questions removed",
        data: { id: String(id) },
        statusCode: 200,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

export default PracticeController;
