import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys } from "@getbrevo/brevo";
import "dotenv/config.js";

// Initialize Brevo API client
const apiInstance = new TransactionalEmailsApi();

// Configure API key authentication
const rawKey = process.env.BREVO_API_KEY;
const apiKeyValue = typeof rawKey === "string" ? rawKey.trim() : "";

if (!apiKeyValue) {
  console.warn("⚠️ BREVO_API_KEY is not set (email sending will fail)");
} else {
  // Use the standard authentications object approach which is most reliable across versions
  apiInstance.setApiKey(TransactionalEmailsApiApiKeys.apiKey, apiKeyValue);
}

export default apiInstance;
