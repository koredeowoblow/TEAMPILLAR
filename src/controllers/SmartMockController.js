import SmartMockService from "../services/SmartMockService.js";
import PracticeService from "../services/practice/index.js";
import { resolveUserTier } from "../middleware/entitlement.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import { toPracticeSessionSummaryDTO, toCBTQuestionDTO } from "../dto/index.js";
import { CONSTANTS } from "../config/constants.js";
import FreemiumGuard from "../services/FreemiumGuard.js";
import { calculateExamTime } from "../utils/TimeEngine.js";

// Maximum question count allowed for free-tier users
const FREE_QUESTION_LIMIT = 20;

class SmartMockController {
  /**
   * Generates a smart mock session and returns the questions.
   */
  static async generateSmartMock(req, res) {
    const userId = req.user?.id;
    const { subjectId, subjectIds, limit, duration } = req.body;

    if (!userId) throw new AppError("Unauthorized", 401);
    if (!subjectId && (!subjectIds || subjectIds.length === 0)) {
      throw new AppError("subjectId or subjectIds is required", 400);
    }

    // Freemium Guard: Lifetime Mock Test limit
    await FreemiumGuard.checkMockTest(req.user);

    const questionLimit = Math.min(
      Math.max(Number(limit || duration || 20), 1),
      CONSTANTS.PAGINATION.MAX_LIMIT,
    );

    // Enforce question count restriction for free-tier users
    const isPro = resolveUserTier(req.user) === "pro";

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

    // 1. Generate questions using hybrid system
    const questions = await SmartMockService.generateSmartMock(userId, subjectId, questionLimit, subjectIds);

    // 2. Format questions for response (strip correct answers and explanations)
    const formattedQuestions = questions.map((q, index) => toCBTQuestionDTO(q, index));

    // 3. Create an active session
    const session = await practiceRepository.create({
      userId,
      subjectId: subjectId || (subjectIds && subjectIds[0]),
      subjectIds: subjectIds || [subjectId],
      sessionStatus: "ACTIVE",
      sessionType: "smart-mock",
      questionIds: formattedQuestions.map(q => q._id),
      questionOrder: formattedQuestions.map(q => q._id),
      questionLimit: formattedQuestions.length,
      startTime: new Date(),
      totalDuration: calculateExamTime({ type: 'smart-mock', questions: formattedQuestions }),
    });

    // 4. Increment mock test counter ONLY after successful creation
    await FreemiumGuard.incrementMockTest(req.user);

    return sendSuccess(res, {
      message: "Smart Mock generated successfully",
      data: {
        sessionId: String(session._id),
        sessionFingerprint: session.sessionFingerprint,
        sessionNonce: session.sessionNonce,
        questions: formattedQuestions,
        session: toPracticeSessionSummaryDTO(session)
      },
      statusCode: 201,
    });
  }

  /**
   * Submits a smart mock session.
   */
  static async submitSmartMock(req, res) {
    const { sessionId, responses, tabSwitches, endTime, ipAddress, sessionFingerprint, sessionNonce } = req.body;

    if (!sessionId || !responses) {
      throw new AppError("sessionId and responses are required", 400);
    }

    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const existing = await PracticeSessionModel.findById(sessionId).lean();
    if (existing && (existing.isFlagged || existing.cheatingPenalty)) {
      return res.status(403).json({ success: false, message: "Exam session terminated due to a violation." });
    }

    // Re-use existing submission logic from PracticeService
    const result = await PracticeService.submitSession(sessionId, {
      responses,
      tabSwitches,
      endTime,
      ipAddress,
      sessionFingerprint,
      sessionNonce,
    });

    return sendSuccess(res, {
      message: "Smart Mock graded successfully",
      data: {
        session: toPracticeSessionSummaryDTO(result.session),
        utmeScore: result.utmeScore,
        flagged: result.flagged,
      },
      statusCode: 200,
    });
  }
}

export default SmartMockController;
