import mongoose from "mongoose";
import User from "../models/UserModel.js";
import Question from "../models/QuestionModel.js";
import Subject from "../models/SubjectModel.js";
import { AppError } from "../utils/AppError.js";
import QuestionPoolService from "./QuestionPoolService.js";
import crypto from "crypto";

const LUA_FENCING_SCRIPT = `
local sessionRaw = redis.call("GET", KEYS[1])
if not sessionRaw then
  return {"ERR", "SESSION_NOT_FOUND"}
end

local session = cjson.decode(sessionRaw)

if session.status == "FINALIZING" or session.status == "FINALIZED" then
  return {"ERR", "SESSION_LOCKED_FINAL"}
end

if session.lockOwner ~= ARGV[1] then
  return {"ERR", "LOCK_MISMATCH"}
end

if tonumber(ARGV[2]) ~= tonumber(session.version) then
  return {"ERR", "STALE_FENCING_TOKEN"}
end

local idemKey = KEYS[2] .. ":" .. ARGV[4]
local exists = redis.call("GET", idemKey)
if exists then
  return {"OK", session.version, "DUPLICATE"}
end

redis.call("SET", idemKey, "1")
redis.call("EXPIRE", idemKey, 14400)

session.version = session.version + 1
session.updatedAt = tonumber(ARGV[5])
if ARGV[3] ~= nil and ARGV[3] ~= "" then
  session.lastWrite = ARGV[3]
end

redis.call("SET", KEYS[1], cjson.encode(session))
return {"OK", session.version, "NEW"}
`;

const LUA_FINALIZE_SCRIPT = `
local sessionRaw = redis.call("GET", KEYS[1])
if not sessionRaw then
  return {"ERR", "SESSION_NOT_FOUND"}
end

local session = cjson.decode(sessionRaw)

if session.lockOwner ~= ARGV[1] then
  return {"ERR", "LOCK_MISMATCH"}
end

if tonumber(ARGV[2]) ~= tonumber(session.version) then
  return {"ERR", "STALE_FENCING_TOKEN"}
end

if session.status == "FINALIZING" or session.status == "FINALIZED" then
  return {"ERR", "SESSION_LOCKED_FINAL"}
end

local lockKey = KEYS[1] .. ":finalize_lock"
local lockAcquired = redis.call("SETNX", lockKey, ARGV[3])
if lockAcquired == 0 then
  return {"ERR", "ALREADY_FINALIZING"}
end
redis.call("EXPIRE", lockKey, 14400)

session.status = "FINALIZING"
session.version = session.version + 1
redis.call("SET", KEYS[1], cjson.encode(session))

return {"OK", session.version}
`;

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

    const subjects = await Subject.find({ _id: { $in: mockSubjects }, isActive: { $ne: false } }).lean();
    if (subjects.length !== mockSubjects.length) {
      throw new AppError("One or more of your selected subjects are currently unavailable. Please update your subjects in your profile.", 400);
    }

    const subjectMap = subjects.reduce((acc, s) => {
      acc[s._id.toString()] = s;
      return acc;
    }, {});

    const hasEnglish = subjects.some(s => s.name?.toLowerCase().includes("english"));
    if (!hasEnglish) {
      throw new AppError("English Language is compulsory for UTME mock tests. Please include English in your subjects.", 400);
    }

    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();
    const sessionAnswers = {};

    // Query 60 questions for English, 40 for other subjects concurrently
    const subjectPromises = mockSubjects.map(async (subjectId) => {
      let questions = [];
      const isEnglish = subjectMap[subjectId.toString()]?.name?.toLowerCase().includes("english");
      const requiredQuestions = isEnglish ? 60 : 40;

      questions = await QuestionPoolService.getRandomQuestionsBySubject(subjectId, requiredQuestions);

      const formattedQuestions = [];
      const localAnswers = {};

      questions.forEach(q => {
        const safeOptions = Array.isArray(q.options)
          ? q.options.map(o => ({ key: o.id || o.key, text: o.text, image: o.image }))
          : [];

        // Save correct answer for fast grading
        const correctOpt = Array.isArray(q.options) ? q.options.find(o => o.isCorrect) : null;
        localAnswers[q._id.toString()] = {
          subjectId: q.subjectId.toString(),
          correctAnswer: correctOpt ? (correctOpt.id || correctOpt.key) : null,
          topic: q.metadata?.topic || "unknown"
        };

        formattedQuestions.push({
          _id: q._id,
          subjectId: q.subjectId,
          subject: {
            _id: q.subjectId,
            name: subjectMap[q.subjectId.toString()] ? subjectMap[q.subjectId.toString()].name : 'Unknown'
          },
          text: q.content?.text || q.text || '',
          content: q.content,
          options: safeOptions,
          metadata: q.metadata,
          passage: q.passageId || null
        });
      });

      return { formattedQuestions, localAnswers };
    });

    const results = await Promise.all(subjectPromises);
    for (const res of results) {
      questionsBySubject.push(...res.formattedQuestions);
      allQuestionIds.push(...res.formattedQuestions.map(q => q._id));
      Object.assign(sessionAnswers, res.localAnswers);
    }



    const uniqueIds = new Set(allQuestionIds.map(id => id.toString()));
    if (uniqueIds.size !== allQuestionIds.length) {
      console.error("[MockTestService] Duplicate Question IDs detected in exam generation.");
      throw new AppError("Exam generation aborted: Duplicate questions detected. Please try again.", 500);
    }

    // Removed Jaccard similarity deduplication from runtime critical path.
    // Deduplication is handled offline by scripts/audit_questions.js to prevent O(N^2) event loop blocking.
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");

    const { calculateExamTime } = await import("../utils/TimeEngine.js");
    const session = await PracticeSessionModel.create({
      userId: user._id,
      subjectIds: mockSubjects,
      isMockTest: true,
      sessionType: "smart-mock",
      sessionStatus: "ACTIVE",
      questionIds: allQuestionIds,
      totalDuration: calculateExamTime({ type: 'smart-mock', questions: [] }),
      questionLimit: allQuestionIds.length
    });

    // Increment mock test usage counter atomically
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'limits.totalMockTests': 1 }
    });

    // Cache correct answers for grading (TTL: 4 hours)
    await redisClient.setEx(`session:${session._id}:answers`, 14400, JSON.stringify(sessionAnswers));

    // Generate Fencing Token and Initialize Session Lock
    const deviceToken = crypto.randomBytes(16).toString('hex');
    await redisClient.setEx(`exam:session:${session._id}`, 14400, JSON.stringify({
      lockOwner: deviceToken,
      version: 1,
      status: "ACTIVE",
      updatedAt: Date.now()
    }));

    return {
      sessionId: session._id,
      questions: questionsBySubject,
      totalDuration: session.totalDuration,
      deviceToken,
      sessionVersion: 1
    };
  }

  static async submitMockTest(user, sessionId, responses, options = {}) {
    const { deviceToken, sessionVersion, finalizationKey, tabSwitches = 0, ipAddress = null, antiCheat = {}, isSweeper } = options;
    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();

    if (!isSweeper && (!deviceToken || !sessionVersion || !finalizationKey)) {
      throw new AppError("Missing strict finalization parameters.", 400);
    }

    if (!isSweeper) {
      // Execute Finalization Lock
      const result = await redisClient.eval(
        LUA_FINALIZE_SCRIPT,
        {
          keys: [`exam:session:${sessionId}`],
          arguments: [deviceToken, sessionVersion.toString(), finalizationKey]
        }
      );

      if (result[0] === "ERR") {
        if (result[1] === "ALREADY_FINALIZING" || result[1] === "SESSION_LOCKED_FINAL") {
          return { status: "ALREADY_FINALIZED", sessionId };
        }
        throw new AppError(`Finalization rejected: ${result[1]}`, 409);
      }
    }

    // Resolve final responses
    let finalResponses = [];
    const progressData = await redisClient.get(`session:${sessionId}:progress`);

    if (progressData) {
      finalResponses = JSON.parse(progressData).responses || [];
    } else if (responses && responses.length > 0) {
      finalResponses = responses;
    } else if (isSweeper) {
      finalResponses = [];
    }

    // Cross-exam penalty tracking
    const violationsCount = antiCheat.violationsCount || tabSwitches || 0;
    if (violationsCount > 0) {
      const userUpdate = await User.findByIdAndUpdate(user._id, {
        $inc: { 'antiCheat.totalViolations': violationsCount }
      }, { new: true });
      
      const total = userUpdate?.antiCheat?.totalViolations || 0;
      let suspensionDate = null;
      if (total >= 10) {
        suspensionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      } else if (total >= 5) {
        suspensionDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }
      
      if (suspensionDate) {
        await User.findByIdAndUpdate(user._id, { 'antiCheat.suspendedUntil': suspensionDate });
      }
    }

    // Push to BullMQ Finalization Queue
    const { addFinalizationJob } = await import("../queues/ExamQueue.js");
    await addFinalizationJob({
      sessionId,
      deviceToken,
      finalizationKey,
      finalResponses,
      options
    });

    try {
      const { addScoreJob } = await import("../queues/GradingQueue.js");
      addScoreJob(user._id, sessionId, finalResponses, options);
    } catch (err) {
      console.warn("Failed to queue score job in mock test:", err.message);
    }

    return {
      message: "Exam submission queued safely.",
      sessionId,
      status: "FINALIZING"
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
        console.error(`Scoring Bug Detected: stats.total (${stats.total}) exceeds actual questions (${expectedTotal}) for subject ${sid} in session ${sessionId}`);
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
    const prevAvg = user.stats?.avgMockScore || 0;
    const newTotal = prevTotal + 1;
    const newAvg = Math.round(((prevAvg * prevTotal) + compositeScore) / newTotal);
    const prevHigh = user.stats?.highestMockScore || 0;

    const UserModel = (await import("../models/UserModel.js")).default;
    await UserModel.findByIdAndUpdate(userId, {
      $set: {
        'stats.totalMocksTaken': newTotal,
        'stats.avgMockScore': newAvg,
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

  static async getActiveSession(user, incomingDeviceToken) {
    const { default: PracticeSessionModel } = await import("../models/PracticeSessionModel.js");
    const { getRedisClient } = await import("../config/redis.js");

    const session = await PracticeSessionModel.findOne({
      userId: user._id,
      isMockTest: true,
      sessionStatus: "ACTIVE"
    }).lean();

    if (!session) return null;

    // We do NOT penalize simple connection drops or refreshes here.
    // Legitimate users with bad network should be allowed to resume.
    // Anti-cheat relies strictly on explicit tabSwitches and focusLosses reported by the client payload.

    const redisClient = await getRedisClient();
    
    // Check Fencing Lock
    const sessionLockRaw = await redisClient.get(`exam:session:${session._id}`);
    let sessionVersion = 1;
    let lockOwner = incomingDeviceToken;
    if (sessionLockRaw) {
      const lockData = JSON.parse(sessionLockRaw);
      if (lockData.lockOwner !== incomingDeviceToken && incomingDeviceToken) {
        throw new AppError("LOCK_MISMATCH", 409);
      }
      sessionVersion = lockData.version;
      lockOwner = lockData.lockOwner;
    }

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

    const questions = await Question.find({ _id: { $in: session.questionIds } }).populate("passageId").lean();
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
        metadata: q.metadata,
        passage: q.passageId || null
      };
    });

    return {
      sessionId: session._id,
      questions: formattedQuestions,
      responses,
      timeRemaining,
      totalDuration: session.totalDuration,
      deviceToken: lockOwner,
      sessionVersion
    };
  }

  static async saveProgress(user, sessionId, responses, timeRemaining, options = {}) {
    const { deviceToken, sessionVersion, idempotencyKey } = options;
    const { getRedisClient } = await import("../config/redis.js");
    const redisClient = await getRedisClient();

    const payloadStr = JSON.stringify({ responses, timeRemaining });
    const idemKeyBase = `exam:session:${sessionId}:idem`;

    if (deviceToken && sessionVersion && idempotencyKey) {
      // Execute atomic Lua script
      const result = await redisClient.eval(
        LUA_FENCING_SCRIPT,
        {
          keys: [`exam:session:${sessionId}`, idemKeyBase],
          arguments: [deviceToken, sessionVersion.toString(), payloadStr, idempotencyKey, Date.now().toString()]
        }
      );

      // result is an array: ["ERR", "REASON"] or ["OK", version, "DUPLICATE" | "NEW"]
      if (result[0] === "ERR") {
        throw new AppError(`Fencing rejected: ${result[1]}`, 409);
      }
      
      const newVersion = result[1];
      const status = result[2];

      if (status === "DUPLICATE") {
        return { version: newVersion, duplicate: true };
      }
      
      await redisClient.setEx(`session:${sessionId}:progress`, 10800, payloadStr);
      return { version: newVersion };
    }

    // TTL matches max exam duration (2 hours) plus 1 hour grace period
    await redisClient.setEx(
      `session:${sessionId}:progress`,
      10800,
      payloadStr
    );
    return { version: sessionVersion };
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
