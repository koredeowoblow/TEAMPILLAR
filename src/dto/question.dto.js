/**
 * question.dto.js
 *
 * Controls what Question data leaves the API.
 *
 * CRITICAL security rule for this model:
 * `options[].isCorrect` MUST be stripped from any response sent to a
 * student during an active session. It is only safe to include after
 * the session is submitted (review / result screen).
 */

/**
 * Question shape for active practice/exam sessions.
 * isCorrect is REMOVED — students must not see the answer.
 *
 * Use in: PracticeController.getQuestions, PracticeController.getNextQuestions
 */
export function toQuestionDTO(question) {
  if (!question) return null;
  const q = question.toObject ? question.toObject() : question;

  return {
    id:      String(q._id),
    content: {
      text:     q.content?.text     ?? null,
      image:    q.content?.image    ?? null,
      equation: q.content?.equation ?? null,
    },
    // Strip isCorrect — never expose during active session
    options: (q.options ?? []).map((o) => ({
      id:   o.id,
      key:  o.id, // For compatibility with CBT engine
      text: o.text,
    })),
    metadata: {
      topic:      q.metadata?.topic      ?? null,
      difficulty: q.metadata?.difficulty ?? null,
      year:       q.metadata?.year       ?? null,
    },
    subjectId: String(q.subjectId?._id || q.subjectId?.id || q.subjectId),
  };
  // NEVER include: options[].isCorrect, explanation (during active session)
}

/**
 * Question shape optimized for the CBT Exam engine.
 * Flattened for easy rendering and selection.
 */
export function toCBTQuestionDTO(question, index = 0) {
  if (!question) return null;
  const q = question.toObject ? question.toObject() : question;

  return {
    _id: String(q._id || q.id),
    number: index + 1,
    text: q.text || q.content?.text || "",
    subject: { 
      name: q.subjectName || (q.subjectId?.name) || "Subject" 
    },
    subjectId: String(q.subjectId?._id || q.subjectId?.id || q.subjectId || ""),
    options: (q.options || []).map(o => ({
      key: o.id || o.key,
      text: o.text
    })),
    metadata: q.metadata || {}
  };
}

/**
 * Question shape for post-session review (result screen).
 * isCorrect and explanation are included so the student can learn.
 *
 * Use in: PracticeController.getResult (after session is COMPLETED)
 */
export function toQuestionReviewDTO(question) {
  if (!question) return null;
  const q = question.toObject ? question.toObject() : question;

  return {
    ...toQuestionDTO(question),
    // Safe to reveal after submission
    options: (q.options ?? []).map((o) => ({
      id:        o.id,
      key:       o.id, // For compatibility with CBT engine
      text:      o.text,
      isCorrect: o.isCorrect ?? false,
    })),
    explanation: q.explanation ?? null,
  };
}

/**
 * Admin shape — full question data for management/seeding UIs.
 * Use in: AdminController question routes only.
 */
export function toAdminQuestionDTO(question) {
  if (!question) return null;
  const q = question.toObject ? question.toObject() : question;

  return {
    ...toQuestionReviewDTO(question),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}