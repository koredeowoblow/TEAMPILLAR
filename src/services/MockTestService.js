import mongoose from "mongoose";
import { PracticeSession } from "../models/PracticeSessionModel.js";
import User from "../models/UserModel.js";
import Question from "../models/QuestionModel.js";
import Subject from "../models/SubjectModel.js";
import { AppError } from "../utils/AppError.js";

class MockTestService {
  static async startMockTest(user) {
    // Validate 4 subjects selected
    if (!user.selectedSubjects || user.selectedSubjects.length !== 4) {
      throw new AppError("Please complete your subject combination before taking a mock test", 400);
    }

    // Check freemium limits
    const totalMocks = user.limits?.totalMockTests || 0;
    if (user.subscription === "free" && totalMocks >= 3) {
      throw new AppError("Free users are limited to 3 mock tests. Upgrade to Pro for unlimited.", 403);
    }

    const questionsBySubject = [];
    const allQuestionIds = [];

    const subjects = await Subject.find({ _id: { $in: user.selectedSubjects } }).lean();
    const subjectMap = subjects.reduce((acc, s) => {
      acc[s._id.toString()] = s;
      return acc;
    }, {});

    // Query 40 questions per subject
    for (const subjectId of user.selectedSubjects) {
      const questions = await Question.aggregate([
        { $match: { subjectId: new mongoose.Types.ObjectId(subjectId), "metadata.difficulty": { $in: ["easy", "medium", "hard"] } } },
        { $sample: { size: 40 } }
      ]);
      
      const formattedQuestions = questions.map(q => {
        const { isCorrect, ...optionsWithoutCorrect } = q.options || {}; 
        const safeOptions = Array.isArray(q.options) 
          ? q.options.map(o => ({ key: o.key, text: o.text, image: o.image })) 
          : [];

        return {
          _id: q._id,
          subjectId: q.subjectId,
          subject: {
            _id: q.subjectId,
            name: subjectMap[q.subjectId.toString()] ? subjectMap[q.subjectId.toString()].name : 'Unknown'
          },
          content: q.content,
          text: q.text,
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
      subjectIds: user.selectedSubjects,
      isMockTest: true,
      sessionType: "smart-mock", 
      sessionStatus: "ACTIVE",
      questionIds: allQuestionIds,
      totalDuration: 7200,
      questionLimit: allQuestionIds.length
    });

    // Increment limits
    if (!user.limits) user.limits = {};
    user.limits.totalMockTests = (user.limits.totalMockTests || 0) + 1;
    await user.save();

    return {
      sessionId: session._id,
      questions: questionsBySubject
    };
  }

  static async submitMockTest(user, sessionId, responses) {
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

    for (const r of responses) {
      const q = questionMap[r.questionId];
      if (!q) continue;

      const sid = q.subjectId.toString();
      if (subjectScoresMap[sid]) {
        subjectScoresMap[sid].total += 1;
      }

      let isCorrect = false;
      const correctOption = Array.isArray(q.options) ? q.options.find(o => o.isCorrect) : null;
      if (correctOption && (correctOption.key === r.selectedOption || correctOption.text === r.selectedOption)) {
        isCorrect = true;
        if (subjectScoresMap[sid]) subjectScoresMap[sid].correct += 1;
      }

      processedResponses.push({
        questionId: r.questionId,
        selectedOption: r.selectedOption,
        timeTaken: r.timeTaken || 0,
        isCorrect, 
        correctAnswer: correctOption ? correctOption.key : null,
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

    session.sessionStatus = "COMPLETED";
    session.responses = processedResponses;
    session.compositeScore = compositeScore;
    session.subjectScores = subjectScores;
    session.score = compositeScore;
    session.endTime = new Date();
    await session.save();

    // Update user stats
    if (!user.stats) user.stats = {};
    const previousTotalMocks = user.stats.totalMocksTaken || 0;
    const previousAvg = user.stats.avgMockScore || 0;

    user.stats.totalMocksTaken = previousTotalMocks + 1;
    user.stats.highestMockScore = Math.max(user.stats.highestMockScore || 0, compositeScore);
    user.stats.avgMockScore = Math.round(((previousAvg * previousTotalMocks) + compositeScore) / user.stats.totalMocksTaken);

    await user.save();

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
