import * as SibApiV3Sdk from "@getbrevo/brevo";
import "../config/env.js";

/**
 * Audit Installed Package:
 * Package: @getbrevo/brevo
 * Version: ^5.0.4
 * Pattern: Named exports (TransactionalEmailsApi)
 */

let apiInstance = null;

try {
  // Defensive initialization to prevent startup crashes
  const TransactionalEmailsApi = SibApiV3Sdk.TransactionalEmailsApi;

  if (typeof TransactionalEmailsApi === "function") {
    apiInstance = new TransactionalEmailsApi();

    const rawKey = process.env.BREVO_API_KEY;
    const apiKeyValue = typeof rawKey === "string" ? rawKey.trim() : "";

    if (!apiKeyValue) {
      console.warn("⚠️ BREVO_API_KEY is not set (email service will be degraded)");
    } else {
      // Correct method for v5+ to set API key
      apiInstance.setApiKey(
        SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
        apiKeyValue,
      );
      console.log("✅ Email service initialized successfully");
    }
  } else {
    // Check for CommonJS-style default nesting in ESM
    const DefaultApi = SibApiV3Sdk.default?.TransactionalEmailsApi;
    if (typeof DefaultApi === "function") {
      apiInstance = new DefaultApi();
      const apiKeyValue = (process.env.BREVO_API_KEY || "").trim();
      apiInstance.setApiKey(
        (SibApiV3Sdk.default?.TransactionalEmailsApiApiKeys ||
          SibApiV3Sdk.TransactionalEmailsApiApiKeys).apiKey,
        apiKeyValue,
      );
      console.log("✅ Email service initialized successfully (via default compat)");
    } else {
      throw new Error("TransactionalEmailsApi constructor not found in SDK exports");
    }
  }
} catch (err) {
  console.error("❌ Email service failed to initialize:", err.message);
  console.warn("⚠️ Continuing application startup in degraded mode...");
  apiInstance = null;
}

/**
 * Health check helper for the email service
 */
export const getEmailServiceHealth = () => {
  if (!apiInstance) return "unavailable";
  if (!process.env.BREVO_API_KEY) return "unconfigured";
  return "healthy";
};

export default apiInstance;
