import SmartMockService from "../services/SmartMockService.js";
import PracticeService from "../services/PracticeService.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import { toPracticeSessionSummaryDTO } from "../dto/index.js";
import { CONSTANTS } from "../config/constants.js";
import FreemiumGuard from "../services/FreemiumGuard.js";

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
    const isPro = req.user?.isPro === true;
    if (!isPro && questionLimit > FREE_QUESTION_LIMIT) {
      throw new AppError(
        `Free plan users can practice up to ${FREE_QUESTION_LIMIT} questions per session. Upgrade to Pro to unlock higher volumes.`,
        403,
      );
    }

    // 1. Generate questions using hybrid system
    const questions = await SmartMockService.generateSmartMock(userId, subjectId, questionLimit, subjectIds);

    // 2. Format questions for response (strip correct answers and explanations)
    const formattedQuestions = questions.map(q => ({
      _id: q._id,
      subjectName: q.subjectName,
      content: q.content,
      options: q.options.map(o => ({ id: o.id, text: o.text })),
      metadata: q.metadata
    }));

    // 3. Create an active session
    const session = await practiceRepository.create({
      userId,
      subjectId: subjectId || (subjectIds && subjectIds[0]),
      subjectIds: subjectIds || [subjectId],
      sessionStatus: "ACTIVE",
      sessionType: "smart-mock",
      questionIds: formattedQuestions.map(q => q._id),
      questionLimit: formattedQuestions.length, // Update limit to total count (e.g. 20 * subjects)
      startTime: new Date(),
    });

    return sendSuccess(res, {
      message: "Smart Mock generated successfully",
      data: {
        sessionId: session._id,
        questions: formattedQuestions,
      },
      statusCode: 201,
    });
  }

  /**
   * Submits a smart mock session.
   */
  static async submitSmartMock(req, res) {
    const { sessionId, responses, tabSwitches, endTime, ipAddress } = req.body;
    
    if (!sessionId || !responses) {
      throw new AppError("sessionId and responses are required", 400);
    }

    // Re-use existing submission logic from PracticeService
    const result = await PracticeService.submitSession(sessionId, {
      responses,
      tabSwitches,
      endTime,
      ipAddress,
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
