import sgMail from "@sendgrid/mail";
import { Resend } from "resend";
import "../config/env.js";

let resend = null;

// Initialize SendGrid
const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim();
if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
  console.log("✅ SendGrid email client initialized");
} else {
  console.warn("⚠️ SENDGRID_API_KEY missing - SendGrid disabled");
}

// Initialize Resend (Keep for future use)
try {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    resend = new Resend(resendKey);
    console.log("✅ Resend email client initialized");
  }
} catch (err) {
  console.error("❌ Resend init failed:", err.message);
}

export const getEmailServiceHealth = () => {
  const provider = process.env.EMAIL_PROVIDER || "sendgrid";
  
  if (provider === "resend") {
    return resend 
      ? { status: "healthy", provider: "resend" } 
      : { status: "unavailable", reason: "Resend not initialized" };
  }
  
  return sendgridApiKey 
    ? { status: "healthy", provider: "sendgrid" } 
    : { status: "unavailable", reason: "SendGrid not initialized" };
};

export { resend, sgMail };
export default { resend, sgMail };
