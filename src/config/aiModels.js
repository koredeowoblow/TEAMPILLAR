/**
 * Centralized AI Model Configuration
 * This file manages the Groq model inventory and fallback hierarchy.
 */

export const AI_MODELS = {
  // Primary high-reasoning model for complex explanations and analytics
  PRIMARY: "llama-3.3-70b-versatile",
  
  // Secondary fast model for quick insights and fallbacks
  SECONDARY: "llama-3.1-8b-instant",

  // Static fallback responses for when all AI models fail
  STATIC_FALLBACKS: {
    EXPLANATION: "Pedagogical insight unavailable at this moment. Please review the core concepts in your official UTME syllabus.",
    INSIGHT: "System status: Operational. Detailed strategic analysis is pending more performance data.",
    STUDENT_INSIGHT: "Consistency is your greatest tool. Keep practicing to unlock more personalized AI-driven tips!",
    STRATEGY: "Maintain a balanced study schedule across all four UTME subjects for the best result."
  },

  // Configuration for AI request lifecycle
  CONFIG: {
    MAX_RETRIES: 1,
    REQUEST_TIMEOUT: 15000, // 15 seconds
    SHUTDOWN_TIMEOUT: 10000, // 10 seconds to wait for in-flight AI requests
  }
};
