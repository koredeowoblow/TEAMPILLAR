import AIService from "../services/AIService.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import FreemiumGuard from "../services/FreemiumGuard.js";

class AIController {
  static async explain(req, res) {
    const { questionId, context, selectedOptionId } = req.body;
    if (!questionId) {
      throw new AppError("questionId is required", 400);
    }

    // Freemium Guard: AI Explanation limit
    await FreemiumGuard.checkAIExplanation(req.user);

    const explanation = await AIService.generateExplanation(
      questionId,
      { ...(context || {}), selectedOptionId },
    );
    return sendSuccess(res, {
      message: "Explanation generated",
      data: explanation,
      statusCode: 200,
    });
  }

  static async generateStudyPlan(req, res) {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }
    const { weakTopics } = req.body;
    const studyPlan = await AIService.generateStudyPlan(
      userId,
      weakTopics || [],
    );
    return sendSuccess(res, {
      message: "Study plan generated",
      data: studyPlan,
      statusCode: 200,
    });
  }

  static async generateQuestionInsight(req, res) {
    const { id, failRate, topic, distractor } = req.body;
    const insight = await AIService.generateQuestionInsight({
      id,
      failRate,
      topic,
      distractor,
    });
    return sendSuccess(res, {
      message: "Question insight generated",
      data: insight,
      statusCode: 200,
    });
  }

  static async chat(req, res) {
    const { message, subject, sessionId, history } = req.body;
    const userId = req.user?.id;
    const response = await AIService.generateTutorChatReply({
      userId,
      message,
      subject: subject || "General",
      sessionId,
      history: history || [],
    });
    return sendSuccess(res, {
      message: "Chat reply generated",
      data: response,
      statusCode: 200,
    });
  }

  static async getSessions(req, res) {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }
    const sessions = await AIService.getChatSessions(userId);
    return sendSuccess(res, {
      message: "Chat sessions retrieved",
      data: sessions,
      statusCode: 200,
    });
  }

  static async getSessionMessages(req, res) {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }
    try {
      const data = await AIService.getSessionMessages(sessionId, userId);
      return sendSuccess(res, {
        message: "Chat messages retrieved",
        data,
        statusCode: 200,
      });
    } catch (e) {
      throw new AppError(e.message, 404);
    }
  }
}

export default AIController;
