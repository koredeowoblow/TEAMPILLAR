import PracticeSession from "../models/PracticeSessionModel.js";
import TopicPerformance from "../models/TopicPerformanceModel.js";
import User from "../models/UserModel.js";
import Question from "../models/QuestionModel.js";
import UserAnalytics from "../models/UserAnalyticsModel.js";
import AIService from "../services/AIService.js";
import { logger } from "../core/logger.js";
import { Queue, Worker } from "bullmq";
import "../config/env.js";

import { sharedQueueConnection, connectionConfig } from "../config/bullmqConnection.js";

export const analyticsQueue = new Queue("analytics", { connection: sharedQueueConnection });

analyticsQueue.on("error", (err) => {
  logger.warn(`[BullMQ] analyticsQueue error: ${err.message}`);
});

function addAnalyticsJob(userId, sessionId) {
  // Using jobId based on userId ensures we don't have duplicate analytics jobs running concurrently for the same user
  analyticsQueue.add("analytics.process", { userId, sessionId }, {
    jobId: `analytics-${userId}`,
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }
  }).catch((err) => {
    logger.error(`Failed to queue analytics job for user ${userId}:`, { error: err.message });
  });
  logger.info(`Queued analytics job for user ${userId}, session ${sessionId}.`);
}

export const analyticsWorker = new Worker("analytics", async (job) => {
  logger.info(`Processing analytics job for user ${job.data.userId}...`);

  try {
    const { userId } = job.data;
    
    // 1. Fetch user & target score
    const user = await User.findById(userId).lean();
    if (!user) {
      logger.warn(`User ${userId} not found, skipping job.`);
      return;
    }
    const targetScore = user.onboarding?.targetScore || 280;

    // 2 & 3. Calculate overview metrics using Aggregation
    const objectId = new mongoose.Types.ObjectId(userId);
    const aggResult = await PracticeSession.aggregate([
      { $match: { userId: objectId, sessionStatus: "COMPLETED" } },
      { 
        $group: { 
          _id: null, 
          totalSessions: { $sum: 1 }, 
          avgScore: { $avg: "$score" }, 
          overallAccuracy: { $avg: "$analytics.accuracy" } 
        } 
      }
    ]);

    if (!aggResult || aggResult.length === 0) {
      logger.info(`No completed sessions for user ${userId}, skipping job.`);
      return;
    }

    const totalSessions = aggResult[0].totalSessions || 0;
    const avgScore = aggResult[0].avgScore || 0;
    const overallAccuracy = aggResult[0].overallAccuracy || 0;

    // 4. Fetch TopicPerformance
    const performances = await TopicPerformance.find({ userId }).lean();
    
    // Group subtopic errors from last 30 sessions
    const recentSessions = await PracticeSession.find({ userId, sessionStatus: "COMPLETED" })
      .sort({ createdAt: -1 })
      .limit(30)
      .select("responses.questionId responses.selectedOption")
      .lean();
      
    const incorrectQuestionIds = [];
    for (const session of recentSessions) {
      if (!session.responses) continue;
      for (const resp of session.responses) {
        const qId = resp.questionId?._id || resp.questionId?.id || resp.questionId;
        if (qId) {
          incorrectQuestionIds.push({
            questionId: qId,
            selectedOption: resp.selectedOption
          });
        }
      }
    }

    let incorrectSubTopicsMap = {};
    if (incorrectQuestionIds.length > 0) {
      const qIds = incorrectQuestionIds.map(x => x.questionId);
      const questions = await Question.find(
        { _id: { $in: qIds } },
        { "options": 1, "metadata.topic": 1, "metadata.subTopic": 1 }
      ).lean();
      const questionsMap = new Map(questions.map(q => [String(q._id), q]));

      for (const item of incorrectQuestionIds) {
        const q = questionsMap.get(String(item.questionId));
        if (!q) continue;

        const correctOption = q.options?.find(o => o.isCorrect)?.id;
        const selected = item.selectedOption;

        if (selected && selected !== correctOption) {
          const topic = q.metadata?.topic;
          const subTopic = q.metadata?.subTopic;
          if (topic && subTopic) {
            if (!incorrectSubTopicsMap[topic]) {
              incorrectSubTopicsMap[topic] = {};
            }
            incorrectSubTopicsMap[topic][subTopic] = (incorrectSubTopicsMap[topic][subTopic] || 0) + 1;
          }
        }
      }
    }

    // Prepare topic metrics to send to AI
    const topicMetrics = performances.map(perf => {
      const topicName = perf.topicId;
      const attempted = perf.totalAttempted || 0;
      const correct = perf.totalCorrect || 0;
      const incorrect = Math.max(0, attempted - correct);
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const averageTime = Math.round(perf.averageTimeSpent || 0);

      const subTopicCounts = incorrectSubTopicsMap[topicName] || {};
      const topicsToReview = Object.entries(subTopicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([sub]) => sub);

      if (topicsToReview.length === 0) {
        topicsToReview.push(`${topicName} Core Concepts`);
      }

      return {
        topic: topicName,
        accuracy,
        attempted,
        correct,
        incorrect,
        averageTime,
        topicsToReview
      };
    });

    // 5. Call AI
    const systemPrompt = `You are an expert psychometric analyst and learning designer for the UTME (JAMB) exam in Nigeria.
Your task is to analyze the student's practice session data and generate a JSON strategic analysis.
You MUST output a valid JSON object matching the schema below. Do not wrap your response in markdown code blocks.

JSON Schema:
{
  "tips": "A detailed, multi-paragraph strategic recommendation (3-4 paragraphs, written in markdown) explaining their overall learning velocity, exam readiness, pacing, and core suggestions for improvement. Address the student directly.",
  "focusAreas": [
    {
      "topic": "Topic Name",
      "accuracy": 45,
      "attempted": 20,
      "correct": 9,
      "incorrect": 11,
      "averageTime": 42,
      "topicsToReview": ["Subtopic A", "Subtopic B"],
      "commonWeakness": "A single sentence explaining their conceptual bottleneck.",
      "recommendation": "A specific practice action item (e.g. 'Solve 15 questions on this topic').",
      "estimatedScoreGain": 12
    }
  ],
  "priorityRecommendations": [
    {
      "priority": 1,
      "topic": "Topic Name",
      "reason": "Explain in one sentence why this topic is the highest priority for score improvement.",
      "potentialGain": "+12 marks",
      "recommendedQuestionCount": 15
    }
  ]
}`;

    const userPrompt = `### STUDENT METRICS:
- Target Score: ${targetScore}
- Total Practice Sessions: ${totalSessions}
- Average Score: ${Math.round(avgScore)}%
- Overall Accuracy: ${Math.round(overallAccuracy)}%
- Topic Performance: ${JSON.stringify(topicMetrics.slice(0, 8))}

Please generate the tips, fill in the AI-generated fields for the focusAreas (commonWeakness, recommendation, estimatedScoreGain), and rank the top 3 priorityRecommendations. Make sure estimatedScoreGain values are numbers representing marks (max 25).`;

    const aiResponse = await AIService._callAIWithFallback([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], {
      max_tokens: 1500,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    if (aiResponse && aiResponse.content) {
      let parsed;
      try {
        const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.content);
      } catch (jsonErr) {
        logger.error(`Failed to parse JSON response from AI: ${jsonErr.message}`, { content: aiResponse.content });
        throw jsonErr;
      }

      if (parsed && parsed.tips) {
        // Save back to UserAnalytics model
        await UserAnalytics.findOneAndUpdate(
          { userId },
          {
            tips: parsed.tips,
            focusAreas: parsed.focusAreas || [],
            priorityRecommendations: parsed.priorityRecommendations || []
          },
          { upsert: true, new: true }
        );
        logger.info(`Successfully processed analytics for user ${userId} and updated UserAnalytics collection.`);
      }
    } else {
      // Fallback: Generate programmatically without AI
      logger.warn(`AI recommendations failed for user ${userId}. Using programmatic fallback.`);
      const fallbackFocusAreas = topicMetrics.slice(0, 5).map(item => ({
        ...item,
        commonWeakness: `Focus on reinforcing foundational formulas in ${item.topic}.`,
        recommendation: `Complete a set of ${item.accuracy < 40 ? 25 : 15} questions in ${item.topic}.`,
        estimatedScoreGain: item.accuracy < 50 ? 15 : 8
      }));
      
      const fallbackPriorityRecommendations = fallbackFocusAreas
        .filter(f => f.accuracy < 75)
        .sort((a, b) => b.estimatedScoreGain - a.estimatedScoreGain || a.accuracy - b.accuracy)
        .slice(0, 3)
        .map((item, idx) => ({
          priority: idx + 1,
          topic: item.topic,
          reason: `${item.accuracy}% accuracy over ${item.attempted} attempts indicates significant room for mastery.`,
          potentialGain: `+${item.estimatedScoreGain} marks`,
          recommendedQuestionCount: item.accuracy < 40 ? 25 : 15
        }));

      await UserAnalytics.findOneAndUpdate(
        { userId },
        {
          tips: `### Study Strategy\n\nYour current average score is **${Math.round(avgScore)}%** with an overall accuracy of **${Math.round(overallAccuracy)}%**. Focus on practicing topics with lower accuracy to optimize your overall score velocity.`,
          focusAreas: fallbackFocusAreas,
          priorityRecommendations: fallbackPriorityRecommendations
        },
        { upsert: true, new: true }
      );
      logger.info(`Successfully wrote fallback analytics for user ${userId}.`);
    }

  } catch (error) {
    logger.error(`Error processing analytics job for user ${job.data.userId}: ${error.message}`);
    throw error; // Throw so BullMQ can retry
  }
}, { 
  connection: sharedQueueConnection,
  concurrency: 5 // Rate limit Groq API concurrency
});

analyticsWorker.on("error", (err) => {
  logger.warn(`[BullMQ] analyticsWorker connection error: ${err.message}`);
});

analyticsWorker.on('failed', (job, err) => {
  logger.error(`Analytics job ${job?.id} failed: ${err.message}`);
});

logger.info("Analytics BullMQ worker initialized");

export { addAnalyticsJob };
