import mongoose from "mongoose";
import User from "../models/UserModel.js";
import Question from "../models/QuestionModel.js";
import Subject from "../models/SubjectModel.js";
import { AppError } from "../utils/AppError.js";

class MockTestService {
  static async startMockTest(user, requestedSubjectIds = null) {
    let mockSubjects = requestedSubjectIds;

    // Use requested subjects if provided, otherwise default to all selected subjects
    if (!mockSubjects || mockSubjects.length === 0) {
      mockSubjects = user.selectedSubjects || [];
    }

    // Validate 4 subjects selected
    if (mockSubjects.length !== 4) {
      throw new AppError("A UTME mock test requires exactly 4 subjects. Please select 4 subjects.", 400);
    }

    // Verify requested subjects are among user's selected subjects
    const userSubjectsStr = (user.selectedSubjects || []).map(id => id.toString());
    for (const sid of mockSubjects) {
      if (!userSubjectsStr.includes(sid.toString())) {
        throw new AppError("You can only take a mock test for subjects you have selected in your profile.", 403);
      }
    }

    // Check freemium limits
    const totalMocks = user.limits?.totalMockTests || 0;
    if (user.subscription === "free" && totalMocks >= 3) {
      throw new AppError("Free users are limited to 3 mock tests. Upgrade to Pro for unlimited.", 403);
    }

    const questionsBySubject = [];
    const allQuestionIds = [];

    const subjects = await Subject.find({ _id: { $in: mockSubjects } }).lean();
    const subjectMap = subjects.reduce((acc, s) => {
      acc[s._id.toString()] = s;
      return acc;
    }, {});

    // Query 40 questions per subject
    for (const subjectId of mockSubjects) {
      const questions = await Question.aggregate([
        { $match: { subjectId: new mongoose.Types.ObjectId(subjectId), "metadata.difficulty": { $in: ["easy", "medium", "hard"] } } },
        { $sample: { size: 40 } }
      ]);
      
      const formattedQuestions = questions.map(q => {
        const safeOptions = Array.isArray(q.options)
          ? q.options.map(o => ({ key: o.id || o.key, text: o.text, image: o.image }))
          : [];

        return {
          _id: q._id,
          subjectId: q.subjectId,
          subject: {
            _id: q.subjectId,
            name: subjectMap[q.subjectId.toString()] ? subjectMap[q.subjectId.toString()].name : 'Unknown'
          },
          // Flatten content.text → text so CBTExam can render it with question?.text
          text: q.content?.text || q.text || '',
          content: q.content,
          options: safeOptions,
          metadata: q.metadata
        };
      });

      questionsBySubject.push(...formattedQuestions);
      allQuestionIds.push(...formattedQuestions.map(q => q._id));
    }

    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");

    const session = await PracticeSessionModel.create({
      userId: user._id,
      subjectIds: mockSubjects,
      isMockTest: true,
      sessionType: "smart-mock", 
      sessionStatus: "ACTIVE",
      questionIds: allQuestionIds,
      totalDuration: 7200,
      questionLimit: allQuestionIds.length
    });

    // Increment mock test usage counter atomically
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'limits.totalMockTests': 1 }
    });

    return {
      sessionId: session._id,
      questions: questionsBySubject
    };
  }

  static async submitMockTest(user, sessionId, responses, options = {}) {
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const session = await PracticeSessionModel.findOne({ _id: sessionId, userId: user._id });

    if (!session) throw new AppError("Session not found", 404);
    if (session.sessionStatus !== "ACTIVE") throw new AppError("Session already submitted", 400);

    const questions = await Question.find({ _id: { $in: session.questionIds } }).lean();
    const questionMap = questions.reduce((acc, q) => {
      acc[q._id.toString()] = q;
      return acc;
    }, {});

    const subjects = await Subject.find({ _id: { $in: session.subjectIds } }).lean();
    const subjectMap = subjects.reduce((acc, s) => {
      acc[s._id.toString()] = s;
      return acc;
    }, {});

    const subjectScoresMap = {};
    for (const sid of session.subjectIds) {
      subjectScoresMap[sid.toString()] = { correct: 0, total: 0 };
    }

    // Evaluate responses
    const processedResponses = [];
    let totalTimeTaken = 0;
    const topics = {};

    for (const r of responses) {
      const q = questionMap[r.questionId];
      if (!q) continue;

      const sid = q.subjectId.toString();
      if (subjectScoresMap[sid]) {
        subjectScoresMap[sid].total += 1;
      }

      let isCorrect = false;
      const selectedOpt = Array.isArray(q.options) ? (
        q.options.find(o => o.id === r.selectedOption || o.key === r.selectedOption)
      ) : null;
      
      const correctOption = Array.isArray(q.options) ? q.options.find(o => o.isCorrect) : null;

      if (selectedOpt && selectedOpt.isCorrect) {
        isCorrect = true;
        if (subjectScoresMap[sid]) subjectScoresMap[sid].correct += 1;
      }

      const topic = q.metadata?.topic || "unknown";
      if (!isCorrect) {
        topics[topic] = (topics[topic] || 0) + 1; // Count mistakes per topic
      }

      processedResponses.push({
        questionId: r.questionId,
        selectedOption: r.selectedOption,
        timeTaken: r.timeTaken || 0,
        isCorrect, 
        correctAnswer: correctOption ? (correctOption.id || correctOption.key) : null,
      });

      totalTimeTaken += (r.timeTaken || 0);
    }

    for (const qid of session.questionIds) {
      const q = questionMap[qid.toString()];
      if (q && !responses.find(r => r.questionId === qid.toString())) {
         const sid = q.subjectId.toString();
         if (subjectScoresMap[sid]) {
           subjectScoresMap[sid].total += 1;
         }
      }
    }

    let compositeScore = 0;
    const subjectScores = [];

    for (const [sid, stats] of Object.entries(subjectScoresMap)) {
      const score = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      compositeScore += score;
      subjectScores.push({
        subjectId: sid,
        subjectName: subjectMap[sid] ? subjectMap[sid].name : "Unknown",
        score,
        correct: stats.correct,
        total: stats.total
      });
    }

    const { tabSwitches = 0, ipAddress = null } = options;
    const flagged = tabSwitches > 3;

    let totalQuestions = session.questionIds.length || 1;
    let totalCorrect = 0;

    for (const [sid, stats] of Object.entries(subjectScoresMap)) {
      totalCorrect += stats.correct;
    }

    const accuracy = (totalCorrect / totalQuestions) * 100;

    const analytics = {
      accuracy: Math.round(accuracy),
      speedPerQuestion: totalQuestions > 0 ? Math.round(totalTimeTaken / totalQuestions) : 0,
      topMistakeTopic: Object.keys(topics).sort((a, b) => topics[a] - topics[b])[0] || null,
    };

    session.sessionStatus = "COMPLETED";
    session.responses = processedResponses;
    session.compositeScore = compositeScore;
    session.subjectScores = subjectScores;
    session.score = compositeScore;
    session.analytics = analytics;
    session.security = {
      tabSwitches,
      ipAddress,
      flagged
    };
    session.endTime = new Date();
    await session.save();

    // Update user stats atomically (req.user is a plain object, not a Mongoose doc)
    const prevTotal = user.stats?.totalMocksTaken || 0;
    const prevAvg   = user.stats?.avgMockScore    || 0;
    const newTotal  = prevTotal + 1;
    const newAvg    = Math.round(((prevAvg * prevTotal) + compositeScore) / newTotal);
    const prevHigh  = user.stats?.highestMockScore || 0;

    await User.findByIdAndUpdate(user._id, {
      $set: {
        'stats.totalMocksTaken':  newTotal,
        'stats.avgMockScore':     newAvg,
        'stats.highestMockScore': Math.max(prevHigh, compositeScore),
      }
    });

    try {
      const { default: AdaptiveEngineService } = await import("./AdaptiveEngineService.js");
      for (const sid of session.subjectIds) {
        await AdaptiveEngineService.updateTopicPerformance(user._id, processedResponses, sid);
      }
    } catch (err) {
      console.warn("Failed to update adaptive engine in mock test:", err.message);
    }

    try {
      const { addAnalyticsJob } = await import("../queues/AnalyticsQueue.js");
      addAnalyticsJob(user._id, session._id);
    } catch (err) {
      console.warn("Failed to queue analytics job in mock test:", err.message);
    }

    try {
      const { default: cache } = await import("../core/cache.js");
      await Promise.all([
        cache.del("admin:dashboard:stats", "analytics:summary"),
        cache.invalidatePattern("analytics:reports:*")
      ]);
    } catch (err) {
      console.warn("Failed to invalidate analytics caches:", err.message);
    }

    return {
      compositeScore,
      subjectScores,
      sessionId: session._id,
      timeTaken: totalTimeTaken
    };
  }

  static async getMockHistory(user, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");

    const sessions = await PracticeSessionModel.find({
      userId: user._id,
      isMockTest: true,
      sessionStatus: "COMPLETED"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("subjectIds", "name")
    .lean();

    const total = await PracticeSessionModel.countDocuments({
      userId: user._id,
      isMockTest: true,
      sessionStatus: "COMPLETED"
    });

    return {
      sessions: sessions.map(s => ({
        sessionId: s._id,
        createdAt: s.createdAt,
        compositeScore: s.compositeScore,
        subjectScores: s.subjectScores,
        totalDuration: s.totalDuration,
        responses: s.responses 
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  static async getMockStats(user) {
    const stats = user.stats || {};
    return {
      totalMocksTaken: stats.totalMocksTaken || 0,
      highestMockScore: stats.highestMockScore || 0,
      avgMockScore: stats.avgMockScore || 0,
      predictedScore: stats.predictedScore || 0
    };
  }
}

export default MockTestService;
