import { sendSuccess } from "../core/response.js";
import StudentService from "../services/StudentService.js";

class StudentController {
  static async updateOnboarding(req, res) {
    const data = await StudentService.updateOnboarding(req.user, req.body, req.tokenHash);
    return sendSuccess(res, {
      message: "Onboarding saved",
      data,
      statusCode: 200,
    });
  }

  static async updateSelectedSubjects(req, res) {
    const data = await StudentService.updateSelectedSubjects(req.user, req.body.subjects, req.tokenHash);
    return sendSuccess(res, {
      message: "Subjects updated successfully",
      data,
      statusCode: 200,
    });
  }

  static async getDashboard(req, res) {
    const dashboard = await StudentService.getDashboard(req.user);
    return sendSuccess(res, {
      message: "Dashboard retrieved",
      data: dashboard,
      statusCode: 200,
    });
  }
}

export default StudentController;
