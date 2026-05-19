/**
 * exam.dto.js
 *
 * Controls what Exam data leaves the API.
 * ExamController already does an inline shape — this centralises it.
 */

import { toUserRefDTO } from "./user.dto.js";

/**
 * Standard exam shape for all consumers.
 * Use in: ExamController.create, and any future list/get routes.
 */
export function toExamDTO(exam) {
  if (!exam) return null;
  const e = exam.toObject ? exam.toObject() : exam;

  return {
    id:            String(e._id),
    subject:       String(e.subject),
    classGroup:    e.classGroup,
    examDate:      e.examDate,
    duration:      e.duration,
    questionCount: e.questionCount,
    instructions:  e.instructions ?? null,
    status:        e.status,
    createdAt:     e.createdAt,
    // Embed minimal creator info if populated, otherwise just the ID
    createdBy: e.createdBy?._id
      ? toUserRefDTO(e.createdBy)
      : (e.createdBy ? String(e.createdBy) : null),
  };
}