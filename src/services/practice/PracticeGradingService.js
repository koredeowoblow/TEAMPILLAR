import { practiceRepository } from "../../repository/PracticeRepository.js";
import { questionRepository } from "../../repository/QuestionRepository.js";
import { userRepository } from "../../repository/UserRepository.js";
import Subject from "../../models/SubjectModel.js";
import TopicPerformance from "../../models/TopicPerformanceModel.js";
import { CONSTANTS } from "../../config/constants.js";
import AdaptiveEngineService from "../AdaptiveEngineService.js";
import { AppError } from "../../utils/AppError.js";
import cache from "../../utils/cache.js";

/**
 * Computes a blended predicted JAMB score from two signals:
 * - mockTestAverage: average score across all completed mock tests (out of 400)
 * - practiceProjection: mastery-based projection from practice sessions (out of 400)
 * - mockTestCount: number of completed mock tests the student has taken
 *
 * Weighting: mock tests 60%, practice projection 40%
 * Clamp: result is always between 0 and 400
 */
const computeBlendedPrediction = (mockTestAverage, practiceProjection, mockTestCount) => {

  // No mock test data and no practice data — return null (UI shows placeholder)
  if (mockTestCount === 0 && (!practiceProjection || practiceProjection === 0)) {
    return null;
  }

  // Only mock test data available — no practice projection yet
  if (!practiceProjection || practiceProjection === 0) {
    return Math.round(Math.min(400, Math.max(0, mockTestAverage)));
  }

  // Only practice data available — no mock tests taken yet
  if (mockTestCount === 0 || !mockTestAverage) {
    return Math.round(Math.min(400, Math.max(0, practiceProjection)));
  }

  // Both signals available — full blend
  const blended = (mockTestAverage * 0.6) + (practiceProjection * 0.4);
  return Math.round(Math.min(400, Math.max(0, blended)));
};

class PracticeGradingService {
  static computeUTMEScoreFromMap(subjectScores = {}) {
    const entries = Object.keys(subjectScores).map((k) => ({
      name: k,
      score: Math.max(0, Math.min(100, Number(subjectScores[k] || 0))),
    }));

    if (entries.length === 0) return 0;

    const englishIdx = entries.findIndex(
      (e) => e.name.toLowerCase() === "english",
    );

    let selected = [];
    if (englishIdx >= 0) {
      const english = entries[englishIdx];
      const others = entries
        .filter((e, i) => i !== englishIdx)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      selected = [english, ...others];
    } else {
      selected = entries.sort((a, b) => b.score - a.score).slice(0, 4);
    }

    const total = selected.reduce((s, e) => s + e.score, 0);
    
    // Adaptive scoring: if less than 4 subjects, extrapolate to 400 based on average
    if (selected.length > 0 && selected.length < 4) {
      const averageScore = total / selected.length;
      return Math.round(Math.min(400, averageScore * 4));
    }
    
    return Math.round(Math.min(400, total));
  }

  static async submitSession(sessionId, submission) {
    const { responses } = submission;
    const { default: PracticeSessionModel } = await import("../../models/PracticeSessionModel.js");

    // REDIS LOCK: Prevent race-condition simultaneous submissions
    const lockKey = `session:lock:${sessionId}`;
    let acquiredLock = true;
    try {
      const { isRedisAvailable, getRedisClient } = await import("../../config/redis.js");
      if (isRedisAvailable()) {
        const redis = await getRedisClient();
        const res = await redis.set(lockKey, "1", { NX: true, EX: 10 });
        acquiredLock = !!res;
      } else {
        // Fallback to in-memory check (works for single instance)
        if (await cache.get(lockKey)) {
          acquiredLock = false;
        } else {
          await cache.set(lockKey, "1", 10);
        }
      }
    } catch (err) {
      console.warn("Failed to acquire redis lock, falling back to ledger lock", err);
    }

    if (!acquiredLock) {
      throw new AppError("SESSION_REPLAY_DETECTED: A submission is already in progress.", 429);
    }

    // ATOMIC LEDGER LOCK: Prevents multiple concurrent submissions of the same session
    const session = await PracticeSessionModel.findOneAndUpdate(
      { _id: sessionId, sessionLedgerStatus: "ACTIVE" },
      { $set: { sessionLedgerStatus: "SUBMITTED" } },
      { new: false } // return old document to grade
    ).lean();

    if (!session) {
      // It's either missing or already submitted
      const existing = await PracticeSessionModel.findById(sessionId).lean();
      if (existing && existing.sessionLedgerStatus === "SUBMITTED") {
        console.warn(`[PracticeGradingService] Idempotent replay handled for session ${sessionId}`);

        const questionsWithReview = await questionRepository.find({
          _id: { $in: existing.questionIds || [] },
        }, { lean: true });
        const sessionWithQuestions = { ...existing };
        sessionWithQuestions.questions = questionsWithReview;

        let subjectName = "";
        if (existing.subjectId) {
          const { default: Subject } = await import("../../models/SubjectModel.js");
          const subject = await Subject.findById(existing.subjectId).select("name").lean();
          subjectName = subject?.name || "";
        }

        const utmeScore = PracticeGradingService.computeUTMEScoreFromMap(
          subjectName ? { [subjectName]: existing.score || 0 } : {}
        );

        return {
          session: sessionWithQuestions,
          utmeScore,
          flagged: existing.security?.flagged || false,
        };
      }
      throw new AppError("INVALID_SESSION_STATE: Session not active or does not exist.", 400);
    }

    if (session.sessionStatus === "COMPLETED") {
      const questionsWithReview = await questionRepository.find({
        _id: { $in: session.questionIds || [] },
      }, { lean: true });
      const sessionWithQuestions = { ...session };
      sessionWithQuestions.questions = questionsWithReview;
      const subject = await Subject.findById(session.subjectId).select("name").lean();
      const subjectName = subject?.name || "";
      const utmeScore = PracticeGradingService.computeUTMEScoreFromMap({
        [subjectName]: session.score || 0,
      });
      return {
        session: sessionWithQuestions,
        utmeScore,
        flagged: session.security?.flagged || false,
      };
    }

    if (!submission.isSweeper) {
      const { validateSessionFingerprint } = await import("../../utils/SessionCrypto.js");
      if (!submission.sessionFingerprint || !submission.sessionNonce) {
        // Revert ledger if invalid
        await PracticeSessionModel.updateOne({ _id: sessionId }, { $set: { sessionLedgerStatus: "REJECTED" } });
        throw new AppError("SESSION_TAMPER_DETECTED: Cryptographic fingerprint or nonce is missing.", 403);
      }

      // 1. Verify frontend tokens match DB tokens (Anti-Replay / Cloning)
      if (submission.sessionFingerprint !== session.sessionFingerprint || submission.sessionNonce !== session.sessionNonce) {
        await PracticeSessionModel.updateOne({ _id: sessionId }, { $set: { sessionLedgerStatus: "REJECTED" } });
        throw new AppError("SESSION_TAMPER_DETECTED: Fingerprint or Nonce mismatch.", 403);
      }

      // 2. Verify DB snapshot hasn't drifted from cryptographic seal
      if (!validateSessionFingerprint(session, session.sessionFingerprint)) {
        await PracticeSessionModel.updateOne({ _id: sessionId }, { $set: { sessionLedgerStatus: "REJECTED" } });
        throw new AppError("SESSION_TAMPER_DETECTED: Session snapshot has been corrupted or illegally mutated.", 403);
      }
    }

    let finalResponses = submission.responses;
    if (!finalResponses || finalResponses.length === 0) {
      if (session.responses && session.responses.length > 0) {
        finalResponses = session.responses;
      } else {
        finalResponses = [];
      }
    }

    if (session.questionIds && session.questionIds.length > 0) {
      const validIds = new Set(session.questionIds.map(String));
      const invalidResponse = finalResponses.find(
        (r) => !validIds.has(String(r.questionId || r._id)),
      );
      if (invalidResponse)
        throw new AppError("Invalid question in submission", 400);
    }

    const questions = await questionRepository.find({
      _id: { $in: finalResponses.map((r) => r.questionId || r._id) },
    }, {
      lean: true,
      select: "_id options.id options.isCorrect metadata.topic"
    });
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    let correct = 0;
    let totalTime = 0;
    const topics = {};

    for (const r of finalResponses) {
      const q = qMap.get(String(r.questionId || r._id));
      if (!q) continue;
      const opt = q.options.find((o) => (o.id || o.key || String(o._id)) === r.selectedOption);
      if (opt && opt.isCorrect) correct += 1;
      totalTime += Number(r.timeTaken || 0);
      const topic = q.metadata?.topic || "unknown";
      topics[topic] = (topics[topic] || 0) + (opt && opt.isCorrect ? 1 : 0);
    }

    // Fix: Use total questions in the session, not just the ones answered, to avoid inflating score
    const totalQuestions = (session.questionIds && session.questionIds.length > 0)
      ? session.questionIds.length
      : (questions.length || submission.responses.length || 1);

    const accuracy = (correct / totalQuestions) * 100;

    const flagged =
      (submission.tabSwitches || 0) > CONSTANTS.EXAM.MAX_TAB_SWITCHES;

    const reportedDuration = submission.endTime
      ? new Date(submission.endTime) - new Date(session.startTime)
      : null;
    const drift = reportedDuration
      ? Math.abs(reportedDuration / 1000 - totalTime)
      : 0;
    const timeDriftFlag = drift > 10;

    const analytics = {
      accuracy: Math.round(accuracy),
      speedPerQuestion:
        totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0,
      topMistakeTopic:
        Object.keys(topics).sort((a, b) => topics[a] - topics[b])[0] || null,
    };

    let utmeScore = 0;
    if (session.isMockTest) {
      utmeScore = Math.round(accuracy * 4); // Full mock total score is 400
    } else {
      let subjectName = "";
      if (session.subjectId) {
        const subject = await Subject.findById(session.subjectId).select("name").lean();
        subjectName = subject?.name || "";
      }
      const sessionSubjectScores = { [subjectName]: Math.round(accuracy) };
      utmeScore = PracticeGradingService.computeUTMEScoreFromMap(sessionSubjectScores);
    }

    const finalScore = session.isMockTest ? utmeScore : Math.round(accuracy);

    const updated = await practiceRepository.update(sessionId, {
      responses: finalResponses,
      sessionStatus: submission.isSweeper ? "ABANDONED" : "COMPLETED",
      endTime: submission.endTime ? new Date(submission.endTime) : new Date(),
      analytics,
      security: {
        tabSwitches: submission.tabSwitches || 0,
        ipAddress: submission.ipAddress || null,
        flagged: flagged || timeDriftFlag,
      },
      score: finalScore,
      compositeScore: utmeScore,
      isFlagged: submission.isFlagged || flagged || timeDriftFlag,
      flagReason: submission.flagReason || (flagged ? "Excessive tab switches" : (timeDriftFlag ? "Time drift detected" : null)),
      cheatingPenalty: submission.cheatingPenalty || false,
      submittedAt: submission.isFlagged || submission.cheatingPenalty ? new Date() : null,
    });

    const questionsWithReview = await questionRepository.find({
      _id: { $in: updated.questionIds }
    }, { lean: true });
    const sessionWithQuestions = updated.toObject();
    sessionWithQuestions.questions = questionsWithReview;

    if (!submission.cheatingPenalty) {
      await AdaptiveEngineService.updateTopicPerformance(
        session.userId,
        submission.responses,
        session.subjectId,
      );
    }

    const user = await userRepository.findById(session.userId);
    if (user) {
      const userPerformance = await TopicPerformance.find({
        userId: session.userId,
      }).select("subjectId masteryScore totalAttempted").lean();

      if (userPerformance && userPerformance.length > 0) {
        const subjectMastery = {};
        userPerformance.forEach((t) => {
          if (!t.subjectId) return;
          const sid = String(t.subjectId);
          if (!subjectMastery[sid])
            subjectMastery[sid] = { totalMastery: 0, distinctTopics: 0, totalAttempted: 0 };
          subjectMastery[sid].totalMastery += t.masteryScore || 0;
          subjectMastery[sid].distinctTopics += 1;
          subjectMastery[sid].totalAttempted += t.totalAttempted || 0;
        });

        const userSubjectScores = {};
        const predictedScoreDetails = { subjects: [] };
        let confidentSubjectsCount = 0;

        const MIN_QUESTIONS = CONSTANTS.PREDICTION?.MIN_QUESTIONS_PER_SUBJECT || 30;
        const MIN_TOPICS = CONSTANTS.PREDICTION?.MIN_TOPICS_PER_SUBJECT || 5;

        const userSubjects = await Subject.find({
          _id: { $in: Object.keys(subjectMastery) },
        }).select("name").lean();

        userSubjects.forEach((s) => {
          const sid = String(s._id);
          const mastery = subjectMastery[sid];
          if (mastery) {
            const rawScore = mastery.totalMastery / mastery.distinctTopics;
            const isConfident = mastery.totalAttempted >= MIN_QUESTIONS && mastery.distinctTopics >= MIN_TOPICS;

            // Always include in userSubjectScores to make it adaptive
            userSubjectScores[s.name] = rawScore;

            if (isConfident) {
              confidentSubjectsCount++;
            }

            predictedScoreDetails.subjects.push({
              name: s.name,
              score: Math.round(rawScore),
              status: isConfident ? "calculated" : "insufficient_data",
              questionsAttempted: mastery.totalAttempted,
              topicsAttempted: mastery.distinctTopics,
              questionsNeeded: Math.max(0, MIN_QUESTIONS - mastery.totalAttempted),
              topicsNeeded: Math.max(0, MIN_TOPICS - mastery.distinctTopics)
            });
          }
        });

        const practiceProjection = PracticeGradingService.computeUTMEScoreFromMap(userSubjectScores);
        const isPredictedScoreConfident = confidentSubjectsCount >= 4;

        // Fetch mock test performance for blended prediction
        const completedMockTests = await PracticeSessionModel.find(
          { 
            userId: session.userId,
            sessionStatus: "COMPLETED",
            isMockTest: true
          },
          { compositeScore: 1, _id: 0 }
        ).lean();

        const mockTestCount = completedMockTests.length;
        const mockTestAverage = mockTestCount > 0
          ? completedMockTests.reduce((sum, s) => sum + (s.compositeScore || 0), 0) / mockTestCount
          : 0;

        const blendedScore = computeBlendedPrediction(
          mockTestAverage,
          practiceProjection,
          mockTestCount
        );

        const predictedScore = blendedScore;

        // Compute band width based on mock test score variance
        // Wider band = inconsistent scores, narrower band = consistent scores
        let bandWidth = 25; // default when no mock data

        if (mockTestCount >= 2) {
          const scores = completedMockTests.map(s => s.compositeScore || 0);
          const maxScore = Math.max(...scores);
          const minScore = Math.min(...scores);
          const variance = maxScore - minScore;

          if (variance > 80) bandWidth = 30;
          else if (variance > 40) bandWidth = 20;
          else bandWidth = 10;
        }

        // Apply band around blended prediction
        predictedScoreDetails.min = Math.max(0, (predictedScore || 0) - bandWidth);
        predictedScoreDetails.max = Math.min(400, (predictedScore || 0) + bandWidth);

        // ── Session threshold gate ──────────────────────────────────────────
        // Only surface a predicted score after the student has completed the
        // minimum number of sessions. Before that, keep score = 0 so the UI
        // stays in the "Learning / Analyzing" state rather than showing a
        // premature range after just one attempt.
        const MIN_SESSIONS = CONSTANTS.PREDICTION?.MIN_SESSIONS || 3;
        const completedSessionCount = await practiceRepository.count({
          userId: session.userId,
          sessionStatus: "COMPLETED",
        });
        const hasEnoughSessions = completedSessionCount >= MIN_SESSIONS;

        user.stats = {
          ...(user.stats || {}),
          predictedScore: hasEnoughSessions ? predictedScore : 0,
          isPredictedScoreConfident: hasEnoughSessions && isPredictedScoreConfident,
          predictedScoreDetails,
          sessionsCompleted: completedSessionCount,
          sessionsNeededForPrediction: Math.max(0, MIN_SESSIONS - completedSessionCount),
        };

        if (!user.analytics) user.analytics = {};

        try {
          const { achievementRepository } = await import("../../repository/AchievementRepository.js");
          const streakDoc = await achievementRepository.getStreakByUser(session.userId);
          const today = new Date();
          let newStreakCount = 1;
          
          if (streakDoc) {
            const lastStreakDate = new Date(streakDoc.updatedAt);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (lastStreakDate.toDateString() === yesterday.toDateString()) {
               newStreakCount = streakDoc.streakCount + 1;
            } else if (lastStreakDate.toDateString() === today.toDateString()) {
               newStreakCount = streakDoc.streakCount; // Already updated today
            } else {
               newStreakCount = 1; // Streak broken
            }
          }
          
          if (!streakDoc || new Date(streakDoc.updatedAt).toDateString() !== today.toDateString()) {
            await achievementRepository.updateStreak(session.userId, newStreakCount);
          }
          user.analytics.streak = newStreakCount; // For legacy reference if any
        } catch (err) {
          console.warn("Failed to update StreakModel:", err.message);
        }

        await userRepository.updateUser(session.userId, { stats: user.stats, analytics: user.analytics });
      }
    }

    try {
      const { addAnalyticsJob } = await import("../../queues/AnalyticsQueue.js");
      addAnalyticsJob(session.userId, sessionId);
    } catch (queueErr) {
      console.warn("Failed to queue analytics job:", queueErr.message);
    }

    try {
      await Promise.all([
        cache.del("admin:dashboard:stats", "analytics:summary"),
        cache.invalidatePattern("analytics:reports:*")
      ]);
    } catch (err) {
      console.warn("Failed to invalidate analytics/dashboard caches:", err.message);
    }

    return { session: sessionWithQuestions, utmeScore, flagged: flagged || timeDriftFlag };
  }
}

export default PracticeGradingService;
