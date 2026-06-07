import Question from "../models/QuestionModel.js";
import AIService from "./AIService.js";
import { logger } from "../core/logger.js";

class QuestionExplanationService {
  /**
   * Safe, fast read-only method to fetch cached explanation from DB.
   * NEVER calls AI during runtime.
   */
  static async getExplanation(questionId) {
    const question = await Question.findById(questionId).lean();
    if (!question) {
      return null;
    }

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

    // Return pending placeholder structure
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
   * Invokes AI to generate explanation. Used ONLY by bulk seeder / import.
   */
  static async generateAndSaveExplanation(question) {
    const { content, options, metadata } = question;
    const correctAnswer = options?.find((o) => o.isCorrect)?.text || "Unknown";
    
    // Construct system prompt guiding Groq to return clean structured JSON
    const systemPrompt = `You are a UTME (JAMB) educational expert explaining concepts to Nigerian secondary school students.
You must analyze the question and return a valid JSON object with detailed explanations.
Format requirements:
- Use LaTeX for ALL math expressions, inline with single dollar signs: $x^2$.
- Use LaTeX for display equations with double dollar signs: $$E = mc^2$$.
- Never write math as plain text.
- Do NOT wrap your JSON response in markdown blocks like \`\`\`json. Output raw JSON only.

Your response MUST be a single valid JSON object containing exactly the following keys:
{
  "summary": "High-level summary of the concept in 2-3 sentences.",
  "whyCorrect": "Explanation of why the correct option is the right answer.",
  "whyOthersWrong": [
    "Explanation for the first incorrect option",
    "Explanation for the second incorrect option",
    "Explanation for the third incorrect option"
  ],
  "examTip": "A strategic exam-taking tip or memory helper for this concept.",
  "relatedConcepts": ["Concept 1", "Concept 2"]
}`;

    const userPrompt = `### INPUT DATA:
TOPIC: "${metadata?.topic || "General"}"
DIFFICULTY: "${metadata?.difficulty || "medium"}"
QUESTION: "${content?.text || ""}"
OPTIONS: ${options?.map((o) => `${o.id}: ${o.text}`).join(" | ") || "None"}
CORRECT ANSWER: ${correctAnswer}

### TASK:
Generate the explanation JSON object matching the requested schema. Ensure all incorrect options are explained in whyOthersWrong array.`;

    try {
      const response = await AIService._callAIWithFallback([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ], { max_tokens: 1200, temperature: 0.2 });

      if (!response || !response.content) {
        throw new Error("Empty AI response content");
      }

      // Parse JSON from response
      let parsedJson;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedJson = JSON.parse(jsonMatch[0]);
        } else {
          parsedJson = JSON.parse(response.content);
        }
      } catch (parseErr) {
        logger.warn("AI returned malformed JSON, utilizing fallback parser", { error: parseErr.message, content: response.content });
        // Fallback placeholder structure
        parsedJson = {
          summary: response.content,
          whyCorrect: "The selected answer is correct based on the question constraints.",
          whyOthersWrong: options?.filter(o => !o.isCorrect).map(o => `${o.text} is incorrect.`) || [],
          examTip: `Study ${metadata?.topic || "this topic"} carefully.`,
          relatedConcepts: [metadata?.topic || "General"]
        };
      }

      // Update and save question
      question.explanation = parsedJson.summary || response.content;
      question.explanationStatus = "generated";
      question.explanationSource = "ai";
      question.explanationGeneratedAt = new Date();
      question.explanationDetails = {
        summary: parsedJson.summary || response.content,
        whyCorrect: parsedJson.whyCorrect || "",
        whyOthersWrong: Array.isArray(parsedJson.whyOthersWrong) ? parsedJson.whyOthersWrong : [],
        examTip: parsedJson.examTip || "",
        relatedConcepts: Array.isArray(parsedJson.relatedConcepts) ? parsedJson.relatedConcepts : [],
      };

      await question.save();
      logger.info(`Successfully generated and saved explanation for question: ${question._id}`);
      return question;
    } catch (err) {
      logger.error(`Failed to generate explanation for question: ${question._id}`, { error: err.message });
      question.explanationStatus = "failed";
      await question.save();
      throw err;
    }
  }
}

export default QuestionExplanationService;
