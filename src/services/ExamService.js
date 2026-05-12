import Exam from "../models/ExamModel.js";
import Subject from "../models/SubjectModel.js";
import { AppError } from "../utilis/AppError.js";

class ExamService {
  static async createExam({
    subject,
    classGroup,
    examDate,
    duration,
    questionCount,
    instructions,
    createdBy,
  }) {
    // Basic validation
    const subj = await Subject.findById(subject);
    if (!subj) throw new AppError("Subject not found", 404);

    const exam = await Exam.create({
      subject,
      classGroup,
      examDate: new Date(examDate),
      duration: Number(duration),
      questionCount: Number(questionCount),
      instructions: instructions || "",
      createdBy: createdBy || null,
    });

    return exam;
  }
}

export default ExamService;
