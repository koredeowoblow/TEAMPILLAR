import { Resend } from "resend";
import nodemailer from "nodemailer";
import "../config/env.js";

let resend = null;
let smtpTransporter = null;

// Initialize Resend
try {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    resend = new Resend(resendKey);
    console.log("✅ Resend email client initialized");
  }
} catch (err) {
  console.error("❌ Resend init failed:", err.message);
}

// Initialize SMTP (Nodemailer)
try {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  console.log(`[EmailConfig] Attempting SMTP init with host: ${host}, port: ${port}, user: ${user}`);

  if (host && port && user && pass) {
    // Force IPv4-only DNS resolution, switch port to 465, and set secure: true for SSL
    smtpTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      family: 4, // force IPv4-only DNS resolution
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      debug: true,
      logger: true,
    });

    console.log("[EmailConfig] SMTP Transporter initialized (IPv4 Forced, Port 465)");

    // Best-effort only: verification failure logs a warning but does NOT block startup
    smtpTransporter.verify((error) => {
      if (error) {
        console.warn("⚠️ [EmailConfig] SMTP Verification Warning (Non-blocking):", error.message);
      } else {
        console.log(`✅ [EmailConfig] SMTP Server is ready (smtp.gmail.com:465)`);
      }
    });
  } else {
    console.warn("⚠️ [EmailConfig] SMTP configuration missing some fields. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.");
  }
} catch (err) {
  console.error("❌ [EmailConfig] SMTP critical init failed:", err.message);
}

export const getEmailServiceHealth = () => {
  const provider = process.env.EMAIL_PROVIDER || "smtp";
  
  if (provider === "resend") {
    return resend 
      ? { status: "healthy", provider: "resend" } 
      : { status: "unavailable", reason: "Resend not initialized" };
  }
  
  return smtpTransporter 
    ? { status: "healthy", provider: "smtp" } 
    : { status: "unavailable", reason: "SMTP not initialized" };
};

export { resend, smtpTransporter };
export default { resend, smtpTransporter };