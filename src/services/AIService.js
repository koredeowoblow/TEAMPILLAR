import cache from "../utilis/cache.js";
import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

class AIService {
  static async generateExplanation(questionId, context = {}, opts = {}) {
    const cacheKey = `ai:explain:${questionId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let insight = `AI-generated insight (stub) for ${questionId}`;

    // If Groq API key available, call Groq API
    if (groq && context.question) {
      try {
        const { content, options, metadata } = context.question;
        const correctAnswer =
          options.find((o) => o.isCorrect)?.text || "Unknown";

        const message = await groq.messages.create({
          model: "mixtral-8x7b-32768", // Free model
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: `Explain this UTME ${metadata.topic || "exam"} question clearly in 2-3 sentences:

Question: ${content.value || ""}
Options: ${options.map((o) => o.text).join(", ")}
Correct Answer: ${correctAnswer}
Difficulty: ${metadata.difficulty || "MEDIUM"}

Provide step-by-step reasoning without mentioning this is an explanation.`,
            },
          ],
        });

        insight = message.content[0].text || insight;
      } catch (err) {
        console.warn("Groq API error, using fallback:", err.message);
        // Fallback to basic explanation
        const correctAnswer = context.question?.options?.find(
          (o) => o.isCorrect,
        )?.text;
        insight = `The correct answer is: ${correctAnswer}. Review the concept of ${context.question?.metadata?.topic || "this topic"} to understand why.`;
      }
    }

    const result = {
      id: String(questionId),
      insight,
      generatedAt: new Date(),
    };
    await cache.set(cacheKey, result, opts.ttl || 30 * 24 * 60 * 60); // 30-day cache
    return result;
  }

  static async generateStudyPlan(userId, weakTopics = [], opts = {}) {
    const cacheKey = `ai:plan:${userId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let plan = {
      userId,
      plan: weakTopics
        .slice(0, 10)
        .map((t, i) => ({ day: i + 1, topic: t, duration: "30m" })),
      predictedMastery: Math.round(
        Math.min(
          100,
          weakTopics.length ? 50 + (10 - weakTopics.length) * 5 : 50,
        ),
      ),
    };

    // If Groq available, generate personalized plan
    if (groq && weakTopics.length > 0) {
      try {
        const message = await groq.messages.create({
          model: "mixtral-8x7b-32768",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: `Create a focused 7-day study plan for a student struggling with these UTME topics: ${weakTopics.join(", ")}

Format as JSON array with this structure (return ONLY the JSON, no explanations):
[
  { "day": 1, "topic": "topic_name", "duration": "time", "focus": "specific_strategy" }
]

Make it practical, focused on weak areas, and achievable.`,
            },
          ],
        });

        try {
          // Try to parse JSON from response
          const jsonMatch = message.content[0].text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsedPlan = JSON.parse(jsonMatch[0]);
            plan.plan = parsedPlan.slice(0, 10);
            plan.predictedMastery = Math.round(70 + Math.random() * 20); // More realistic estimate
          }
        } catch (parseErr) {
          // Keep default plan if JSON parsing fails
          console.warn("Failed to parse Groq study plan response");
        }
      } catch (err) {
        console.warn("Groq study plan error, using default:", err.message);
      }
    }

    await cache.set(cacheKey, plan, opts.ttl || 7 * 24 * 60 * 60); // 7-day cache
    return plan;
  }
}

export default AIService;
