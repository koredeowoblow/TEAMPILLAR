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

  if (host && port && user && pass) {
    smtpTransporter = nodemailer.createTransport({
      host,
      port: Number.parseInt(port),
      secure: port === "465", // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      // Increase timeout for slow connections
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
    console.log(`✅ SMTP Transporter initialized (${host}:${port})`);
  }
} catch (err) {
  console.error("❌ SMTP init failed:", err.message);
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