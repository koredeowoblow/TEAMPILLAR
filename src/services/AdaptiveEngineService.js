
import { userRepository } from "../repository/UserRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import { CONSTANTS } from "../config/constants.js";
import { questionRepository } from "../repository/QuestionRepository.js";
import TopicPerformance from "../models/TopicPerformanceModel.js";
import AIService from "./AIService.js";

class AdaptiveEngineService {
  /**
   * Returns the weighted $match conditions and difficulty range for a given student.
   * Now integrates AI-driven predictive strategy for ultra-personalized adaptation.
   */
  static async buildWeightedPool(userId, subjectId, filters = {}) {
    try {
      let matchStage = { subjectId, ...filters };
      if (!userId) return matchStage;

      const userPerformance = await TopicPerformance.find({ userId, subjectId }).lean();

      if (!userPerformance || userPerformance.length === 0) {
        return matchStage;
      }

      // Try AI-driven adaptation first
      try {
        const strategy = await AIService.predictPracticeStrategy(userId, userPerformance);
        if (strategy && strategy.matchStage) {
          // Merge AI strategy into our match stage
          return { ...matchStage, ...strategy.matchStage };
        }
      } catch (aiError) {
        console.warn("AI Adaptation failed, falling back to rule-based logic:", aiError.message);
      }

      // Fallback: Robust Rule-Based Logic
      const weakTopics = userPerformance.filter(t => t.masteryScore < 40).map(t => String(t.topicId));
      const medTopics = userPerformance.filter(t => t.masteryScore >= 40 && t.masteryScore < CONSTANTS.ADAPTIVE_ENGINE.MASTERY_THRESHOLD).map(t => String(t.topicId));
      const strongTopics = userPerformance.filter(t => t.masteryScore >= CONSTANTS.ADAPTIVE_ENGINE.MASTERY_THRESHOLD).map(t => String(t.topicId));

      const rand = Math.random();
      if (rand < 0.5 && weakTopics.length > 0) {
        matchStage["metadata.topic"] = { $in: weakTopics };
        matchStage["metadata.difficulty"] = { $in: ["easy", "medium"] };
      } else if (rand < 0.8 && medTopics.length > 0) {
        matchStage["metadata.topic"] = { $in: medTopics };
      } else if (strongTopics.length > 0) {
        matchStage["metadata.topic"] = { $in: strongTopics };
        matchStage["metadata.difficulty"] = { $in: ["medium", "hard"] };
      }

      return matchStage;
    } catch (error) {
      throw new Error(`Failed to build weighted pool: ${error.message}`);
    }
  }

  /**
   * Reads in-session responses, adjusts weights, returns updated pool config.
   */
  static async recalculateMidSession(sessionId, userId, subjectId, filters = {}) {
    try {
      const session = await practiceRepository.findById(sessionId, [], { lean: true });
      if (!userId || !session || !session.responses || session.responses.length === 0) {
        return await this.buildWeightedPool(userId, subjectId, filters);
      }

      // Fetch existing performance for these topics
      const topicPerf = await TopicPerformance.find({ userId, subjectId }).lean();

      // Fetch questions to calculate mid-session correctness
      const questionIds = session.responses.map(r => r.questionId);
      const questions = await questionRepository.find({ _id: { $in: questionIds } }, { lean: true, select: "_id metadata.topic options.id options.isCorrect" });
      const questionMap = new Map(questions.map(q => [String(q._id), q]));

      // Live mid-session recalculation of mastery
      for (const r of session.responses) {
        const question = questionMap.get(String(r.questionId));
        if (!question) continue;

        const opt = question.options.find(o => o.id === r.selectedOption);
        const isCorrect = opt ? opt.isCorrect : false;
        const topicStr = question.metadata?.topic;
        if (!topicStr) continue;

        let topicEntry = topicPerf.find(t => String(t.topicId) === topicStr);
        if (topicEntry) {
          topicEntry.totalAttempted += 1;
          if (isCorrect) topicEntry.totalCorrect += 1;
          topicEntry.masteryScore = topicEntry.totalAttempted > 0
            ? (topicEntry.totalCorrect / topicEntry.totalAttempted) * 100
            : 0;
        } else {
          topicPerf.push({
            topicId: topicStr,
            totalAttempted: 1,
            totalCorrect: isCorrect ? 1 : 0,
            masteryScore: isCorrect ? 100 : 0
          });
        }
      }

      let matchStage = { subjectId, ...filters };

      // AI-driven mid-session pivot
      try {
        const strategy = await AIService.predictPracticeStrategy(userId, topicPerf);
        if (strategy && strategy.matchStage) {
          return { ...matchStage, ...strategy.matchStage };
        }
      } catch (aiError) {
        console.warn("Mid-session AI Adaptation failed:", aiError.message);
      }

      // Fallback: Build adjusted match stage using mid-session metrics
      const weakTopics = topicPerf.filter(t => t.masteryScore < 40).map(t => String(t.topicId));
      const medTopics = topicPerf.filter(t => t.masteryScore >= 40 && t.masteryScore < CONSTANTS.ADAPTIVE_ENGINE.MASTERY_THRESHOLD).map(t => String(t.topicId));
      const strongTopics = topicPerf.filter(t => t.masteryScore >= CONSTANTS.ADAPTIVE_ENGINE.MASTERY_THRESHOLD).map(t => String(t.topicId));

      const rand = Math.random();
      if (rand < 0.5 && weakTopics.length > 0) {
        matchStage["metadata.topic"] = { $in: weakTopics };
        matchStage["metadata.difficulty"] = { $in: ["easy", "medium"] };
      } else if (rand < 0.8 && medTopics.length > 0) {
        matchStage["metadata.topic"] = { $in: medTopics };
      } else if (strongTopics.length > 0) {
        matchStage["metadata.topic"] = { $in: strongTopics };
        matchStage["metadata.difficulty"] = { $in: ["medium", "hard"] };
      }

      return matchStage;
    } catch (error) {
      throw new Error(`Failed to recalculate mid-session pool: ${error.message}`);
    }
  }

  /**
   * Upserts the topicPerformance array on the user document.
   */
  static async updateTopicPerformance(userId, sessionResponses, subjectId) {
    try {
      if (!userId || !sessionResponses || sessionResponses.length === 0) return;

      const userExists = await userRepository.findById(userId, { select: "_id", lean: true });
      if (!userExists) return;

      const questionIds = sessionResponses.map(r => r.questionId);
      const questions = await questionRepository.find({ _id: { $in: questionIds } }, { lean: true, select: "_id metadata.topic options.id options.isCorrect" });
      const qMap = new Map(questions.map(q => [String(q._id), q]));

      const currentSessionTopics = {};
      for (const r of sessionResponses) {
        const q = qMap.get(String(r.questionId));
        if (!q) continue;
        const topicStr = q.metadata?.topic;
        if (!topicStr) continue;

        const opt = q.options.find(o => o.id === r.selectedOption);
        const isCorrect = opt ? opt.isCorrect : false;

        if (!currentSessionTopics[topicStr]) {
          currentSessionTopics[topicStr] = { attempted: 0, correct: 0, totalTime: 0 };
        }
        currentSessionTopics[topicStr].attempted += 1;
        if (isCorrect) currentSessionTopics[topicStr].correct += 1;
        currentSessionTopics[topicStr].totalTime += Number(r.timeTaken || 0);
      }

      const topicIds = Object.keys(currentSessionTopics);
      if (topicIds.length === 0) return;

      // Fetch existing topic performance documents in one query
      const existingPerfs = await TopicPerformance.find({ userId, topicId: { $in: topicIds } });
      const perfMap = new Map(existingPerfs.map(p => [p.topicId, p]));

      const savePromises = Object.entries(currentSessionTopics).map(async ([topicStr, stats]) => {
        let doc = perfMap.get(topicStr);
        const sessionAcc = (stats.correct / stats.attempted) * 100;
        const avgTime = stats.totalTime / stats.attempted;

        if (!doc) {
          doc = new TopicPerformance({
            userId,
            topicId: topicStr,
            subjectId,
            totalAttempted: stats.attempted,
            totalCorrect: stats.correct,
            averageTimeSpent: avgTime,
            recentAccuracy: [sessionAcc],
            lastAttemptedAt: new Date(),
          });
        } else {
          const prevTotalTime = doc.averageTimeSpent * doc.totalAttempted;
          doc.subjectId = subjectId;
          doc.totalAttempted += stats.attempted;
          doc.totalCorrect += stats.correct;
          doc.averageTimeSpent = (prevTotalTime + stats.totalTime) / doc.totalAttempted;
          doc.recentAccuracy.push(sessionAcc);
          if (doc.recentAccuracy.length > 5) {
            doc.recentAccuracy = doc.recentAccuracy.slice(-5);
          }
          doc.lastAttemptedAt = new Date();
        }
        doc.masteryScore = doc.totalAttempted > 0 ? (doc.totalCorrect / doc.totalAttempted) * 100 : 0;
        return doc.save();
      });

      await Promise.all(savePromises);
    } catch (error) {
      throw new Error(`Failed to update topic performance: ${error.message}`);
    }
  }
}

export default AdaptiveEngineService;
