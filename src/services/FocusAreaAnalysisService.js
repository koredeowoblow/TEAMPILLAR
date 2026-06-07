import TopicPerformance from "../models/TopicPerformanceModel.js";
import TopicInsight from "../models/TopicInsightModel.js";
import PracticeSession from "../models/PracticeSessionModel.js";
import Question from "../models/QuestionModel.js";
import AIService from "./AIService.js";
import { logger } from "../core/logger.js";

class FocusAreaAnalysisService {
  /**
   * Fetches Focus Areas, calculating metrics programmatically and resolving
   * AI-generated insights via a 7-day database cache (invalidated by new attempts).
   */
  static async getOrCreateFocusAreas(userId) {
    if (!userId) return [];

    // 1. Fetch user's TopicPerformance records
    const performances = await TopicPerformance.find({ userId }).lean();
    if (!performances || performances.length === 0) {
      return [];
    }

    // 2. Programmatically identify Weak Concepts (subTopics) from user's incorrect responses
    const sessions = await PracticeSession.find({ userId, sessionStatus: "COMPLETED" }).lean();
    const incorrectQuestionIds = [];
    for (const session of sessions) {
      if (!session.responses) continue;
      for (const resp of session.responses) {
        // Find incorrect ones
        const qId = resp.questionId?._id || resp.questionId?.id || resp.questionId;
        if (qId) {
          // Check correctness:
          // Since session response doesn't store isCorrect in DB directly, we check accuracy/mistakes
          // or we can cross-reference with the Question's correct options.
          // To be safe and highly performant, we find all questions in these sessions
          // and see if the selectedOption matches the correct option.
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

    const focusAreas = [];

    // Sort performances so weaker topics (lower masteryScore) come first
    const sortedPerformances = [...performances].sort((a, b) => (a.masteryScore || 0) - (b.masteryScore || 0));

    // Limit to top 5 weak focus areas for detail tracking
    const targetPerformances = sortedPerformances.slice(0, 5);

    for (const perf of targetPerformances) {
      const topicName = perf.topicId;
      if (!topicName) continue;

      const attempted = perf.totalAttempted || 0;
      const correct = perf.totalCorrect || 0;
      const incorrect = Math.max(0, attempted - correct);
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const averageTime = Math.round(perf.averageTimeSpent || 0);

      // Get programmatic weak subtopics (Weak Concepts)
      const subTopicCounts = incorrectSubTopicsMap[topicName] || {};
      const topicsToReview = Object.entries(subTopicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([sub]) => sub);

      // If no subtopics missed yet, add a general concept placeholder
      if (topicsToReview.length === 0) {
        topicsToReview.push(`${topicName} Core Concepts`);
      }

      // Check cache for AI Insights
      let insight = await TopicInsight.findOne({ userId, topic: topicName });
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const isCacheExpired = insight && insight.generatedAt < sevenDaysAgo;
      const isNewAttemptSinceInsight = insight && perf.lastAttemptedAt && perf.lastAttemptedAt > insight.generatedAt;
      const needsRegeneration = !insight || isCacheExpired || isNewAttemptSinceInsight;

      let aiAnalysis = {
        commonWeakness: `Difficulty applying formula/core concepts in ${topicName}.`,
        recommendation: `Complete a practice set of 15 questions in ${topicName}.`,
        estimatedScoreGain: accuracy < 50 ? 15 : 8
      };

      if (needsRegeneration) {
        try {
          const systemPrompt = `You are a UTME (JAMB) learning experience designer analyzing a student's weak topic.
You must return a valid JSON object with educational diagnostics and recommendations.
Do NOT wrap your JSON response in markdown blocks like \`\`\`json. Output raw JSON only.

Your response MUST be a single valid JSON object containing exactly the following keys:
{
  "commonWeakness": "A single sentence explaining the conceptual weakness (e.g. 'Struggling to relate voltage and current in series circuits').",
  "recommendation": "A specific practice action (e.g. 'Complete 15 practice questions focused on Ohm\\'s Law formula').",
  "estimatedScoreGain": 12
}`;

          const userPrompt = `### INPUT METRICS:
TOPIC: "${topicName}"
ACCURACY: ${accuracy}%
ATTEMPTED: ${attempted} questions
CORRECT: ${correct} questions
AVERAGE TIME SPENT: ${averageTime} seconds
WEAK CONCEPTS FOUND: ${topicsToReview.join(", ")}

### TASK:
Generate conceptual insight and estimated score gain (number in marks, max 25).`;

          const response = await AIService._callAIWithFallback([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ], { max_tokens: 400, temperature: 0.3 });

          if (response && response.content) {
            let parsed;
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            } else {
              parsed = JSON.parse(response.content);
            }

            aiAnalysis = {
              commonWeakness: parsed.commonWeakness || aiAnalysis.commonWeakness,
              recommendation: parsed.recommendation || aiAnalysis.recommendation,
              estimatedScoreGain: Number(parsed.estimatedScoreGain) || aiAnalysis.estimatedScoreGain
            };

            // Save to DB
            await TopicInsight.findOneAndUpdate(
              { userId, topic: topicName },
              {
                $set: {
                  analysis: aiAnalysis,
                  generatedAt: new Date()
                }
              },
              { upsert: true, new: true }
            );
          }
        } catch (aiErr) {
          logger.warn(`AI Topic Insight Generation failed for topic ${topicName}, using static fallback`, { error: aiErr.message });
        }
      } else {
        aiAnalysis = {
          commonWeakness: insight.analysis.commonWeakness || aiAnalysis.commonWeakness,
          recommendation: insight.analysis.recommendation || aiAnalysis.recommendation,
          estimatedScoreGain: insight.analysis.estimatedScoreGain || aiAnalysis.estimatedScoreGain
        };
      }

      focusAreas.push({
        topic: topicName,
        accuracy,
        attempted,
        correct,
        incorrect,
        averageTime,
        commonWeakness: aiAnalysis.commonWeakness,
        topicsToReview,
        recommendation: aiAnalysis.recommendation,
        estimatedScoreGain: aiAnalysis.estimatedScoreGain
      });
    }

    return focusAreas;
  }

  /**
   * Generates a ranked list of priorities based on Focus Areas.
   */
  static getRecommendations(userId, focusAreas) {
    if (!focusAreas || focusAreas.length === 0) {
      return [];
    }

    // Sort by estimatedScoreGain descending, then lowest accuracy
    const ranked = [...focusAreas]
      .filter(f => f.accuracy < 75)
      .sort((a, b) => b.estimatedScoreGain - a.estimatedScoreGain || a.accuracy - b.accuracy);

    return ranked.map((item, idx) => {
      // Recommend a question limit proportional to weakness level
      const recommendedCount = item.accuracy < 40 ? 25 : (item.accuracy < 60 ? 15 : 10);
      return {
        priority: idx + 1,
        topic: item.topic,
        reason: `${item.accuracy}% accuracy over ${item.attempted} attempts indicates significant room for mastery.`,
        potentialGain: `+${item.estimatedScoreGain} marks`,
        recommendedQuestionCount: recommendedCount
      };
    });
  }
}

export default FocusAreaAnalysisService;
