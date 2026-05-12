import AIService from "../services/AIService.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utilis/AppError.js";

class AIController {
  static async explain(req, res) {
    const { questionId, context } = req.body;
    if (!questionId) {
      throw new AppError("questionId is required", 400);
    }
    const explanation = await AIService.generateExplanation(
      questionId,
      context || {},
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
}

export default AIController;
