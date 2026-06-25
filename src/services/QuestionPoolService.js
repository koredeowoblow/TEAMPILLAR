import mongoose from "mongoose";
import { getRedisClient } from "../config/redis.js";
import Question from "../models/QuestionModel.js";
import { logger } from "../core/logger.js";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

class QuestionPoolService {
  /**
   * Rebuilds the Redis question ID sets for a given subject.
   */
  static async rebuildSubjectPool(subjectId) {
    const redis = await getRedisClient();
    if (!redis) return;

    try {
      const subjectStr = subjectId.toString();
      const questions = await Question.find({ subjectId: subjectStr, isQuarantined: { $ne: true } })
        .select("_id metadata.topic metadata.difficulty")
        .lean();

      if (questions.length === 0) return;

      const mainKey = `questions:subject:${subjectStr}`;
      const easyKey = `questions:subject:${subjectStr}:easy`;
      const medKey = `questions:subject:${subjectStr}:medium`;
      const hardKey = `questions:subject:${subjectStr}:hard`;

      const pipeline = redis.multi();
      
      // Clear old sets
      pipeline.del([mainKey, easyKey, medKey, hardKey]);
      
      const topicSets = {};

      for (const q of questions) {
        const id = q._id.toString();
        pipeline.sAdd(mainKey, id);
        
        if (q.metadata?.difficulty === "easy") pipeline.sAdd(easyKey, id);
        else if (q.metadata?.difficulty === "hard") pipeline.sAdd(hardKey, id);
        else pipeline.sAdd(medKey, id); // Default medium
        
        if (q.metadata?.topic) {
          const topicKey = `questions:subject:${subjectStr}:topic:${q.metadata.topic}`;
          if (!topicSets[topicKey]) {
            topicSets[topicKey] = [];
            pipeline.del(topicKey);
          }
          topicSets[topicKey].push(id);
        }
      }

      for (const [key, ids] of Object.entries(topicSets)) {
        if (ids.length > 0) pipeline.sAdd(key, ids);
      }

      await pipeline.exec();
      logger.info(`Rebuilt Redis question pool for subject ${subjectStr}. Total: ${questions.length}`);
    } catch (err) {
      logger.error("Failed to rebuild subject pool in Redis:", err);
    }
  }

  /**
   * Rebuilds all pools across all subjects.
   */
  static async rebuildAllPools() {
    const subjects = await Question.distinct("subjectId");
    for (const sub of subjects) {
      await this.rebuildSubjectPool(sub);
    }
  }

  static _pendingFetches = new Map();

  /**
   * Fetches multiple full question documents using Redis Cache-Aside and deduplication lock.
   */
  static async getQuestionDocuments(questionIds) {
    if (!questionIds || questionIds.length === 0) return [];

    const redis = await getRedisClient();
    if (!redis) {
      return Question.find({ _id: { $in: questionIds } }).populate("passageId").lean();
    }

    let cachedDocs = [];
    try {
      const keys = questionIds.map(id => `question:${id}`);
      cachedDocs = await redis.mGet(keys);
    } catch (redisErr) {
      logger.error("Redis MGET failed, falling back to Mongo directly:", redisErr);
      return Question.find({ _id: { $in: questionIds } }).lean();
    }
    
    const results = [];
    const missingIds = [];
    
    for (let i = 0; i < cachedDocs.length; i++) {
      if (cachedDocs[i]) {
        results.push(JSON.parse(cachedDocs[i]));
      } else {
        missingIds.push(questionIds[i]);
      }
    }

    if (missingIds.length > 0) {
      // De-duplicate concurrent requests for the same missing IDs (Stampede Protection)
      const fetchKey = missingIds.sort().join(',');
      
      if (this._pendingFetches.has(fetchKey)) {
        const docs = await this._pendingFetches.get(fetchKey);
        return results.concat(docs);
      }

      const fetchPromise = (async () => {
        try {
          const dbQuestions = await Question.find({ _id: { $in: missingIds } }).populate("passageId").lean();
          
          if (dbQuestions.length > 0) {
            const pipeline = redis.multi();
            for (const q of dbQuestions) {
              pipeline.setEx(`question:${q._id}`, CACHE_TTL_SECONDS, JSON.stringify(q));
            }
            await pipeline.exec();
          }
          return dbQuestions;
        } finally {
          this._pendingFetches.delete(fetchKey);
        }
      })();

      this._pendingFetches.set(fetchKey, fetchPromise);
      const dbQuestions = await fetchPromise;
      results.push(...dbQuestions);
    }

    return results;
  }

  /**
   * Returns N random question documents for a subject, bypassing MongoDB $sample.
   * Enforces 30% Easy, 50% Medium, 20% Hard ratio if possible.
   */
  static async getRandomQuestionsBySubject(subjectId, limit) {
    const redis = await getRedisClient();
    if (!redis) {
      // Fallback to mongo if Redis is dead
      return Question.aggregate([
        { $match: { subjectId: subjectId, isQuarantined: { $ne: true } } },
        { $sample: { size: limit } }
      ]);
    }

    const key = `questions:subject:${subjectId.toString()}`;
    const easyKey = `${key}:easy`;
    const medKey = `${key}:medium`;
    const hardKey = `${key}:hard`;

    let ids = [];
    try {
      // Attempt ratio selection first
      const limitEasy = Math.ceil(limit * 0.3);
      const limitMed = Math.ceil(limit * 0.5);
      const limitHard = limit - limitEasy - limitMed;

      const [easyIds, medIds, hardIds] = await Promise.all([
        redis.sRandMemberCount(easyKey, limitEasy),
        redis.sRandMemberCount(medKey, limitMed),
        redis.sRandMemberCount(hardKey, limitHard)
      ]);

      ids = [...(easyIds || []), ...(medIds || []), ...(hardIds || [])];

      if (ids.length < limit) {
        // Fallback to pool if difficulty ratio lacks questions
        ids = await redis.sRandMemberCount(key, limit);
      }

      if (!ids || ids.length === 0) {
        await this.rebuildSubjectPool(subjectId);
        ids = await redis.sRandMemberCount(key, limit);
      }
    } catch (redisErr) {
      logger.error("Redis SRANDMEMBER failed, falling back to Mongo directly:", redisErr);
      return this.fallbackMongoSample(subjectId, null, limit);
    }

    if (!ids || ids.length === 0) {
      return this.fallbackMongoSample(subjectId, null, limit);
    }

    return this.getQuestionDocuments(ids);
  }

  /**
   * Gets random questions filtered by topic, using Mongo $sample as fallback.
   */
  static async getRandomQuestionsByTopic(subjectId, topic, limit) {
    const redis = await getRedisClient();
    if (!redis) return this.fallbackMongoSample(subjectId, topic, limit);

    const key = `questions:subject:${subjectId.toString()}:topic:${topic}`;
    const ids = await redis.sRandMemberCount(key, limit);

    if (!ids || ids.length === 0) {
      return this.fallbackMongoSample(subjectId, topic, limit);
    }
    return this.getQuestionDocuments(ids);
  }
  
  /**
   * Gets random questions supporting topic and difficulty filters.
   */
  static async getRandomFilteredQuestions(subjectId, filters = {}, limit) {
    const redis = await getRedisClient();
    if (!redis || typeof filters.topic === 'object' || typeof filters.difficulty === 'object') {
      return this.fallbackMongoSample(subjectId, filters.topic, limit);
    }

    const subjectStr = subjectId.toString();
    const setsToIntersect = [];

    if (filters.topic) {
      setsToIntersect.push(`questions:subject:${subjectStr}:topic:${filters.topic}`);
    }
    if (filters.difficulty) {
      setsToIntersect.push(`questions:subject:${subjectStr}:${filters.difficulty}`);
    }

    try {
      if (setsToIntersect.length === 0) {
        return this.getRandomQuestionsBySubject(subjectId, limit);
      } else if (setsToIntersect.length === 1) {
        const ids = await redis.sRandMemberCount(setsToIntersect[0], limit);
        if (!ids || ids.length === 0) return this.fallbackMongoSample(subjectId, filters.topic, limit);
        return this.getQuestionDocuments(ids);
      } else {
        const allIds = await redis.sInter(setsToIntersect);
        if (!allIds || allIds.length === 0) return this.fallbackMongoSample(subjectId, filters.topic, limit);
        
        // Fisher-Yates Shuffle
        for (let i = allIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
        }
        const selectedIds = allIds.slice(0, limit);
        return this.getQuestionDocuments(selectedIds);
      }
    } catch (redisErr) {
      logger.error("Redis filter intersection failed, falling back to Mongo:", redisErr);
      return this.fallbackMongoSample(subjectId, filters.topic, limit);
    }
  }

  static async fallbackMongoSample(subjectId, topic, limit) {
    const matchQuery = { subjectId: new mongoose.Types.ObjectId(subjectId), isQuarantined: { $ne: true } };
    if (topic) matchQuery["metadata.topic"] = topic;
    
    // Completely remove $sample to prevent Mongo CPU exhaustion during Redis outages.
    // Fetch a slightly larger block using fast IXSCAN and shuffle in memory.
    const dbLimit = Math.max(limit * 3, 50);
    const questions = await Question.find(matchQuery).populate("passageId").limit(dbLimit).lean();

    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    
    return questions.slice(0, limit);
  }
}

export default QuestionPoolService;
