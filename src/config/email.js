import * as SibApiV3Sdk from "@getbrevo/brevo";
import "../config/env.js";

// The @getbrevo/brevo package (v5+) uses named exports for its API classes.
// In ESM, 'import * as SibApiV3Sdk' captures all exports.
// We use the TransactionalEmailsApi from this namespace.

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Configure API key authentication
const rawKey = process.env.BREVO_API_KEY;
const apiKeyValue = typeof rawKey === "string" ? rawKey.trim() : "";

if (!apiKeyValue) {
  console.warn("⚠️ BREVO_API_KEY is not set (email sending will fail)");
} else {
  // Correct method for v5+ to set API key
  apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKeyValue);
}

export default apiInstance;
