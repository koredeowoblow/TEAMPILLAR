import Question from "../models/QuestionModel.js";
import AIService from "./AIService.js";
import { logger } from "../core/logger.js";

class QuestionExplanationService {
  static async getExplanation(questionId) {
    const question = await Question.findById(questionId)
      .select("explanationStatus explanationDetails explanation explanationSource explanationGeneratedAt")
      .lean();
    if (!question) return null;

    if (question.explanationStatus === "generated" && question.explanationDetails) {
      return {
        summary: question.explanationDetails.summary || question.explanation || "",
        whyCorrect: question.explanationDetails.whyCorrect || "",
        whyOthersWrong: question.explanationDetails.whyOthersWrong || [],
        examTip: question.explanationDetails.examTip || "",
        relatedConcepts: question.explanationDetails.relatedConcepts || [],
        explanationSource: question.explanationSource || "manual",
        explanationGeneratedAt: question.explanationGeneratedAt || null,
      };
    }

    return {
      summary: question.explanation || "Explanation is pending generation.",
      whyCorrect: "",
      whyOthersWrong: [],
      examTip: "",
      relatedConcepts: [],
      explanationSource: question.explanationSource || "manual",
      explanationGeneratedAt: question.explanationGeneratedAt || null,
    };
  }

  /**
   * Generates explanation via AI and returns parsed JSON.
   * Does NOT save to DB — caller handles persistence.
   */
  static async generateExplanation(question) {
    const { content, options, metadata } = question;
    const correctAnswer = options?.find((o) => o.isCorrect)?.text || "Unknown";

    const systemPrompt = `You are a UTME educational expert. Return a valid JSON object with concept explanations.
Format requirements:
- Use LaTeX for all math/chemistry (inline: $x^2$, display: $$E=mc^2$$).
- Output a valid JSON object matching this schema:
{
  "summary": "Concept summary in 2-3 sentences.",
  "whyCorrect": "Explanation of why the correct option is the right answer.",
  "whyOthersWrong": [
    "Explanation for incorrect option 1",
    "Explanation for incorrect option 2",
    "Explanation for incorrect option 3"
  ],
  "examTip": "A strategic exam tip or memory helper.",
  "relatedConcepts": ["Concept A", "Concept B"]
}`;

    const userPrompt = `### INPUT DATA:
TOPIC: "${metadata?.topic || "General"}"
DIFFICULTY: "${metadata?.difficulty || "medium"}"
QUESTION: "${content?.text || ""}"
OPTIONS: ${options?.map((o) => `${o.id}: ${o.text}`).join(" | ") || "None"}
CORRECT ANSWER: ${correctAnswer}

### TASK:
Generate the explanation JSON object matching the requested schema.`;

    const response = await AIService._callAIWithFallback(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { max_tokens: 1200, temperature: 0.2, response_format: { type: "json_object" } }
    );

    if (!response || !response.content) {
      throw new Error("Empty AI response content");
    }

    let parsedJson;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      const raw = jsonMatch ? jsonMatch[0] : response.content;

      // Fix unescaped backslashes from LaTeX (e.g. \frac, \times, \alpha)
      const sanitized = raw.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

      parsedJson = JSON.parse(sanitized);
    } catch (parseErr) {
      logger.warn("AI returned malformed JSON, using fallback", { error: parseErr.message });
      parsedJson = {
        summary: response.content,
        whyCorrect: "The selected answer is correct based on the question constraints.",
        whyOthersWrong: options?.filter((o) => !o.isCorrect).map((o) => `${o.text} is incorrect.`) || [],
        examTip: `Study ${metadata?.topic || "this topic"} carefully.`,
        relatedConcepts: [metadata?.topic || "General"],
      };
    }

    return {
      summary: parsedJson.summary || response.content,
      whyCorrect: parsedJson.whyCorrect || "",
      whyOthersWrong: Array.isArray(parsedJson.whyOthersWrong) ? parsedJson.whyOthersWrong : [],
      examTip: parsedJson.examTip || "",
      relatedConcepts: Array.isArray(parsedJson.relatedConcepts) ? parsedJson.relatedConcepts : [],
    };
  }

  /**
   * Legacy method — kept for backwards compatibility.
   * Uses updateOne internally to avoid save() validation issues.
   */
  static async generateAndSaveExplanation(question) {
    try {
      const result = await QuestionExplanationService.generateExplanation(question);

      await Question.updateOne(
        { _id: question._id },
        {
          $set: {
            explanation: result.summary,
            explanationStatus: "generated",
            explanationSource: "ai",
            explanationGeneratedAt: new Date(),
            explanationDetails: {
              summary: result.summary,
              whyCorrect: result.whyCorrect,
              whyOthersWrong: result.whyOthersWrong,
              examTip: result.examTip,
              relatedConcepts: result.relatedConcepts,
            },
          },
        }
      );

      logger.info(`Explanation saved for question: ${question._id}`);
      return result;
    } catch (err) {
      logger.error(`Failed to generate explanation for question: ${question._id}`, { error: err.message });

      await Question.updateOne(
        { _id: question._id },
        { $set: { explanationStatus: "failed" } }
      ).catch(() => { });

      throw err;
    }
  }
}

export default QuestionExplanationService;