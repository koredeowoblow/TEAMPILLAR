import { questionRepository } from "../repository/QuestionRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import { CONSTANTS } from "../config/constants.js";
import { userRepository } from "../repository/UserRepository.js";
import Subject from "../models/SubjectModel.js";
import mongoose from "mongoose";
import AdaptiveEngineService from "./AdaptiveEngineService.js";
import { AppError } from "../utils/AppError.js";
import { resolveSubjectId } from "../utils/subjectResolver.js";
import TopicPerformance from "../models/TopicPerformanceModel.js";
import cache from "../utils/cache.js";

class PracticeService {
  // Return randomized set of questions for subjectId
  static async getQuestionsForSubject(
    subjectId,
    {
      userId,
      sessionId,
      topicId,
      difficulty,
      year,
      limit = CONSTANTS.PAGINATION.DEFAULT_LIMIT,
      filters = {},
      deterministic = false,
      isAdmin = false,
    } = {},
  ) {
    try {
      const projectionStage = {
        $project: {
          _id: 1,
          subjectId: 1,
          content: { text: 1, image: 1, equation: 1 },
          metadata: 1,
          options: isAdmin
            ? 1
            : { id: 1, text: 1 }
        }
      };

      let resolvedSubjectId = null;
      if (subjectId) {
        resolvedSubjectId = await resolveSubjectId(subjectId);
      } else if (!isAdmin) {
        throw new AppError("subjectId is required", 400);
      }

      // Retrieve practice session if sessionId is provided
      let session = null;
      if (sessionId) {
        session = await practiceRepository.findById(sessionId, [], { lean: true });
      }

      // If the session already has questions saved, retrieve and return them directly
      if (session && session.questionIds && session.questionIds.length > 0) {
        const questions = await questionRepository.find({
          _id: { $in: session.questionIds },
        }, {
          lean: true,
          select: isAdmin
            ? "_id subjectId content metadata options"
            : "_id subjectId content metadata options.id options.text"
        });

        // Fetch subject names for enrichment
        const subjectIds = [...new Set(questions.map(q => q.subjectId).filter(Boolean).map(String))];
        const subjectDocs = subjectIds.length > 0 ? await Subject.find({ _id: { $in: subjectIds } }).lean() : [];
        const subjectMap = {};
        subjectDocs.forEach(d => { subjectMap[String(d._id)] = d.name; });

        // Maintain the stored ordering of questionIds
        const qMap = new Map(questions.map((q) => [String(q._id || q.id), q]));
        const orderedQuestions = session.questionIds
          .map((id) => qMap.get(String(id)))
          .filter(Boolean);

        const safe = orderedQuestions.map((q) => {
          const correctOpt = q.options?.find((o) => o.isCorrect);
          const slim = {
            _id: q._id,
            subjectId: q.subjectId,
            subjectName: subjectMap[String(q.subjectId)] || "Subject",
            content: {
              text: q.content?.text,
              image: q.content?.image,
              equation: q.content?.equation,
            },
            metadata: q.metadata,
          };

          if (isAdmin) {
            slim.correctAnswer = correctOpt ? correctOpt.id : null;
            slim.options = q.options?.map((o) => ({
              id: o.id,
              text: o.text,
              isCorrect: o.isCorrect,
            })) || [];
          } else {
            if (q.options) {
              slim.options = q.options.map((o) => ({
                id: o.id,
                text: o.text,
              }));
            }
          }
          return slim;
        });
        return safe;
      }

      let matchStage = { ...filters };

      // Multi-subject support: Fetch the full limit for EACH subject
      if (session && session.subjectIds && session.subjectIds.length > 1) {
        let allQuestions = [];
        const subjectDocs = await Subject.find({ _id: { $in: session.subjectIds } }).lean();
        const subjectNameMap = {};
        subjectDocs.forEach(d => { subjectNameMap[String(d._id)] = d.name; });

        for (let i = 0; i < session.subjectIds.length; i++) {
          const currentSubId = session.subjectIds[i];
          const currentLimit = Number(limit); // Fetch full limit for each subject

          // Apply adaptive logic PER SUBJECT
          let subMatchStage = { ...filters, subjectId: currentSubId };

          if (!filters["metadata.topic"] && !filters["metadata.difficulty"]) {
            const adaptiveMatch = await AdaptiveEngineService.buildWeightedPool(
              userId,
              currentSubId,
              filters,
            );
            if (adaptiveMatch["metadata.topic"])
              subMatchStage["metadata.topic"] = adaptiveMatch["metadata.topic"];
            if (adaptiveMatch["metadata.difficulty"])
              subMatchStage["metadata.difficulty"] = adaptiveMatch["metadata.difficulty"];
          }

          if (topicId) subMatchStage["metadata.topic"] = topicId;
          if (difficulty) subMatchStage["metadata.difficulty"] = difficulty.toLowerCase();
          if (year) subMatchStage["metadata.year"] = Number(year);

          const subPipeline = [
            { $match: subMatchStage },
            { $sample: { size: currentLimit } },
            projectionStage
          ];
          let subQuestions = await questionRepository.aggregate(subPipeline);

          // Fallback if adaptive pool is too small for this subject
          if (subQuestions.length < currentLimit) {
            let fallbackLimit = currentLimit - subQuestions.length;
            let fallbackMatchStage = { subjectId: currentSubId };
            if (difficulty) fallbackMatchStage["metadata.difficulty"] = difficulty.toLowerCase();
            if (year) fallbackMatchStage["metadata.year"] = Number(year);

            let foundIds = subQuestions.map(q => q._id);
            if (foundIds.length > 0) {
              fallbackMatchStage._id = { $nin: foundIds };
            }

            let fallbackPipeline = [
              { $match: fallbackMatchStage },
              { $sample: { size: fallbackLimit } },
              projectionStage
            ];
            let fallbackQuestions = await questionRepository.aggregate(fallbackPipeline);
            subQuestions = subQuestions.concat(fallbackQuestions);

            // Final absolute fallback: Drop difficulty/year if still not enough
            if (subQuestions.length < currentLimit) {
              fallbackLimit = currentLimit - subQuestions.length;
              foundIds = subQuestions.map(q => q._id);
              fallbackMatchStage = { subjectId: currentSubId };
              if (foundIds.length > 0) {
                fallbackMatchStage._id = { $nin: foundIds };
              }
              fallbackPipeline = [
                { $match: fallbackMatchStage },
                { $sample: { size: fallbackLimit } },
                projectionStage
              ];
              fallbackQuestions = await questionRepository.aggregate(fallbackPipeline);
              subQuestions = subQuestions.concat(fallbackQuestions);
            }
          }

          // Attach subject name to each question for the frontend
          const enrichedSubQuestions = subQuestions.map(q => ({
            ...q,
            subjectName: subjectNameMap[String(currentSubId)] || "Subject"
          }));

          allQuestions = allQuestions.concat(enrichedSubQuestions);
        }

        // Map and persist
        const safe = allQuestions.map((q) => {
          const slim = {
            _id: q._id,
            subjectId: q.subjectId,
            subjectName: q.subjectName,
            content: { text: q.content?.text, image: q.content?.image, equation: q.content?.equation },
            metadata: q.metadata,
            options: q.options?.map(o => ({ id: o.id, text: o.text })) || []
          };
          return slim;
        });

        if (session && session.sessionStatus === "ACTIVE") {
          await practiceRepository.update(sessionId, {
            questionIds: safe.map((q) => q._id),
            questionLimit: safe.length // Update session limit to total count
          });
        }
        return safe;
      }

      if (resolvedSubjectId) matchStage.subjectId = resolvedSubjectId;
      if (topicId) matchStage["metadata.topic"] = topicId;
      if (difficulty)
        matchStage["metadata.difficulty"] = difficulty.toLowerCase();
      if (year) matchStage["metadata.year"] = Number(year);

      // Exclude seen and recently correct questions
      const excludedIds = new Set();
      if (!isAdmin && process.env.NODE_ENV !== "test") {
        if (!sessionId) {
          throw new AppError("sessionId is required to fetch questions", 400);
        }
        if (!session) {
          throw new AppError("Session not found", 404);
        }
        if (String(session.userId) !== String(userId)) {
          throw new AppError("Access denied: Session ownership mismatch", 403);
        }
        if (session.sessionStatus !== "ACTIVE") {
          throw new AppError("Session is no longer active", 400);
        }
        if (session.responses) {
          session.responses.forEach((r) =>
            excludedIds.add(r.questionId.toString()),
          );
        }
      } else {
        if (session && session.responses) {
          session.responses.forEach((r) =>
            excludedIds.add(r.questionId.toString()),
          );
        }
      }

      // Only exclude questions answered in other sessions in the last 7 days
      // if the available pool would still be >= the requested limit after exclusion.
      // This prevents the pool from being starved when the question bank is small.
      if (userId) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentSessions = await practiceRepository.find({
          userId,
          createdAt: { $gte: sevenDaysAgo },
          sessionStatus: "COMPLETED",
        }, { lean: true });

        const recentlyAnsweredIds = new Set();
        recentSessions.forEach((s) => {
          if (s.responses) {
            s.responses.forEach((r) =>
              recentlyAnsweredIds.add(r.questionId.toString()),
            );
          }
        });

        // Check how many questions would still be available after applying the cross-session exclusion
        const potentialExcluded = new Set([...excludedIds, ...recentlyAnsweredIds]);
        const candidateMatchStage = { ...matchStage };
        if (potentialExcluded.size > 0) {
          candidateMatchStage._id = {
            $nin: Array.from(potentialExcluded).map(
              (id) => new mongoose.Types.ObjectId(id),
            ),
          };
        }
        const availableCount = (await questionRepository.count(candidateMatchStage)) || 0;

        // Only apply the cross-session exclusion if enough questions remain
        if (availableCount >= Number(limit)) {
          recentlyAnsweredIds.forEach((id) => excludedIds.add(id));
        }
        // else: skip 7-day exclusion — within-session exclusion (excludedIds) still applies
      }

      if (excludedIds.size > 0) {
        matchStage._id = {
          $nin: Array.from(excludedIds).map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
        };
      }

      // Use AdaptiveEngineService to get the weighted pool match stage if not already provided in filters
      if (!filters["metadata.topic"] && !filters["metadata.difficulty"]) {
        const adaptiveMatch = await AdaptiveEngineService.buildWeightedPool(
          userId,
          resolvedSubjectId,
          filters,
        );
        if (adaptiveMatch["metadata.topic"])
          matchStage["metadata.topic"] = adaptiveMatch["metadata.topic"];
        if (adaptiveMatch["metadata.difficulty"])
          matchStage["metadata.difficulty"] =
            adaptiveMatch["metadata.difficulty"];
      }

      // Override with explicit query params if provided
      if (topicId) matchStage["metadata.topic"] = topicId;
      if (difficulty)
        matchStage["metadata.difficulty"] = difficulty.toLowerCase();
      if (year) matchStage["metadata.year"] = Number(year);

      const pipeline = [
        { $match: matchStage },
        { $sample: { size: Number(limit) } },
        projectionStage
      ];

      let questions = await questionRepository.aggregate(pipeline);

      // Fallback if weighted pool yields fewer questions than requested
      if (!deterministic && questions.length < limit) {
        let fallbackLimit = limit - questions.length;
        let foundIds = questions.map((q) => q._id);
        let fallbackMatchStage = { subjectId: resolvedSubjectId };
        if (difficulty)
          fallbackMatchStage["metadata.difficulty"] = difficulty.toLowerCase();
        if (year) fallbackMatchStage["metadata.year"] = Number(year);

        let allExcluded = [
          ...Array.from(excludedIds),
          ...foundIds.map(id => String(id)),
        ]
          // Deduplicate by string value, guard with isValid before converting
          // so test mocks with short IDs ("1", "2") don't throw
          .filter((id, idx, arr) => arr.indexOf(id) === idx)
          .filter(id => mongoose.Types.ObjectId.isValid(id))
          .map(id => new mongoose.Types.ObjectId(id));

        if (allExcluded.length > 0) {
          fallbackMatchStage._id = { $nin: allExcluded };
        }

        let fallbackPipeline = [
          { $match: fallbackMatchStage },
          { $sample: { size: fallbackLimit } },
          projectionStage
        ];
        let fallbackQuestions =
          await questionRepository.aggregate(fallbackPipeline);
        questions = questions.concat(fallbackQuestions);

        // Final absolute fallback: Drop ALL filters (difficulty, year, and cross-session excludedIds) 
        // to guarantee we meet the requested limit if the DB has enough questions.
        if (questions.length < limit) {
          fallbackLimit = limit - questions.length;
          foundIds = questions.map((q) => q._id);
          fallbackMatchStage = { subjectId: resolvedSubjectId };

          if (foundIds.length > 0) {
            fallbackMatchStage._id = {
              $nin: foundIds
                .map(id => String(id))
                .filter((id, idx, arr) => arr.indexOf(id) === idx)
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id)),
            };
          }

          fallbackPipeline = [
            { $match: fallbackMatchStage },
            { $sample: { size: fallbackLimit } },
            projectionStage
          ];
          fallbackQuestions = await questionRepository.aggregate(fallbackPipeline);
          questions = questions.concat(fallbackQuestions);
        }

      }

      // Strip correct answers or add metadata for admins, and slim down response
      const safe = questions.map((q) => {
        const correctOpt = q.options?.find((o) => o.isCorrect);

        const slim = {
          _id: q._id,
          subjectId: q.subjectId,
          content: {
            text: q.content?.text,
            image: q.content?.image,
            equation: q.content?.equation,
          },
          metadata: q.metadata,
        };

        if (isAdmin) {
          slim.correctAnswer = correctOpt ? correctOpt.id : null;
          slim.options = q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
          }));
        } else {
          if (q.options) {
            slim.options = q.options.map((o) => ({
              id: o.id,
              text: o.text,
            }));
          }
        }
        return slim;
      });

      // Persist the generated questionIds to the practice session if not already set
      if (session && session.sessionStatus === "ACTIVE" && (!session.questionIds || session.questionIds.length === 0)) {
        await practiceRepository.update(sessionId, {
          questionIds: safe.map((q) => q._id),
        });
      }

      return safe;
    } catch (error) {
      throw new Error(`Failed to get questions for subject: ${error.message}`);
    }
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

  static async getSubjects({ page = 1, limit = 50, userId = null } = {}) {
    const skip = (page - 1) * limit;
    let query = {};

    if (userId) {
      const user = await userRepository.findById(userId, { lean: true, select: "selectedSubjects" });
      if (user && user.selectedSubjects && user.selectedSubjects.length > 0) {
        query = { _id: { $in: user.selectedSubjects } };
      }
    }

    const total = await Subject.countDocuments(query);
    const subjects = await Subject.find(query).skip(skip).limit(limit).lean();
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

  static async startSession(userId, subjectId, questionLimit = 20, subjectIds = []) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    // If subjectIds is provided and has multiple subjects, use it
    const ids = Array.isArray(subjectIds) && subjectIds.length > 0 ? subjectIds : [subjectId];
    const resolvedSubjectIds = await Promise.all(ids.map(id => resolveSubjectId(id)));

    const session = await practiceRepository.create({
      userId,
      subjectId: resolvedSubjectIds[0], // First one as primary for compatibility
      subjectIds: resolvedSubjectIds,
      sessionStatus: "ACTIVE",
      startTime: new Date(),
      questionLimit: Math.max(1, Number(questionLimit) || 20),
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

    // Auto-submit when threshold reached
    if (
      newCount >= CONSTANTS.EXAM.MAX_TAB_SWITCHES &&
      updated.sessionStatus === "ACTIVE"
    ) {
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
    const { responses } = submission;
    // submission: { responses: [{questionId, selectedOption, timeTaken}], tabSwitches, endTime }
    const session = await practiceRepository.findById(sessionId, [], { lean: true });
    if (!session) throw new AppError("Session not found", 404);

    // Idempotency guard: if the session was already completed (e.g. via
    // auto-submit triggered by tab-switch violations), return the existing
    // result rather than throwing. This prevents the "Session not active"
    // error when the client sends a duplicate submit after the server already
    // closed the session.
    if (session.sessionStatus === "COMPLETED") {
      const questionsWithReview = await questionRepository.find({
        _id: { $in: session.questionIds || [] },
      }, { lean: true });
      const sessionWithQuestions = { ...session };
      sessionWithQuestions.questions = questionsWithReview;
      const subject = await Subject.findById(session.subjectId).select("name").lean();
      const subjectName = subject?.name || "";
      const utmeScore = this.computeUTMEScoreFromMap({
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

    // Validate submitted questionIds against session
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

    // Anti-cheat: tab switches
    const flagged =
      (submission.tabSwitches || 0) > CONSTANTS.EXAM.MAX_TAB_SWITCHES;

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

    // Populate questions for the immediate result response
    const questionsWithReview = await questionRepository.find({
      _id: { $in: updated.questionIds }
    }, { lean: true });
    const sessionWithQuestions = updated.toObject();
    sessionWithQuestions.questions = questionsWithReview;

    // Build subject score map for UTME calculation if client provided subject names
    const subject = await Subject.findById(session.subjectId).select("name").lean();
    const subjectName = subject?.name || "";
    const sessionSubjectScores = { [subjectName]: Math.round(accuracy) };
    const utmeScore = this.computeUTMEScoreFromMap(sessionSubjectScores);

    // Adaptive Engine: update topic performance
    await AdaptiveEngineService.updateTopicPerformance(
      session.userId,
      submission.responses,
      session.subjectId,
    );

    // ... user stats update logic remains ...
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

        const predictedScore = this.computeUTMEScoreFromMap(userSubjectScores);
        user.stats = { ...(user.stats || {}), predictedScore };
        await user.save();
      }
    }

    // Invalidate cached reports and dashboard stats
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

  static async getSessionResult(sessionId, userId) {
    const session = await (await import("../models/PracticeSessionModel.js")).default.findById(sessionId)
      .populate("subjectId")
      .populate("responses.questionId")
      .lean();

    if (!session) throw new AppError("Not found", 404);

    // Authorization Check: Ensure user owns the session
    if (userId && String(session.userId) !== String(userId)) {
      throw new AppError("Access denied: You do not own this session.", 403);
    }

    // Convert to plain JS object so we can attach computed fields
    const result = { ...session };

    // Map populated questionId back to questions array for DTO compatibility
    result.questions = (result.responses ?? [])
      .map(r => r.questionId)
      .filter(Boolean);

    return result;
  }
}

export default PracticeService;
