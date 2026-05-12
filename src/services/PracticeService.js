import { questionRepository } from "../repository/QuestionRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import { userRepository } from "../repository/UserRepository.js";
import Subject from "../models/SubjectModel.js";
import { AppError } from "../utilis/AppError.js";

class PracticeService {
  // Return randomized set of questions for subjectId
  static async getQuestionsForSubject(subjectId, { limit = 20 } = {}) {
    // Support optional filtering and deterministic behavior
    // Accept signature: getQuestionsForSubject(subjectId, { limit, filters, deterministic })
    const filters = arguments[1]?.filters || {};
    const deterministic = arguments[1]?.deterministic || false;

    const mongoFilter = { subjectId, ...filters };
    let questions = await questionRepository.find(mongoFilter, { limit: 0 });

    // Apply shuffle unless deterministic flag is set (useful for tests)
    if (!deterministic) {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    }

    questions = questions.slice(0, limit);

    // Strip correct answers
    const safe = questions.map((q) => {
      const obj = q.toObject ? q.toObject() : q;
      if (obj.options)
        obj.options = obj.options.map((o) => ({ id: o.id, text: o.text }));
      return obj;
    });
    return safe;
  }

  static computeUTMEScoreFromMap(subjectScores = {}) {
    // Implement PRD rule: 400-point scale. Each subject contributes 0-100.
    // If English present, include English plus top 3 other subjects (up to 4 total).
    // If English absent, include top 4 subjects.
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

  static async getSubjects({ page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;
    const total = await Subject.countDocuments({});
    const subjects = await Subject.find({}).skip(skip).limit(limit).lean();
    const mapped = subjects.map((s) => ({
      id: String(s._id),
      name: s.name,
      code: s.code,
      description: s.description,
      questionCount: Number(s.questionCount || 0),
    }));
    return {
      data: mapped,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  static async startSession(userId, subjectId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const subject = await Subject.findById(subjectId);
    if (!subject) throw new AppError("Subject not found", 404);

    const session = await practiceRepository.create({
      userId,
      subjectId,
      sessionStatus: "ACTIVE",
      startTime: new Date(),
    });
    return session;
  }

  static async recordVisibility(
    sessionId,
    { increment = 1, ipAddress = null } = {},
  ) {
    const session = await practiceRepository.findById(sessionId);
    if (!session) throw new AppError("Session not found", 404);
    const current = (session.security && session.security.tabSwitches) || 0;
    const newCount = current + Number(increment || 1);

    const updated = await practiceRepository.update(sessionId, {
      security: {
        ...(session.security || {}),
        tabSwitches: newCount,
        ipAddress,
      },
    });

    // Auto-submit when threshold reached (PRD: >=5)
    if (newCount >= 5 && updated.sessionStatus === "ACTIVE") {
      // Use existing stored responses if any, else submit empty
      const responses = updated.responses || [];
      const result = await this.submitSession(sessionId, {
        responses,
        tabSwitches: newCount,
        endTime: new Date(),
        ipAddress,
      });
      return { autoSubmitted: true, result };
    }

    return { autoSubmitted: false, session: updated };
  }

  static async submitSession(sessionId, submission) {
    // submission: { responses: [{questionId, selectedOption, timeTaken}], tabSwitches, endTime }
    const session = await practiceRepository.findById(sessionId);
    if (!session) throw new AppError("Session not found", 404);
    if (session.sessionStatus !== "ACTIVE")
      throw new AppError("Session not active", 400);

    const questions = await questionRepository.find({
      _id: { $in: submission.responses.map((r) => r.questionId) },
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

    // Anti-cheat: tab switches
    const flagged = (submission.tabSwitches || 0) > 5;

    // Time drift verification
    const reportedDuration = submission.endTime
      ? new Date(submission.endTime) - new Date(session.startTime)
      : null;
    const drift = reportedDuration
      ? Math.abs(reportedDuration / 1000 - totalTime)
      : 0; // seconds
    const timeDriftFlag = drift > 10; // arbitrary threshold

    const analytics = {
      accuracy: Math.round(accuracy),
      speedPerQuestion:
        totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0,
      topMistakeTopic:
        Object.keys(topics).sort((a, b) => topics[b] - topics[a])[0] || null,
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

    // Build subject score map for UTME calculation if client provided subject names
    const subject = await Subject.findById(session.subjectId);
    const subjectName = subject?.name || "";
    const subjectScores = { [subjectName]: Math.round(accuracy) };
    const utmeScore = this.computeUTMEScoreFromMap(subjectScores);

    return { session: updated, utmeScore, flagged: flagged || timeDriftFlag };
  }

  static async getSessionResult(sessionId) {
    const session = await practiceRepository.findById(sessionId);
    if (!session) throw new AppError("Not found", 404);
    return session;
  }
}

export default PracticeService;
