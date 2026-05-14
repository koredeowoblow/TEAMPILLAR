import AnalyticsService from "../services/AnalyticsService.js";
import { sendSuccess } from "../core/response.js";

/**
 * Controller for handling platform-wide and student-specific analytics.
 * All endpoints are enriched with AI-driven strategic insights and pedagogical recommendations.
 */
class AnalyticsController {
  static async summary(req, res) {
    const data = await AnalyticsService.getSummary();
    return sendSuccess(res, {
      message: "Analytics summary",
      data,
      statusCode: 200,
    });
  }

  static async reports(req, res) {
    const { from, to } = req.query || {};
    const data = await AnalyticsService.getReports({ from, to });
    return sendSuccess(res, {
      message: "Analytics reports",
      data,
      statusCode: 200,
    });
  }

  static async studentAnalytics(req, res) {
    const { id } = req.params;
    const targetId = id === "me" ? req.user?.id : id;
    const data = await AnalyticsService.getStudentAnalytics(targetId);
    return sendSuccess(res, {
      message: "Student analytics",
      data,
      statusCode: 200,
    });
  }
}

export default AnalyticsController;
