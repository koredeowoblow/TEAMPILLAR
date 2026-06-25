import { questionRepository } from "../repository/QuestionRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import TopicPerformance from "../models/TopicPerformanceModel.js";
import Subject from "../models/SubjectModel.js";
import { AI_MODELS } from "../config/aiModels.js";
import Groq from "groq-sdk";
import { logger } from "../core/logger.js";
import mongoose from "mongoose";
import QuestionPoolService from "./QuestionPoolService.js";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

class SmartMockService {
  /**
   * PURE LOGIC LAYER: Filters the question pool based on student performance.
   */
  static async getFilteredPool(userId, subjectId, userPerformance, limit = 20) {
    try {
      // 1. Identify weak topics (accuracy < 60%)
      const weakTopics = userPerformance
        .filter(t => t.masteryScore < 60)
        .map(t => t.topicId);

      // 2. Determine baseline difficulty based on recent failures
      let targetDifficulty = ["medium"];
      
      const lastSession = await practiceRepository.find(
        { userId, subjectId, sessionStatus: "COMPLETED" },
        { sort: { createdAt: -1 }, limit: 1, lean: true, select: "analytics.accuracy" }
      );

      if (lastSession && lastSession.length > 0 && lastSession[0].analytics.accuracy < 50) {
        targetDifficulty = ["easy", "medium"];
      } else if (lastSession && lastSession.length > 0 && lastSession[0].analytics.accuracy > 75) {
        targetDifficulty = ["medium", "hard"];
      }

      // 3. Build match stage
      const safeSubjectId = new mongoose.Types.ObjectId(subjectId);
      const matchStage = {
        subjectId: safeSubjectId,
      };

      if (weakTopics.length > 0) {
        matchStage["metadata.topic"] = { $in: weakTopics };
      }

      matchStage["metadata.difficulty"] = { $in: targetDifficulty };

      // 4. Exclude questions seen in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const seenAgg = await practiceRepository.aggregate([
        { $match: { userId, createdAt: { $gte: sevenDaysAgo } } },
        { $project: { "responses.questionId": 1 } },
        { $unwind: "$responses" },
        { $group: { _id: "$responses.questionId" } }
      ]);
      const seenIdSet = seenAgg.map(s => new mongoose.Types.ObjectId(s._id));

      if (seenIdSet.length > 0) {
        matchStage._id = { $nin: seenIdSet };
      }

      // 5. Retrieve candidate questions from Redis
      const poolSize = Math.max(Number(limit) * 2, 30);
      let pool = [];

      if (weakTopics.length > 0) {
        // Fetch from weak topics
        const promises = weakTopics.map(t => QuestionPoolService.getRandomQuestionsByTopic(subjectId, t, Math.ceil(poolSize / weakTopics.length)));
        const results = await Promise.all(promises);
        pool = results.flat();
      }

      if (pool.length < poolSize) {
        // Fill the rest with general subject questions
        const extra = await QuestionPoolService.getRandomQuestionsBySubject(subjectId, poolSize - pool.length);
        pool = pool.concat(extra);
      }

      // 6. Filter out seen questions in Node
      if (seenIdSet.length > 0) {
        const seenStrSet = new Set(seenIdSet.map(id => id.toString()));
        pool = pool.filter(q => !seenStrSet.has(q._id.toString()));
      }

      // 7. PASS 2 Fallback: If pool is smaller than limit after filtering, fetch MORE questions ignoring seenIdSet
      if (pool.length < limit) {
        const needed = limit - pool.length;
        // Fetch up to 2x needed to ensure we can get unique ones
        const extra = await QuestionPoolService.getRandomQuestionsBySubject(subjectId, needed * 2);
        const currentPoolSet = new Set(pool.map(q => q._id.toString()));
        
        for (const q of extra) {
          if (!currentPoolSet.has(q._id.toString())) {
            pool.push(q);
            currentPoolSet.add(q._id.toString());
            if (pool.length >= limit) break;
          }
        }
      }

      // 8. PASS 3 Ultimate DB Fallback: Directly from DB if still insufficient
      if (pool.length < limit) {
        const needed = limit - pool.length;
        const dbQuestions = await questionRepository.find({
          subjectId: safeSubjectId,
          _id: { $nin: pool.map(q => new mongoose.Types.ObjectId(q._id)) },
          isQuarantined: { $ne: true }
        }, { lean: true, limit: needed });
        pool = pool.concat(dbQuestions);
      }

      return pool;
    } catch (error) {
      logger.error("SmartMock Filtering Failed", { error: error.message });
      throw error;
    }
  }

  /**
   * GROQ AI LAYER: Re-ranks and selects the best questions.
   */
  static async selectWithAI(userId, subjectId, pool, userPerformance, limit = 20) {
    const targetLimit = Number(limit) || 20;
    if (!groq || pool.length === 0) return pool.slice(0, targetLimit);

    try {
      const weakTopicsData = userPerformance
        .filter(t => t.masteryScore < 60)
        .map(t => ({ topic: t.topicId, accuracy: Math.round(t.masteryScore) }));

      const systemPrompt = `You are an adaptive exam engine for a UTME preparation platform. You receive a student's weak topic performance data and a filtered pool of questions. Your job is to select the most effective questions for the student's next practice session. Return ONLY a JSON object with a single key 'questionIds' containing an array of question ID strings.`;

      const userPrompt = `Student performance summary:
${subjectId}: weak topics are ${weakTopicsData.map(t => t.topic).join(", ")} with accuracy ${Math.round(weakTopicsData.reduce((acc, curr) => acc + curr.accuracy, 0) / (weakTopicsData.length || 1))}%

Filtered question pool:
${JSON.stringify(pool.map(q => ({ _id: q._id, topic: q.metadata?.topic, difficulty: q.metadata?.difficulty })))}

Select the best ${targetLimit} questions that will most effectively target this student's gaps. Return only the array of _id values.`;

      const response = await groq.chat.completions.create({
        model: AI_MODELS.PRIMARY,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);
      
      const selectedIds = parsed.questionIds;
      
      let finalQuestions = [];
      if (Array.isArray(selectedIds)) {
        // Deduplicate IDs the AI may have repeated before mapping to pool questions
        const uniqueIds = Array.from(new Set(selectedIds.map(String)));
        finalQuestions = uniqueIds
          .map(id => pool.find(q => String(q._id) === String(id)))
          .filter(Boolean)
          .slice(0, targetLimit);
      }

      // Bulletproof fallback: If AI didn't select enough questions, fill from the filtered pool
      if (finalQuestions.length < targetLimit) {
        const selectedSet = new Set(finalQuestions.map(q => String(q._id)));
        const additional = pool.filter(q => !selectedSet.has(String(q._id)));
        finalQuestions = finalQuestions.concat(additional).slice(0, targetLimit);
      }

      return finalQuestions;
    } catch (error) {
      logger.warn("SmartMock AI Re-ranking Failed, falling back to logic results", { error: error.message });
      return pool.slice(0, targetLimit);
    }
  }

  /**
   * Orchestrates the full hybrid selection process.
   */
  static async generateSmartMock(userId, subjectId, limit = 20, subjectIds = []) {
    const ids = Array.isArray(subjectIds) && subjectIds.length > 0 ? subjectIds : [subjectId];
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId");
    }

    const safeUserId = new mongoose.Types.ObjectId(userId);
    
    // Multi-subject support for smart mock: Fetch full limit for EACH subject
    let allSelected = [];

    const subjectDocs = await Subject.find({ _id: { $in: ids } }).lean();
    const subjectNameMap = {};
    subjectDocs.forEach(d => { subjectNameMap[String(d._id)] = d.name; });

    const subjectPromises = ids.map(async (currentId) => {
      if (!mongoose.Types.ObjectId.isValid(currentId)) return [];
      
      const safeSubjectId = new mongoose.Types.ObjectId(currentId);
      const currentLimit = Number(limit);

      const totalAvailableQuestions = await questionRepository.count({ subjectId: safeSubjectId });
      const actualLimit = Math.min(Number(currentLimit), totalAvailableQuestions);

      const userPerformance = await TopicPerformance.find({ userId: safeUserId, subjectId: safeSubjectId }).lean();
      const pool = await this.getFilteredPool(safeUserId, safeSubjectId, userPerformance, actualLimit);
      const selected = await this.selectWithAI(safeUserId, safeSubjectId, pool, userPerformance, actualLimit);
      
      // Attach subject name
      return selected.map(q => ({
        ...q,
        subjectName: subjectNameMap[String(currentId)] || "Subject"
      }));
    });

    const results = await Promise.all(subjectPromises);
    for (const res of results) {
      allSelected = allSelected.concat(res);
    }

    return allSelected;
  }
}

export default SmartMockService;
