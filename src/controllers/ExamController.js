import ExamService from "../services/ExamService.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";

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

    return sendSuccess(res, {
      message: "Exam scheduled",
      data: {
        id: String(exam._id),
        subject: String(exam.subject),
        classGroup: exam.classGroup,
        examDate: exam.examDate,
        duration: exam.duration,
        questionCount: exam.questionCount,
        instructions: exam.instructions,
        status: exam.status,
      },
      statusCode: 201,
    });
  }
}

export default ExamController;
