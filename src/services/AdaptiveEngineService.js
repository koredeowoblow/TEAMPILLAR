
import { userRepository } from "../repository/UserRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import { CONSTANTS } from "../config/constants.js";
import { questionRepository } from "../repository/QuestionRepository.js";
import TopicPerformance from "../models/TopicPerformanceModel.js";
import mongoose from "mongoose";
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

      const userPerformance = await TopicPerformance.find({ userId, subjectId });

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
      const session = await practiceRepository.findById(sessionId);
      if (!userId || !session || !session.responses || session.responses.length === 0) {
        return await this.buildWeightedPool(userId, subjectId, filters);
      }

      // Fetch existing performance for these topics
      const topicPerf = await TopicPerformance.find({ userId, subjectId });

      // Fetch questions to calculate mid-session correctness
      const questionIds = session.responses.map(r => r.questionId);
      const questions = await questionRepository.find({ _id: { $in: questionIds } });
      const qMap = new Map(questions.map(q => [String(q._id), q]));

      // Live mid-session recalculation of mastery
      for (const r of session.responses) {
        const q = qMap.get(String(r.questionId));
        if (!q) continue;

        const opt = q.options.find(o => o.id === r.selectedOption);
        const isCorrect = opt ? opt.isCorrect : false;
        const topicStr = q.metadata?.topic;
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

      const user = await userRepository.findById(userId);
      if (!user) return;

      const questionIds = sessionResponses.map(r => r.questionId);
      const questions = await questionRepository.find({ _id: { $in: questionIds } });
      const qMap = new Map(questions.map(q => [String(q._id), q]));

      const topicPerfMap = new Map();
      if (user.topicPerformance) {
        user.topicPerformance.forEach(t => topicPerfMap.set(String(t.topicId), t.toObject ? t.toObject() : t));
      }

      for (const r of sessionResponses) {
        const q = qMap.get(String(r.questionId));
        if (!q) continue;

        const opt = q.options.find(o => o.id === r.selectedOption);
        const isCorrect = opt ? opt.isCorrect : false;
        const topicStr = q.metadata?.topic;
        if (!topicStr) continue;

        // topicId is stored as a plain string (topic name from question metadata)
        const topicIdToStore = topicStr;

        let entry = topicPerfMap.get(topicStr);
        if (!entry) {
          entry = {
            topicId: topicIdToStore,
            subjectId: subjectId,
            totalAttempted: 0,
            totalCorrect: 0,
            averageTimeSpent: 0,
            recentAccuracy: [],
            masteryScore: CONSTANTS.ADAPTIVE_ENGINE.DEFAULT_TOPIC_MASTERY
          };
        }

        const prevTotalTime = entry.averageTimeSpent * entry.totalAttempted;
        entry.totalAttempted += 1;
        if (isCorrect) entry.totalCorrect += 1;

        const newTime = Number(r.timeTaken || 0);
        entry.averageTimeSpent = (prevTotalTime + newTime) / entry.totalAttempted;
        entry.lastAttemptedAt = new Date();
        entry.masteryScore = entry.totalAttempted > 0
          ? (entry.totalCorrect / entry.totalAttempted) * 100
          : 0;

        topicPerfMap.set(topicStr, entry);
      }

      // Now calculate recent accuracy (last 5 sessions)
      // Here we can just push the session's overall accuracy for that topic
      // A more precise way is to group by topic in the current session
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

      for (const [topicStr, stats] of Object.entries(currentSessionTopics)) {
        const isCorrect = stats.correct > 0; // Simplified for bulk update
        const avgTime = stats.totalTime / stats.attempted;
        const sessionAcc = (stats.correct / stats.attempted) * 100;

        await TopicPerformance.findOneAndUpdate(
          { userId, topicId: topicStr },
          {
            $set: {
              subjectId,
              lastAttemptedAt: new Date(),
            },
            $inc: {
              totalAttempted: stats.attempted,
              totalCorrect: stats.correct
            },
            $push: {
              recentAccuracy: {
                $each: [sessionAcc],
                $slice: -5
              }
            },
          },
          { upsert: true, new: true }
        ).then(async (updated) => {
          // Recalculate mastery and avg time (Mongoose middleman style or post-update)
          updated.masteryScore = (updated.totalCorrect / updated.totalAttempted) * 100;
          // Simplified avg time update - in real PRD we'd store totalTimeSpent as a field
          await updated.save();
        });
      }
    } catch (error) {
      throw new Error(`Failed to update topic performance: ${error.message}`);
    }
  }
}

export default AdaptiveEngineService;
