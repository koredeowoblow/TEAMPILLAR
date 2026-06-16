import { practiceRepository } from "../../repository/PracticeRepository.js";
import { questionRepository } from "../../repository/QuestionRepository.js";
import { userRepository } from "../../repository/UserRepository.js";
import Subject from "../../models/SubjectModel.js";
import TopicPerformance from "../../models/TopicPerformanceModel.js";
import { CONSTANTS } from "../../config/constants.js";
import AdaptiveEngineService from "../AdaptiveEngineService.js";
import { AppError } from "../../utils/AppError.js";
import cache from "../../utils/cache.js";

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
    return Math.round(Math.min(400, total));
  }

  static async submitSession(sessionId, submission) {
    const { responses } = submission;
    const session = await practiceRepository.findById(sessionId, [], { lean: true });
    if (!session) throw new AppError("Session not found", 404);

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

    if (session.sessionStatus !== "ACTIVE")
      throw new AppError("Session not active", 400);

    if (session.questionIds && session.questionIds.length > 0) {
      const validIds = new Set(session.questionIds.map(String));
      const invalidResponse = responses.find(
        (r) => !validIds.has(String(r.questionId)),
      );
      if (invalidResponse)
        throw new AppError("Invalid question in submission", 400);
    }

    const questions = await questionRepository.find({
      _id: { $in: submission.responses.map((r) => r.questionId) },
    }, {
      lean: true,
      select: "_id options.id options.isCorrect metadata.topic"
    });
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    let correct = 0;
    let totalTime = 0;
    const topics = {};

    for (const r of submission.responses) {
      const q = qMap.get(String(r.questionId));
      if (!q) continue;
      const opt = q.options.find((o) => o.id === r.selectedOption);
      if (opt && opt.isCorrect) correct += 1;
      totalTime += Number(r.timeTaken || 0);
      const topic = q.metadata?.topic || "unknown";
      topics[topic] = (topics[topic] || 0) + (opt && opt.isCorrect ? 1 : 0);
    }

    const totalQuestions = questions.length || submission.responses.length || 1;
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

    const updated = await practiceRepository.update(sessionId, {
      responses: submission.responses,
      sessionStatus: "COMPLETED",
      endTime: submission.endTime ? new Date(submission.endTime) : new Date(),
      analytics,
      security: {
        tabSwitches: submission.tabSwitches || 0,
        ipAddress: submission.ipAddress || null,
        flagged: flagged || timeDriftFlag,
      },
      score: Math.round(accuracy),
    });

    const questionsWithReview = await questionRepository.find({
      _id: { $in: updated.questionIds }
    }, { lean: true });
    const sessionWithQuestions = updated.toObject();
    sessionWithQuestions.questions = questionsWithReview;

    const subject = await Subject.findById(session.subjectId).select("name").lean();
    const subjectName = subject?.name || "";
    const sessionSubjectScores = { [subjectName]: Math.round(accuracy) };
    const utmeScore = PracticeGradingService.computeUTMEScoreFromMap(sessionSubjectScores);

    await AdaptiveEngineService.updateTopicPerformance(
      session.userId,
      submission.responses,
      session.subjectId,
    );

    const user = await userRepository.findById(session.userId);
    if (user) {
      const userPerformance = await TopicPerformance.find({
        userId: session.userId,
      }).select("subjectId masteryScore").lean();

      if (userPerformance && userPerformance.length > 0) {
        const subjectMastery = {};
        userPerformance.forEach((t) => {
          if (!t.subjectId) return;
          const sid = String(t.subjectId);
          if (!subjectMastery[sid])
            subjectMastery[sid] = { total: 0, count: 0 };
          subjectMastery[sid].total += t.masteryScore || 0;
          subjectMastery[sid].count += 1;
        });

        const userSubjectScores = {};
        const userSubjects = await Subject.find({
          _id: { $in: Object.keys(subjectMastery) },
        }).select("name").lean();
        userSubjects.forEach((s) => {
          const sid = String(s._id);
          if (subjectMastery[sid]) {
            userSubjectScores[s.name] =
              subjectMastery[sid].total / subjectMastery[sid].count;
          }
        });

        const predictedScore = PracticeGradingService.computeUTMEScoreFromMap(userSubjectScores);
        user.stats = { ...(user.stats || {}), predictedScore };
        await user.save();
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
