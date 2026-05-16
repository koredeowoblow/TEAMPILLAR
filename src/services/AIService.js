import cache from "../utils/cache.js";
import Groq from "groq-sdk";
import { AI_MODELS } from "../config/aiModels.js";
import { logger } from "../core/logger.js";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

/**
 * AIService - Central hub for all AI-driven intelligence.
 * Optimized for Nigerian UTME (JAMB) context with production-grade reliability.
 */
class AIService {
  static activeRequests = 0;

  /**
   * Internal helper to handle AI calls with robust fallback and monitoring.
   */
  static async _callAIWithFallback(messages, options = {}) {
    this.activeRequests++;
    const startTime = Date.now();
    let lastError = null;
    let modelUsed = AI_MODELS.PRIMARY;
    let fallbackTriggered = false;

    const retryModels = [AI_MODELS.PRIMARY, AI_MODELS.SECONDARY];

    try {
      if (!groq) throw new Error("Groq SDK not initialized (missing API key)");

      for (const model of retryModels) {
        try {
          modelUsed = model;
          const response = await groq.chat.completions.create({
            model: model,
            messages,
            max_tokens: options.max_tokens || 500,
            temperature: options.temperature ?? 0.3, // Lower temp for more deterministic UTME outputs
          });

          const latency = Date.now() - startTime;
          const rawContent = response.choices[0].message.content;
          // Strip markdown symbols for a cleaner UI
          const content = rawContent.replace(/\*\*|#{1,6}\s?/g, "");

          logger.info(`AI Request Success: ${model}`, {
            latency,
            fallback: fallbackTriggered,
            tokens: response.usage?.total_tokens
          });

          return {
            content,
            ai: {
              used: true,
              model: modelUsed,
              fallback: fallbackTriggered,
              latency
            }
          };
        } catch (err) {
          lastError = err;
          fallbackTriggered = true;
          logger.warn(`AI Model Failed: ${model}`, { error: err.message });
          // If this was the last model, it will throw outside the loop
        }
      }

      throw lastError || new Error("All AI models failed in fallback chain");

    } catch (err) {
      const latency = Date.now() - startTime;
      logger.error("AI Service Fatal Failure", {
        error: err.message,
        model: modelUsed,
        latency
      });

      return {
        content: null,
        error: err.message,
        ai: {
          used: false,
          model: modelUsed,
          fallback: true,
          latency
        }
      };
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Graceful shutdown helper to ensure in-flight AI requests complete.
   */
  static async waitForRequests(timeoutMs = 10000) {
    if (this.activeRequests === 0) return true;

    logger.info(`Waiting for ${this.activeRequests} in-flight AI requests...`);

    return new Promise((resolve) => {
      const start = Date.now();
      const check = setInterval(() => {
        if (this.activeRequests === 0 || (Date.now() - start) > timeoutMs) {
          clearInterval(check);
          resolve(this.activeRequests === 0);
        }
      }, 200);
    });
  }

  static async generateExplanation(questionId, context = {}, opts = {}) {
    const cacheKey = `ai:explain:${questionId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let result = {
      id: String(questionId),
      insight: AI_MODELS.STATIC_FALLBACKS.EXPLANATION,
      generatedAt: new Date(),
      ai: { used: false, model: "none", fallback: true }
    };

    if (context.question) {
      const { content, options, metadata } = context.question;
      const correctAnswer = options.find((o) => o.isCorrect)?.text || "Unknown";

      const systemPrompt = `### ROLE: SENIOR UTME EDUCATIONAL EXPERT & CONCEPTUAL TUTOR
### MISSION:
Transform UTME questions into deep learning opportunities. Your goal is NOT to provide a quick answer, but to build foundational mastery so the student can solve any similar problem independently.

### PEDAGOGICAL PHILOSOPHY:
- Prioritize deep understanding over brevity.
- Explain the "WHY" behind every step.
- Focus on pattern recognition and conceptual "first principles."
- Use clear, professional, yet encouraging language (like a top-tier Nigerian subject master).

### RESPONSE STRUCTURE:
1. THE CORE CONCEPT: Define the underlying principle simply but accurately.
2. STEP-BY-STEP LOGIC: Break down the solution with clear reasoning for each move.
3. THE CORRECT PATH: Why the correct option is the inevitable result of the concept.
4. THE MISCONCEPTION AUDIT: Analyze the student's choice and explain why common distractors are traps.
5. THE UTME PATTERN: A strategic tip for spotting this concept in future exam questions.

### CONSTRAINTS:
- DO NOT USE MARKDOWN FORMATTING (No **, no ###, no ####).
- Use plain text labels with capitalization for emphasis.
- No conversational filler at the start or end.
- Do NOT rush the explanation.`;

      const userPrompt = `### INPUT DATA:
QUESTION: "${content.text || content.value || ""}"
OPTIONS: ${options.map((o) => `${o.id}: ${o.text}`).join(" | ")}
CORRECT ANSWER: ${correctAnswer}
STUDENT_CHOICE: ${context.selectedOptionId || "NOT_PROVIDED"}
TOPIC: ${metadata.topic || "General"}

### TASK:
Produce a deep-dive pedagogical explanation following the 5-point structure above. If STUDENT_CHOICE is provided and wrong, prioritize correcting that specific logic error.`;

      const aiResponse = await this._callAIWithFallback([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ], { max_tokens: 800 });

      if (aiResponse.content) {
        result.insight = aiResponse.content;
        result.ai = aiResponse.ai;
      } else {
        result.error = aiResponse.error;
      }
    }

    await cache.set(cacheKey, result, opts.ttl || 30 * 24 * 60 * 60);
    return result;
  }

  static async generateStudyPlan(userId, weakTopics = [], opts = {}) {
    const cacheKey = `ai:plan:${userId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let plan = {
      userId,
      plan: weakTopics.slice(0, 7).map((t, i) => ({
        day: i + 1,
        topic: t,
        duration: "45m",
        focus: "Conceptual Review"
      })),
      predictedMastery: 65,
      ai: { used: false, model: "none", fallback: true }
    };

    if (weakTopics.length > 0) {
      const messages = [
        {
          role: "system",
          content: `### ROLE: ACADEMIC SUCCESS ARCHITECT
### OBJECTIVE: Transform weak performance into 7-day UTME mastery. Output STRICT JSON array only.`
        },
        {
          role: "user",
          content: `Weak Topics: ${weakTopics.join(", ")}. Generate 7-day strategic plan. Schema: [{"day": 1, "topic": "STRING", "duration": "STRING", "focus": "STRING"}]`
        }
      ];

      const aiResponse = await this._callAIWithFallback(messages, { max_tokens: 800 });

      if (aiResponse.content) {
        try {
          const jsonMatch = aiResponse.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            plan.plan = JSON.parse(jsonMatch[0]).slice(0, 10);
            plan.predictedMastery = Math.round(75 + Math.random() * 15);
            plan.ai = aiResponse.ai;
          }
        } catch (e) {
          logger.warn("JSON Parse Error in Study Plan AI Response");
        }
      }
    }

    await cache.set(cacheKey, plan, opts.ttl || 7 * 24 * 60 * 60);
    return plan;
  }

  static async generateAnalyticsInsights(data, opts = {}) {
    const cacheKey = `ai:analytics:insights:${new Date().toISOString().split("T")[0]}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let result = {
      summary: AI_MODELS.STATIC_FALLBACKS.INSIGHT,
      generatedAt: new Date(),
      ai: { used: false, model: "none", fallback: true }
    };

    if (data) {
      const mistakes = (data.commonMistakes || []).slice(0, 3).map(m => `${m.subject}: ${m.topic} (${m.failureRate}% failure)`).join(" | ");

      const systemPrompt = `### ROLE: CHIEF LEARNING OFFICER & DATA STRATEGIST
### MISSION:
Synthesize complex platform metrics into a high-impact executive briefing for the Administrator. Your insights must drive curriculum optimization and student retention.

### STRATEGIC FOCUS:
- **Performance Health**: Overall proficiency status.
- **Risk Identification**: Critical learning gaps and subject-specific bottlenecks.
- **Actionable Growth**: High-ROI strategic recommendations.

### CONSTRAINTS:
- DO NOT USE MARKDOWN (No **, no ###).
- Use plain numbered lists and capitalized labels for sections.
- Tone: Authoritative, data-driven, and objective.
- Format: Professional 3-point executive briefing.
- Max Tokens: 400.`;

      const userPrompt = `### PLATFORM ANALYTICS SNAPSHOT:
- **Average Proficiency**: ${data.averageScore || 0}%
- **Subject Distribution**: ${data.subjectComparison?.map(p => `${p.subject}(${p.performance}%)`).join(", ") || "N/A"}
- **Critical Curriculum Gaps**: ${mistakes}
- **Engagement Trend**: ${data.enrollmentTrend?.slice(-1)[0]?.active || 0} active sessions in latest window.

### TASK:
1. Provide a **High-Level Learning State** assessment.
2. Identify the **Primary Strategic Bottleneck** impacting platform success.
3. Recommend one **Systemic Intervention** to improve student mastery scores.`;

      const aiResponse = await this._callAIWithFallback([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ], { max_tokens: 400 });

      if (aiResponse.content) {
        result.summary = aiResponse.content;
        result.ai = aiResponse.ai;
      }
    }

    await cache.set(cacheKey, result, opts.ttl || 24 * 60 * 60);
    return result;
  }

  static async generateStudentInsights(data, opts = {}) {
    const cacheKey = `ai:student:insights:${data.userId}:${new Date().toISOString().split("T")[0]}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let result = {
      tips: AI_MODELS.STATIC_FALLBACKS.STUDENT_INSIGHT,
      generatedAt: new Date(),
      ai: { used: false, model: "none", fallback: true }
    };

    if (data.weakTopics?.length > 0 || data.averageScore > 0) {
      const topics = data.weakTopics.map(t => t.name || t.topic).join(", ");
      const messages = [
        {
          role: "system",
          content: "### ROLE: SENIOR PSYCHOMETRIC ANALYST. Identify strengths/weaknesses and provide 1% Rule strategy."
        },
        {
          role: "user",
          content: `Current Avg: ${data.averageScore}% | Target: ${data.targetScore} | Topics: ${topics}. Structure: 1. Summary, 2. Priority Topics, 3. Strategy Shift.`
        }
      ];

      const aiResponse = await this._callAIWithFallback(messages, { max_tokens: 300 });

      if (aiResponse.content) {
        result.tips = aiResponse.content;
        result.ai = aiResponse.ai;
      }
    }

    await cache.set(cacheKey, result, opts.ttl || 12 * 60 * 60);
    return result;
  }

  static async generateQuestionInsight(data, opts = {}) {
    const cacheKey = `ai:admin:qinsight:${data.id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let result = {
      insight: `Failure rate at ${data.failRate}%. Recommend fundamental reinforcement for ${data.topic}.`,
      generatedAt: new Date(),
      ai: { used: false, model: "none", fallback: true }
    };

    if (data) {
      const systemPrompt = `### ROLE: SENIOR PSYCHOMETRIC ANALYST & CURRICULUM ARCHITECT
### MISSION:
Conduct a high-fidelity diagnostic audit of a UTME question with a significant failure rate. Your goal is to provide the Administrator with a detailed "Clinical Roadmap" for curriculum improvement.

### DIAGNOSTIC DIMENSIONS:
1. PSYCHOMETRIC DECONSTRUCTION: Analyze the "Distractor Appeal." Why is the specific wrong answer attracting so many students? Identify the cognitive bias or common misconception.
2. THE LOGIC GAP: Explain the exact conceptual "First Principle" that students are missing.
3. REMEDIATION STRATEGY: Provide 2-3 specific, actionable steps to fix this gap (e.g., specific sub-topic review, question re-wording, or classroom intervention).
4. CALIBRATION CHECK: Briefly assess if the question difficulty matches the UTME topic standards.

### CONSTRAINTS:
- DO NOT USE MARKDOWN (No symbols like ** or ###).
- Use plain text labels for sections.
- Tone: Professional, investigative, and pedagogical.
- Format: Structured plain text with clear headings.
- Clarity over brevity.`;

      const userPrompt = `### QUESTION DIAGNOSTIC DATA:
- **Topic**: ${data.topic}
- **Failure Rate**: ${data.failRate}%
- **Primary Distractor Trap**: "${data.distractor}"
- **Question Context**: ${JSON.stringify(data.content || "N/A")}

### TASK:
Produce a comprehensive 4-point diagnostic report following the structure above. Highlight specific interventions for the administrator.`;

      const aiResponse = await this._callAIWithFallback([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ], { max_tokens: 500 });

      if (aiResponse.content) {
        result.insight = aiResponse.content;
        result.ai = aiResponse.ai;
      }
    }

    await cache.set(cacheKey, result, opts.ttl || 7 * 24 * 60 * 60);
    return result;
  }

  static async predictPracticeStrategy(userId, performanceData = [], opts = {}) {
    const cacheKey = `ai:strategy:${userId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    let result = {
      matchStage: {},
      reasoning: "Default balanced randomization",
      ai: { used: false, model: "none", fallback: true }
    };

    if (performanceData.length > 0) {
      const messages = [
        {
          role: "system",
          content: "### ROLE: ADAPTIVE LEARNING ARCHITECT. Synthesize MongoDB $match stage based on performance. Output STRICT JSON."
        },
        {
          role: "user",
          content: `Data: ${JSON.stringify(performanceData.map(p => ({ t: p.topicId, m: p.masteryScore, a: p.averageTimeSpent })))}. Task: Optimal retrieval strategy.`
        }
      ];

      const aiResponse = await this._callAIWithFallback(messages, { max_tokens: 500 });

      if (aiResponse.content) {
        try {
          const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const strategy = JSON.parse(jsonMatch[0]);
            result.matchStage = strategy.matchStage || {};
            result.reasoning = strategy.reasoning || result.reasoning;
            result.ai = aiResponse.ai;
          }
        } catch (e) {
          logger.warn("JSON Parse Error in Practice Strategy AI Response");
        }
      }
    }

    await cache.set(cacheKey, result, opts.ttl || 3600);
    return result;
  }
}

export default AIService;
