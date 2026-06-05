import * as brevo from "@getbrevo/brevo";
import "dotenv/config.js";

/**
 * Brevo v5 SDK has complex ESM exports. 
 * We use a defensive approach to extract the correct classes.
 */
const SibApiV3Sdk = brevo.default || brevo;

// Initialize Brevo API client
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Configure API key authentication
const rawKey = process.env.BREVO_API_KEY;
const apiKeyValue = typeof rawKey === "string" ? rawKey.trim() : "";

if (!apiKeyValue) {
  console.warn("⚠️ BREVO_API_KEY is not set (email sending will fail)");
} else {
  // Set the API key using the most compatible method
  apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKeyValue);
}

export default apiInstance;
