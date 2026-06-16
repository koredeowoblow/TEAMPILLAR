import { practiceRepository } from "../../repository/PracticeRepository.js";
import { userRepository } from "../../repository/UserRepository.js";
import { resolveSubjectId } from "../../utils/subjectResolver.js";
import { AppError } from "../../utils/AppError.js";
import { CONSTANTS } from "../../config/constants.js";
import PracticeGradingService from "./PracticeGradingService.js";

class PracticeSessionManager {
  static async startSession(userId, subjectId, questionLimit = 20, subjectIds = [], topic = null) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const ids = Array.isArray(subjectIds) && subjectIds.length > 0 ? subjectIds : [subjectId];
    const resolvedSubjectIds = await Promise.all(ids.map(id => resolveSubjectId(id)));

    const session = await practiceRepository.create({
      userId,
      subjectId: resolvedSubjectIds[0],
      subjectIds: resolvedSubjectIds,
      sessionStatus: "ACTIVE",
      startTime: new Date(),
      questionLimit: Math.max(1, Number(questionLimit) || 20),
      topic: topic || null,
    });
    return session;
  }

  static async recordVisibility(
    sessionId,
    { increment = 1, ipAddress = null } = {},
  ) {
    const session = await practiceRepository.findById(sessionId);
    if (!session) throw new AppError("Session not found", 404);
    const current = (session.security && session.security.tabSwitches) || 0;
    const newCount = current + Number(increment || 1);

    const updated = await practiceRepository.update(sessionId, {
      security: {
        ...(session.security || {}),
        tabSwitches: newCount,
        ipAddress,
      },
    });

    if (
      newCount >= CONSTANTS.EXAM.MAX_TAB_SWITCHES &&
      updated.sessionStatus === "ACTIVE"
    ) {
      const responses = updated.responses || [];
      const result = await PracticeGradingService.submitSession(sessionId, {
        responses,
        tabSwitches: newCount,
        endTime: new Date(),
        ipAddress,
      });
      return { autoSubmitted: true, result };
    }

    return { autoSubmitted: false, session: updated };
  }

  static async getSessionResult(sessionId, userId) {
    const PracticeSessionModel = (await import("../../models/PracticeSessionModel.js")).default;

    const session = await PracticeSessionModel.findById(sessionId)
      .populate("subjectId")
      .lean();

    if (!session) throw new AppError("Not found", 404);

    if (userId && String(session.userId) !== String(userId)) {
      throw new AppError("Access denied: You do not own this session.", 403);
    }

    const result = { ...session };

    let rawQuestionIds = [];
    if (Array.isArray(session.questionIds) && session.questionIds.length > 0) {
      rawQuestionIds = session.questionIds.map(id => String(id));
    } else if (Array.isArray(session.responses) && session.responses.length > 0) {
      rawQuestionIds = session.responses
        .map(r => String(r.questionId?._id || r.questionId?.id || r.questionId))
        .filter(Boolean);
    }

    if (rawQuestionIds.length > 0) {
      const mongoose = (await import("mongoose")).default;
      const validIds = rawQuestionIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

      result.questions = validIds.length > 0
        ? await (await import("../../models/QuestionModel.js")).default
            .find({ _id: { $in: validIds } })
            .lean()
        : [];
    } else {
      result.questions = [];
    }

    return result;
  }
}

export default PracticeSessionManager;
