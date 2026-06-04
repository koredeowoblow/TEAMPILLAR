import PlannerService from "../services/PlannerService.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";

class PlannerController {
  static async getSchedule(req, res) {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const schedule = await PlannerService.getSchedule(userId);
    return sendSuccess(res, {
      message: schedule ? "Schedule retrieved" : "No schedule found",
      data: schedule || null,
      statusCode: 200,
    });
  }

  static async generate(req, res) {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const { targetScore, hoursPerDay, examDate, prioritySubjects, studyPreference } = req.body;

    if (!targetScore || !hoursPerDay || !examDate) {
      throw new AppError("targetScore, hoursPerDay, and examDate are required", 400);
    }

    const schedule = await PlannerService.generateSchedule({
      userId,
      targetScore: Number(targetScore),
      hoursPerDay: Number(hoursPerDay),
      examDate,
      prioritySubjects: Array.isArray(prioritySubjects) ? prioritySubjects : ["English", "Mathematics", "Physics", "Chemistry"],
      studyPreference: studyPreference || "no preference",
    });

    return sendSuccess(res, {
      message: "Schedule generated successfully",
      data: schedule,
      statusCode: 201,
    });
  }

  static async rescheduleDay(req, res) {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const { date } = req.body;
    if (!date) throw new AppError("date is required (YYYY-MM-DD)", 400);

    const schedule = await PlannerService.rescheduleDay({ userId, date });
    if (!schedule) throw new AppError("No schedule found for this student", 404);

    return sendSuccess(res, {
      message: "Day rescheduled",
      data: schedule,
      statusCode: 200,
    });
  }

  static async markComplete(req, res) {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const { id: sessionId } = req.params;
    if (!sessionId) throw new AppError("sessionId is required", 400);

    const schedule = await PlannerService.markSessionComplete({ userId, sessionId });
    if (!schedule) throw new AppError("No schedule found for this student", 404);

    return sendSuccess(res, {
      message: "Session updated",
      data: schedule,
      statusCode: 200,
    });
  }
}

export default PlannerController;
