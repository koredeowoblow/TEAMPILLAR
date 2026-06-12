/**
 * practice.dto.js
 *
 * Controls what PracticeSession data leaves the API.
 *
 * Security notes:
 * - security.ipAddress must never be returned to the client
 * - Raw responses array (with questionIds) should only be in results,
 *   not in list/summary endpoints
 */

import { toQuestionReviewDTO } from "./question.dto.js";

/**
 * Summary shape for session lists and dashboard cards.
 * Use in: StudentController.getDashboard session list,
 *         any endpoint returning multiple sessions
 */
export function toPracticeSessionSummaryDTO(session) {
  if (!session) return null;
  const s = session.toObject ? session.toObject() : session;

  // Extract ID string even if populated
  const subjectId = s.subjectId?._id || s.subjectId?.id || s.subjectId;

  return {
    id:            String(s._id),
    subjectId:     subjectId ? String(subjectId) : null,
    sessionStatus: s.sessionStatus,
    score:         s.score ?? 0,
    questionLimit: s.questionLimit ?? 20,
    analytics: {
      accuracy:         s.analytics?.accuracy         ?? 0,
      speedPerQuestion: s.analytics?.speedPerQuestion ?? 0,
      topMistakeTopic:  s.analytics?.topMistakeTopic  ?? null,
    },
    startTime: s.startTime,
    endTime:   s.endTime   ?? null,
    createdAt: s.createdAt,
  };
  // NEVER include: security.ipAddress, security.tabSwitches (internal anti-cheat),
  //                raw responses array (too large for list views)
}

/**
 * Full result shape returned after session submission or on result screen.
 * Includes enriched responses with question review data.
 *
 * Use in: PracticeController.submit, PracticeController.getResult
 */
export function toPracticeSessionResultDTO(session) {
  if (!session) return null;
  const s = session.toObject ? session.toObject() : session;

  // Use session.questions if they were populated/attached, otherwise fallback to empty map
  const questionsMap = new Map(
    (s.questions ?? []).map((q) => [String(q._id ?? q.id), q])
  );

  const enrichedResponses = (s.questions ?? []).map((q) => {
    const qIdStr = String(q._id ?? q.id);
    
    // Find if user answered it
    const r = (s.responses ?? []).find(resp => {
      const respQId = resp.questionId?._id || resp.questionId?.id || resp.questionId;
      return String(respQId) === qIdStr;
    });

    // Cross response + question to compute derived fields
    // Mock tests store selectedOption as option.key OR option.id, practice uses option.id
    const selectedOpt = r ? (
      q?.options?.find(o => o.id === r.selectedOption) ||
      q?.options?.find(o => o.key === r.selectedOption)
    ) : null;
    const correctOpt  = q?.options?.find(o => o.isCorrect);
    const isCorrect   = r ? selectedOpt?.isCorrect === true : false;

    return {
      questionId:     qIdStr,
      selectedOption: r?.selectedOption ?? null,
      timeTaken:      r?.timeTaken      ?? 0,

      // Derived from crossing response + question
      isCorrect,
      userAnswer:    selectedOpt?.text ?? null,
      correctAnswer: correctOpt?.text  ?? null,
      
      // Attach full review question if available
      question: q ? toQuestionReviewDTO(q) : null,
    };
  });

  return {
    ...toPracticeSessionSummaryDTO(session),
    responses: enrichedResponses,
    // Mock test specific fields
    isMockTest:     s.isMockTest     ?? false,
    compositeScore: s.compositeScore ?? null,
    subjectScores:  s.subjectScores  ?? [],
    sessionType:    s.sessionType    ?? 'standard',
    // Expose tab-switch count to the student (they already know they switched)
    // but never expose the stored ipAddress
    tabSwitches: s.security?.tabSwitches ?? 0,
    flagged:     (s.security?.tabSwitches ?? 0) > 3,
  };
}