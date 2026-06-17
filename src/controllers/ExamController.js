import ExamService from "../services/ExamService.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import { toExamDTO } from "../dto/index.js";
import LogService from "../services/LogService.js";

class ExamController {
  static async create(req, res) {
    const {
      subject,
      classGroup,
      examDate,
      duration,
      questionCount,
      instructions,
    } = req.body;
    if (!subject || !classGroup || !examDate || !duration || !questionCount)
      throw new AppError("Missing required fields", 400);

    const createdBy = req.user?.id || null;
    const exam = await ExamService.createExam({
      subject,
      classGroup,
      examDate,
      duration,
      questionCount,
      instructions,
      createdBy,
    });

    LogService.logAction({
      userId: req.user?.id,
      userRole: req.user?.role,
      category: "exam",
      action: "exam_scheduled",
      description: `Exam scheduled for subject ${subject}`,
      metadata: { examId: exam._id, subject, classGroup },
      req,
    });

    return sendSuccess(res, {
      message: "Exam scheduled",
      data: toExamDTO(exam),
      statusCode: 201,
    });
  }
}

export default ExamController;
