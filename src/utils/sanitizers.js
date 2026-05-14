export const sanitizeQuestion = (q) => {
  if (!q || typeof q !== "object") return {};
  return {
    subject: q.subject,
    topic: q.topic,
    difficulty: q.difficulty,
    questionText: q.questionText,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    year: q.year,
  };
};
