import { Resend } from "resend";
import "../config/env.js";

let resend = null;

try {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn("⚠️ RESEND_API_KEY missing - email disabled");
  } else {
    resend = new Resend(apiKey);
    console.log("✅ Resend email service initialized");
  }
} catch (err) {
  console.error("❌ Email init failed:", err.message);
  resend = null;
}

export const getEmailServiceHealth = () => {
  if (!resend) {
    return {
      status: "unavailable",
      reason: "RESEND_API_KEY missing or initialization failed",
    };
  }
  return { status: "healthy", provider: "resend" };
};

export default resend;