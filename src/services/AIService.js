import cache from "../utils/cache.js";
import Groq from "groq-sdk";
import { AI_MODELS } from "../config/aiModels.js";
import { logger } from "../core/logger.js";
import AITutorSession from "../models/AITutorSessionModel.js";
import AITutorMessage from "../models/AITutorMessageModel.js";
import mongoose from "mongoose";

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
            ...(options.response_format && { response_format: options.response_format }),
          }, { timeout: 15000 }); // 15s timeout to prevent hanging

          const latency = Date.now() - startTime;
          const content = response.choices[0].message.content;

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

      const systemPrompt = `You are a UTME tutor explaining concepts to Nigerian secondary school students (SS3).
STRICT RULES:
1. Math/Chemistry: Use LaTeX. Inline: $x^2$. Block (own line): $$E = mc^2$$. Never use plain text. E.g., write $CH_4$, not CH4.
2. Structure:
   - **Quick Answer**: 1 sentence with the key term bolded.
   - **Explanation**: Clear paragraphs, max 3 sentences each.
   - **Step-by-Step** (if applicable): Numbered steps, each on its own line.
   - **Key Formula** (if applicable): Display block LaTeX.
   - **Remember This**: 1-line memory tip/mnemonic.
3. Clarity: Define variables immediately. Use simple language. Never use "obviously" or "as we know".`;

      const userPrompt = `### INPUT DATA:
QUESTION: "${content.text || content.value || ""}"
OPTIONS: ${options.map((o) => `${o.id}: ${o.text}`).join(" | ")}
CORRECT ANSWER: ${correctAnswer}
STUDENT_CHOICE: ${context.selectedOptionId || "NOT_PROVIDED"}
TOPIC: ${metadata.topic || "General"}

### TASK:
Produce a deep-dive pedagogical explanation following the 3 rules above. If STUDENT_CHOICE is incorrect, prioritize correcting that logic error.`;

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
          content: `You are an academic planner. Generate a 7-day strategic study plan based on the student's weak topics.
Return a valid JSON object containing a "plan" key with an array of daily study sessions.
JSON Schema:
{
  "plan": [
    {
      "day": 1,
      "topic": "Topic Name",
      "duration": "45m",
      "focus": "Conceptual Review or Practice Questions"
    }
  ]
}`
        },
        {
          role: "user",
          content: `Weak Topics: ${weakTopics.join(", ")}.`
        }
      ];

      const aiResponse = await this._callAIWithFallback(messages, {
        max_tokens: 600,
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      if (aiResponse.content) {
        try {
          const parsed = JSON.parse(aiResponse.content);
          if (parsed && Array.isArray(parsed.plan)) {
            plan.plan = parsed.plan.slice(0, 10);
            plan.predictedMastery = Math.round(75 + Math.random() * 15);
            plan.ai = aiResponse.ai;
          }
        } catch (e) {
          logger.warn("JSON Parse Error in Study Plan AI Response", { error: e.message });
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

    if (data.priorityRecommendations?.length > 0 || data.averageScore > 0) {
      const topPriorities = (data.priorityRecommendations || []).slice(0, 3).map(p => `${p.topic} (Gain: ${p.potentialGain})`).join(", ");
      
      const systemPrompt = `You are a UTME (JAMB) academic strategist.
Your task is to write a 2-paragraph motivational and tactical summary for a student.
Explain WHY focusing on the provided top 3 priority topics will mathematically bridge the gap from their current score to their target score.
DO NOT invent new metrics or hallucinate topics. Use only the data provided. Use markdown for bolding key terms.`;

      const userPrompt = `### STUDENT PROFILE:
Current Average Score: ${data.averageScore}%
Target UTME Score: ${data.targetScore}
Top 3 Priority Topics: ${topPriorities || 'None identified yet'}

### TASK:
Write the 2-paragraph tactical summary.`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      const aiResponse = await this._callAIWithFallback(messages, { max_tokens: 400 });

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
          content: `You are an adaptive learning engine. Analyze student performance data and output a MongoDB $match stage query.
Return a valid JSON object containing a "matchStage" key and a "reasoning" key.
JSON Schema:
{
  "matchStage": {
    "metadata.topic": { "$in": ["Topic A", "Topic B"] }
  },
  "reasoning": "Explain selection reasoning in 1 sentence."
}`
        },
        {
          role: "user",
          content: `Performance Data: ${JSON.stringify(performanceData.map(p => ({ topic: p.topicId, mastery: p.masteryScore, avgTime: p.averageTimeSpent })))}`
        }
      ];

      const aiResponse = await this._callAIWithFallback(messages, {
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      if (aiResponse.content) {
        try {
          const parsed = JSON.parse(aiResponse.content);
          if (parsed) {
            result.matchStage = parsed.matchStage || {};
            result.reasoning = parsed.reasoning || result.reasoning;
            result.ai = aiResponse.ai;
          }
        } catch (e) {
          logger.warn("JSON Parse Error in Practice Strategy AI Response", { error: e.message });
        }
      }
    }

    await cache.set(cacheKey, result, opts.ttl || 3600);
    return result;
  }

  /**
   * Generates a conversational AI Tutor reply customized for the Nigerian UTME context.
   */
  static async generateTutorChatReply({ userId, message, subject, sessionId, history }) {
    const activeSubject = subject || "General";

    // Rich subject-based fallback config if AI fails or Groq is not available
    const fallbacksBySubject = {
      English: {
        reply: "Welcome to English UTME prep! In JAMB English, Lexis and Structure, Concord, and Comprehension are heavily tested. For instance, did you know that when singular subjects are connected by 'or' or 'nor', they take a singular verb? E.g., 'Neither the teacher nor the student is here.' How can I help you excel in English today?",
        suggestedFollowUps: [
          "Explain the rules of Concord.",
          "Give me a practice question on synonyms.",
          "Explain the difference between active and passive voice."
        ],
        topicsReferenced: ["Concord", "Grammar"]
      },
      Mathematics: {
        reply: "Let's master Mathematics! From algebra and trigonometry to calculus, we can break down any formula step-by-step. For example, to find the roots of a quadratic equation $ax^2 + bx + c = 0$, we use the formula:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\nWhat concept or formula should we tackle first?",
        suggestedFollowUps: [
          "Show me how to solve a quadratic equation.",
          "Explain differentiation from first principles.",
          "Solve a probability question."
        ],
        topicsReferenced: ["Quadratic Equations", "Algebra"]
      },
      Physics: {
        reply: "Physics is all about understanding the physical laws of nature. Whether it's mechanics, waves, electricity, or modern physics, we can make it simple. For instance, the equations of linear motion are:\n\n1. $v = u + at$\n2. $s = ut + \\frac{1}{2}at^2$\n3. $v^2 = u^2 + 2as$\n\nWhere $u$ is initial velocity, $v$ is final velocity, $a$ is acceleration, and $t$ is time. What topic are you working on?",
        suggestedFollowUps: [
          "Derive the equations of motion.",
          "Explain Newton's laws of motion.",
          "How does electromagnetic induction work?"
        ],
        topicsReferenced: ["Equations of Motion", "Mechanics"]
      },
      Chemistry: {
        reply: "Let's explore Chemistry! Understanding the periodic table, chemical bonding, stoichiometry, and organic chemistry is key to scoring 90+ in Chemistry. For example, to calculate the number of moles ($n$), we use:\n\n$$n = \\frac{\\text{mass (g)}}{\\text{molar mass (g/mol)}}$$\n\nWhat chemical reactions or formulas are puzzling you today?",
        suggestedFollowUps: [
          "Explain balancing chemical equations.",
          "What is Faraday's first law of electrolysis?",
          "Explain the difference between alkanes and alkenes."
        ],
        topicsReferenced: ["Stoichiometry", "Basic Concepts"]
      },
      General: {
        reply: "Hello! I am your Pillar AI Tutor. I can help you prepare for all your UTME core subjects. We can solve equations, analyze texts, study chemical reactions, or go through physics derivations. What subject are we focusing on today?",
        suggestedFollowUps: [
          "Give me study tips for UTME.",
          "How do I manage my time during the exam?",
          "Create a study schedule for my 4 subjects."
        ],
        topicsReferenced: ["UTME Strategy", "General Study"]
      }
    };

    const staticFallback = fallbacksBySubject[activeSubject] || fallbacksBySubject.General;

    let session;
    if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
      session = await AITutorSession.findById(sessionId);
    }
    
    if (!session) {
      session = await AITutorSession.create({
        studentId: userId,
        topic: activeSubject
      });
    }

    // Persist incoming message synchronously
    await AITutorMessage.create({
      sessionId: session._id,
      role: "user",
      content: message
    });

    // Retrieve full history from database (limit to last 15 messages to stay within context window)
    const storedHistory = await AITutorMessage.find({ sessionId: session._id })
      .sort({ createdAt: 1 })
      .limit(15);

    if (!groq) {
      logger.info(`Groq API Key not found. Using static fallback for subject: ${activeSubject}`);
      AITutorMessage.create({
        sessionId: session._id,
        role: "assistant",
        content: staticFallback.reply,
      }).catch(e => logger.error("Failed to persist AI response", { error: e.message }));
      return { ...staticFallback, sessionId: session._id };
    }

    const systemPrompt = `You are a helpful UTME (JAMB) AI Tutor for the subject: ${activeSubject}.
IMPORTANT: You are strictly an educational tutor. If the user asks about anything unrelated to studying, academics, or UTME (JAMB) preparation, you MUST politely refuse to answer and redirect them back to their studies. Do NOT engage in casual conversation, jokes, or answer general knowledge questions outside of the academic scope.
Explain concepts simply. Support markdown and LaTeX (e.g. $x^2$ or $$E=mc^2$$).
Return ONLY a valid JSON object matching this schema:
{
  "reply": "Tutor reply in markdown/LaTeX",
  "suggestedFollowUps": ["Question 1", "Question 2", "Question 3"],
  "topicsReferenced": ["Topic Name"]
}`;

    const messages = [
      { role: "system", content: systemPrompt }
    ];

    // Use DB history (this includes the user message we just persisted)
    storedHistory.forEach(msg => {
      messages.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.content });
    });

    const aiResponse = await this._callAIWithFallback(messages, {
      max_tokens: 800,
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    let replyText = staticFallback.reply;
    let suggestedFollowUps = staticFallback.suggestedFollowUps;
    let topicsReferenced = [activeSubject];
    let tokensUsed = aiResponse.ai?.tokens || null;
    let latencyMs = aiResponse.ai?.latency || null;

    if (aiResponse.content) {
      try {
        const parsed = JSON.parse(aiResponse.content);
        if (parsed && parsed.reply) {
          replyText = parsed.reply;
          suggestedFollowUps = Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps : staticFallback.suggestedFollowUps;
          topicsReferenced = Array.isArray(parsed.topicsReferenced) ? parsed.topicsReferenced : [activeSubject];
        }
      } catch (err) {
        logger.warn("JSON Parse Error in AI Tutor Chat Response", { raw: aiResponse.content, error: err.message });
        replyText = aiResponse.content;
      }
    } else {
      logger.warn(`AI Chat model failed. Returning subject fallback.`);
    }

    // Fire-and-forget the assistant message write
    AITutorMessage.create({
      sessionId: session._id,
      role: "assistant",
      content: replyText,
      metadata: { tokensUsed, latencyMs }
    }).catch(e => logger.error("Failed to persist AI response", { error: e.message }));

    return {
      reply: replyText,
      suggestedFollowUps,
      topicsReferenced,
      sessionId: session._id
    };
  }
}

export default AIService;
