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

    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();
    const sessionAnswers = {};

    // Query 40 questions per subject
    for (const subjectId of mockSubjects) {
      let questions = [];
      const poolKeys = await redisClient.keys(`pool:subject:${subjectId}:*`);
      if (poolKeys && poolKeys.length > 0) {
        const randomKey = poolKeys[Math.floor(Math.random() * poolKeys.length)];
        const poolData = await redisClient.get(randomKey);
        if (poolData) questions = JSON.parse(poolData).slice(0, 40);
      }

      if (questions.length < 40) {
        questions = await Question.aggregate([
          { $match: { subjectId: new mongoose.Types.ObjectId(subjectId), "metadata.difficulty": { $in: ["easy", "medium", "hard"] } } },
          { $sample: { size: 40 } }
        ]);
      }
      
      const formattedQuestions = questions.map(q => {
        const safeOptions = Array.isArray(q.options)
          ? q.options.map(o => ({ key: o.id || o.key, text: o.text, image: o.image }))
          : [];

        // Save correct answer for fast grading
        const correctOpt = Array.isArray(q.options) ? q.options.find(o => o.isCorrect) : null;
        sessionAnswers[q._id.toString()] = {
          subjectId: q.subjectId.toString(),
          correctAnswer: correctOpt ? (correctOpt.id || correctOpt.key) : null,
          topic: q.metadata?.topic || "unknown"
        };

        return {
          _id: q._id,
          subjectId: q.subjectId,
          subject: {
            _id: q.subjectId,
            name: subjectMap[q.subjectId.toString()] ? subjectMap[q.subjectId.toString()].name : 'Unknown'
          },
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

    // Cache correct answers for grading (TTL: 4 hours)
    await redisClient.setEx(`session:${session._id}:answers`, 14400, JSON.stringify(sessionAnswers));

    return {
      sessionId: session._id,
      questions: questionsBySubject
    };
  }

  static async submitMockTest(user, sessionId, responses, options = {}) {
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const session = await PracticeSessionModel.findOne({ _id: sessionId, userId: user._id });

    if (!session) throw new AppError("Session not found", 404);

    if (session.sessionStatus === "COMPLETED" || session.sessionStatus === "PENDING_GRADING") {
      return {
        compositeScore: session.compositeScore || session.score || 0,
        subjectScores: session.subjectScores || [],
        sessionId: session._id,
        timeTaken: session.timeTaken || 0,
        status: session.sessionStatus
      };
    }
    
    if (session.sessionStatus !== "ACTIVE") throw new AppError("Session is not active", 400);

    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();
    
    let finalResponses = [];
    const progressData = await redisClient.get(`session:${sessionId}:progress`);
    
    if (progressData) {
      finalResponses = JSON.parse(progressData).responses || [];
    } else if (responses && responses.length > 0) {
      console.warn(`[MockTestService] Redis cache missing for session ${sessionId}, falling back to full client payload.`);
      finalResponses = responses;
    } else if (options.isSweeper) {
      console.warn(`[MockTestService] Sweeper finalizing session ${sessionId} with zero responses.`);
      finalResponses = [];
    } else {
      console.warn(`[MockTestService] Redis cache missing and no fallback payload provided for session ${sessionId}. Requesting full payload.`);
      throw new AppError("requiresFullPayload", 400);
    }

    const { tabSwitches = 0, ipAddress = null } = options;
    const flagged = tabSwitches > 3;

    session.sessionStatus = "PENDING_GRADING";
    session.responses = finalResponses;
    session.security = {
      tabSwitches,
      ipAddress,
      flagged
    };
    session.endTime = new Date();
    await session.save();

    try {
      const { addScoreJob } = await import("../queues/GradingQueue.js");
      addScoreJob(user._id, session._id, finalResponses, options);
    } catch (err) {
      console.warn("Failed to queue score job in mock test:", err.message);
    }

    return {
      sessionId: session._id,
      status: "PENDING_GRADING"
    };
  }

  static async processScoring(userId, sessionId, responses, options = {}) {
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const { default: User } = await import("../models/UserModel.js");
    
    const session = await PracticeSessionModel.findById(sessionId);
    if (!session || session.sessionStatus !== "PENDING_GRADING") return;

    const user = await User.findById(userId).lean();
    if (!user) return;

    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();

    let sessionAnswers = {};
    const cachedAnswersData = await redisClient.get(`session:${sessionId}:answers`);
    
    if (cachedAnswersData) {
      sessionAnswers = JSON.parse(cachedAnswersData);
    } else {
      // Fallback to DB if cache expired
      const questions = await Question.find({ _id: { $in: session.questionIds } }).lean();
      sessionAnswers = questions.reduce((acc, q) => {
        const correct = Array.isArray(q.options) ? q.options.find(o => o.isCorrect) : null;
        acc[q._id.toString()] = {
           subjectId: q.subjectId.toString(),
           correctAnswer: correct ? (correct.id || correct.key) : null,
           topic: q.metadata?.topic || "unknown"
        };
        return acc;
      }, {});
    }

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
      const qAnswer = sessionAnswers[r.questionId];
      if (!qAnswer) continue;

      const sid = qAnswer.subjectId;
      if (subjectScoresMap[sid]) {
        subjectScoresMap[sid].total += 1;
      }

      let isCorrect = false;
      const correctOptionId = qAnswer.correctAnswer;

      if (r.selectedOption && (r.selectedOption === correctOptionId)) {
        isCorrect = true;
        if (subjectScoresMap[sid]) subjectScoresMap[sid].correct += 1;
      }

      const topic = qAnswer.topic;
      if (!isCorrect) {
        topics[topic] = (topics[topic] || 0) + 1; // Count mistakes per topic
      }

      processedResponses.push({
        questionId: r.questionId,
        selectedOption: r.selectedOption,
        timeTaken: r.timeTaken || 0,
        isCorrect, 
        correctAnswer: correctOptionId,
      });

      totalTimeTaken += (r.timeTaken || 0);
    }

    for (const qid of session.questionIds) {
      const qAnswer = sessionAnswers[qid.toString()];
      if (qAnswer && !responses.find(r => r.questionId.toString() === qid.toString())) {
         const sid = qAnswer.subjectId;
         if (subjectScoresMap[sid]) {
           subjectScoresMap[sid].total += 1;
         }
      }
    }

    let compositeScore = 0;
    const subjectScores = [];

    for (const [sid, stats] of Object.entries(subjectScoresMap)) {
      let expectedTotal = 0;
      for (const qid of session.questionIds) {
        if (sessionAnswers[qid.toString()]?.subjectId === sid) {
          expectedTotal++;
        }
      }

      if (stats.total > expectedTotal) {
        logger.error(`Scoring Bug Detected: stats.total (${stats.total}) exceeds actual questions (${expectedTotal}) for subject ${sid} in session ${sessionId}`);
        stats.total = expectedTotal; // Safety fallback
      }

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
    
    await session.save();

    // Update user stats atomically
    const prevTotal = user.stats?.totalMocksTaken || 0;
    const prevAvg   = user.stats?.avgMockScore    || 0;
    const newTotal  = prevTotal + 1;
    const newAvg    = Math.round(((prevAvg * prevTotal) + compositeScore) / newTotal);
    const prevHigh  = user.stats?.highestMockScore || 0;

    const UserModel = (await import("../models/UserModel.js")).default;
    await UserModel.findByIdAndUpdate(userId, {
      $set: {
        'stats.totalMocksTaken':  newTotal,
        'stats.avgMockScore':     newAvg,
        'stats.highestMockScore': Math.max(prevHigh, compositeScore),
      }
    });

    try {
      const { addGradingJob } = await import("../queues/GradingQueue.js");
      addGradingJob(userId, session.subjectIds, processedResponses);
    } catch (err) {
      console.warn("Failed to queue AI grading job in mock test:", err.message);
    }

    try {
      const { addAnalyticsJob } = await import("../queues/AnalyticsQueue.js");
      addAnalyticsJob(userId, session._id);
    } catch (err) {
      console.warn("Failed to queue analytics job in mock test:", err.message);
    }

    try {
      const { default: cache } = await import("../utils/cache.js");
      await Promise.all([
        cache.del("admin:dashboard:stats", "analytics:summary"),
        cache.invalidatePattern("analytics:reports:*")
      ]);
    } catch (err) {
      console.warn("Failed to invalidate analytics caches:", err.message);
    }
  }

  static async getActiveSession(user) {
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const { getRedisClient } = await import("../config/redis.js");
    
    const session = await PracticeSessionModel.findOne({
      userId: user._id,
      isMockTest: true,
      sessionStatus: "ACTIVE"
    }).lean();

    if (!session) return null;

    const redisClient = await getRedisClient();
    const progressData = await redisClient.get(`session:${session._id}:progress`);
    let responses = [];
    let timeRemaining = session.totalDuration;

    if (progressData) {
      const parsed = JSON.parse(progressData);
      responses = parsed.responses || [];
      timeRemaining = parsed.timeRemaining !== undefined ? parsed.timeRemaining : timeRemaining;
    } else {
       const elapsed = Math.floor((Date.now() - session.createdAt.getTime()) / 1000);
       timeRemaining = Math.max(0, session.totalDuration - elapsed);
    }

    const questions = await Question.find({ _id: { $in: session.questionIds } }).lean();
    const subjects = await Subject.find({ _id: { $in: session.subjectIds } }).lean();
    const subjectMap = subjects.reduce((acc, s) => {
      acc[s._id.toString()] = s.name;
      return acc;
    }, {});

    const formattedQuestions = questions.map(q => {
      const safeOptions = Array.isArray(q.options)
        ? q.options.map(o => ({ key: o.id || o.key, text: o.text, image: o.image }))
        : [];
      return {
        _id: q._id,
        subjectId: q.subjectId,
        subject: {
          _id: q.subjectId,
          name: subjectMap[q.subjectId.toString()] || 'Unknown'
        },
        text: q.content?.text || q.text || '',
        content: q.content,
        options: safeOptions,
        metadata: q.metadata
      };
    });

    return {
      sessionId: session._id,
      questions: formattedQuestions,
      responses,
      timeRemaining,
      totalDuration: session.totalDuration
    };
  }

  static async saveProgress(user, sessionId, responses, timeRemaining) {
    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();
    
    // TTL matches max exam duration (2 hours) plus 1 hour grace period
    await redisClient.setEx(
      `session:${sessionId}:progress`,
      10800,
      JSON.stringify({ responses, timeRemaining })
    );
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
