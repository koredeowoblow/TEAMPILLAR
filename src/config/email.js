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
    const isSecure = port === "465";
    
    smtpTransporter = nodemailer.createTransport({
      host,
      port: Number.parseInt(port),
      secure: isSecure, 
      auth: {
        user,
        pass,
      },
      tls: {
        // Essential for STARTTLS (port 587) and cloud providers
        rejectUnauthorized: false,
        minVersion: "TLSv1.2"
      },
      connectionTimeout: 20000, // Increased for cloud latency
      greetingTimeout: 20000,
      socketTimeout: 20000,
      debug: true, 
      logger: true,
    });

    console.log("[EmailConfig] SMTP Transporter created. Verifying connection...");

    smtpTransporter.verify((error) => {
      if (error) {
        console.error("❌ [EmailConfig] SMTP Verification Failed:", {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
      } else {
        console.log(`✅ [EmailConfig] SMTP Server is ready (${host}:${port})`);
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