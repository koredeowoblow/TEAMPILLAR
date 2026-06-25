import PracticeService from "../services/practice/index.js";
import AdaptiveEngineService from "../services/AdaptiveEngineService.js";
import { questionRepository } from "../repository/QuestionRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import Subject from "../models/SubjectModel.js";
import Question from "../models/QuestionModel.js";
import Passage from "../models/PassageModel.js";
import LogService from "../services/LogService.js";
import { resolveSubjectId } from "../utils/subjectResolver.js";
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
  static async getTopicsForSubject(req, res) {
    const { subjectId } = req.query;
    if (!subjectId) {
      throw new AppError("subjectId is required", 400);
    }
    const resolvedSubjectId = await resolveSubjectId(subjectId);
    const topics = await Question.distinct("metadata.topic", {
      subjectId: resolvedSubjectId,
      "metadata.topic": { $exists: true, $ne: "" },
    });
    const sortedTopics = topics.filter(Boolean).sort((a, b) => a.localeCompare(b));
    return sendSuccess(res, {
      message: "Topics retrieved successfully",
      data: sortedTopics,
      statusCode: 200,
    });
  }

  static async getYearsForSubject(req, res) {
    const { subjectId } = req.query;
    if (!subjectId) {
      throw new AppError("subjectId is required", 400);
    }
    const resolvedSubjectId = await resolveSubjectId(subjectId);

    // Fast Redis caching for years
    const cacheKey = `years:subject:${resolvedSubjectId.toString()}`;
    const { getRedisClient } = await import("../config/redis.js");
    const redis = await getRedisClient();

    let sortedYears;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) sortedYears = JSON.parse(cached);
      } catch (err) {
        LogService.logAction({ category: "error", action: "redis_years_cache", description: err.message });
      }
    }

    if (!sortedYears) {
      const years = await Question.distinct("metadata.year", {
        subjectId: resolvedSubjectId,
        "metadata.year": { $exists: true, $ne: null },
      });
      sortedYears = years.filter(Boolean).map(Number).sort((a, b) => b - a);
      if (redis) {
        try {
          await redis.setEx(cacheKey, 86400, JSON.stringify(sortedYears));
        } catch (e) { }
      }
    }

    return sendSuccess(res, {
      message: "Years retrieved successfully",
      data: sortedYears,
      statusCode: 200,
    });
  }

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

    const { calculateExamTime } = await import("../utils/TimeEngine.js");

    return sendSuccess(res, {
      message: "Questions retrieved",
      status: "success",
      data: {
        examId: sessionId || "practice",
        duration: calculateExamTime({ type: 'practice', questions: formattedQuestions }),
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
    const isAdmin = req.user?.role === "ADMIN";

    const result = await PracticeService.getSubjects({ page, limit, userId, isAdmin });
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

    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const existing = await PracticeSessionModel.findById(sessionId).lean();
    if (existing && (existing.isFlagged || existing.cheatingPenalty)) {
      return res.status(403).json({ success: false, message: "Exam session terminated due to a violation." });
    }

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
    const { sessionId, responses, tabSwitches, endTime, ipAddress, sessionFingerprint, sessionNonce } = req.body;
    if (!sessionId || !responses)
      throw new AppError("sessionId and responses are required", 400);

    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const existing = await PracticeSessionModel.findById(sessionId).lean();
    if (existing && (existing.isFlagged || existing.cheatingPenalty)) {
      return res.status(403).json({ success: false, message: "Exam session terminated due to a violation." });
    }

    const result = await PracticeService.submitSession(sessionId, {
      responses,
      tabSwitches,
      endTime,
      ipAddress,
      sessionFingerprint,
      sessionNonce,
    });

    LogService.logAction({
      userId: req.user?.id,
      userRole: req.user?.role,
      category: "practice",
      action: "practice_submitted",
      description: `Practice session ${sessionId} submitted`,
      metadata: { sessionId, score: result.utmeScore, flagged: result.flagged },
      req,
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

    const [sessions, total] = await Promise.all([
      practiceRepository.find(
        { userId, isMockTest: { $ne: true }, sessionStatus: { $in: ["COMPLETED", "ABANDONED"] } },
        {
          sort: { createdAt: -1 },
          skip,
          limit,
          lean: true,
          select: "subjectId sessionStatus score questionLimit analytics startTime endTime createdAt"
        },
      ),
      practiceRepository.count({ userId, isMockTest: { $ne: true }, sessionStatus: { $in: ["COMPLETED", "ABANDONED"] } }),
    ]);

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
    const { subjectId, subjectIds, limit, duration, topic } = req.body;
    if (!userId) throw new AppError("Unauthorized", 401);
    if (!subjectId && (!subjectIds || subjectIds.length === 0)) {
      throw new AppError("subjectId or subjectIds is required", 400);
    }
    // Accept either `limit` or `duration` from the frontend payload
    const questionLimit = Math.min(
      Math.max(Number(limit || duration || 20), 1),
      CONSTANTS.PAGINATION.MAX_LIMIT,
    );



    const session = await PracticeService.startSession(userId, subjectId, questionLimit, subjectIds, topic);

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
        topic: session.topic || undefined,
      });
      questions = rawQuestions.map((q, index) => toCBTQuestionDTO(q, index));
    } catch (qErr) {
      // Non-fatal: frontend will show "No questions" screen with retry option
    }

    LogService.logAction({
      userId,
      userRole: req.user?.role,
      category: "practice",
      action: "practice_started",
      description: "Started practice session",
      metadata: { sessionId: String(session._id), subjectId, questionLimit },
      req,
    });

    return sendSuccess(res, {
      message: "Session started",
      data: {
        sessionId: String(session._id),
        sessionFingerprint: session.sessionFingerprint,
        sessionNonce: session.sessionNonce,
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

  static async flagAndSubmit(req, res) {
    const { sessionId, flagReason } = req.body;
    if (!sessionId) throw new AppError("sessionId is required", 400);

    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const session = await PracticeSessionModel.findById(sessionId);
    
    if (!session) throw new AppError("Session not found", 404);
    if (session.sessionStatus === "COMPLETED" || session.sessionStatus === "SUBMITTED" || session.sessionLedgerStatus === "SUBMITTED") {
       return res.status(403).json({ success: false, message: "This exam session was flagged and has already been submitted. It cannot be resumed or resubmitted." });
    }

    const { default: PracticeGradingService } = await import("../services/practice/PracticeGradingService.js");

    const responses = req.body.responses && req.body.responses.length > 0 
      ? req.body.responses 
      : (session.responses || []);
    const result = await PracticeGradingService.submitSession(sessionId, {
      responses,
      tabSwitches: session.security?.tabSwitches || 0,
      endTime: new Date(),
      ipAddress: req.ip,
      sessionFingerprint: session.sessionFingerprint, // Pass from session document
      sessionNonce: session.sessionNonce, // Pass from session document
      isSweeper: false,
      isFlagged: true,
      flagReason: flagReason || "Cheating detected",
      cheatingPenalty: true
    });

    return sendSuccess(res, {
      message: "Session flagged and submitted",
      data: {
        utmeScore: result.utmeScore,
        flagged: true
      },
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
    if (req.body.isActive !== undefined) subj.isActive = Boolean(req.body.isActive);
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

      // Cascade delete passages
      await Passage.deleteMany({ subjectId: id }).session(session);

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
