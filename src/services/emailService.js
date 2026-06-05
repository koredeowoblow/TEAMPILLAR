import { resend, smtpTransporter } from "../config/email.js";
import { logger } from "../core/logger.js";
import EmailLog from "../models/EmailLogModel.js";

class EmailService {
  /**
   * Internal helper to generate a consistent HTML wrapper for emails
   * @param {string} content - Inner HTML content
   * @param {string} title - Page title
   * @param {string} preheader - Optional text seen in email preview
   * @returns {string}
   */
  static _getBaseTemplate(content, title, preheader = "") {
    const colors = {
      deep: "#002452",
      blue: "#1B3A6B",
      amber: "#F5A623",
      amberBright: "#FEAE2C",
      surface: "#f8f9ff",
      text: "#0b1c30",
      muted: "#44474f",
      white: "#ffffff",
    };

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <!--[if mso]>
          <noscript>
              <xml>
                  <o:OfficeDocumentSettings>
                      <o:PixelsPerInch>96</o:PixelsPerInch>
                  </o:OfficeDocumentSettings>
              </xml>
          </noscript>
          <![endif]-->
          <style>
              body { 
                  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                  background-color: ${colors.surface}; 
                  margin: 0; 
                  padding: 0; 
                  -webkit-font-smoothing: antialiased;
              }
              .container { 
                  max-width: 600px; 
                  margin: 40px auto; 
                  background-color: ${colors.white}; 
                  border-radius: 24px; 
                  overflow: hidden; 
                  box-shadow: 0 4px 20px rgba(0, 36, 82, 0.05);
              }
              .header { 
                  background-color: ${colors.deep}; 
                  padding: 40px 20px; 
                  text-align: center;
                  background-image: linear-gradient(135deg, ${colors.deep} 0%, ${colors.blue} 100%);
              }
              .logo-text { 
                  color: ${colors.white}; 
                  font-size: 28px; 
                  font-weight: 800; 
                  letter-spacing: -0.5px;
                  margin: 0;
              }
              .logo-accent { color: ${colors.amberBright}; }
              .content { 
                  padding: 40px; 
                  color: ${colors.text}; 
                  line-height: 1.6;
              }
              .button { 
                  display: inline-block; 
                  background-color: ${colors.amberBright}; 
                  color: ${colors.deep} !important; 
                  padding: 16px 32px; 
                  border-radius: 14px; 
                  text-decoration: none; 
                  font-weight: 800; 
                  font-size: 16px; 
                  margin: 24px 0;
                  box-shadow: 0 4px 12px rgba(254, 174, 44, 0.2);
              }
              .footer { 
                  padding: 30px; 
                  text-align: center; 
                  color: ${colors.muted}; 
                  font-size: 13px; 
                  background-color: #f1f4f9;
              }
              .otp-box {
                  background-color: #f1f4f9;
                  border: 2px dashed ${colors.amberBright};
                  border-radius: 16px;
                  padding: 24px;
                  text-align: center;
                  margin: 24px 0;
              }
              .otp-code {
                  font-size: 42px;
                  font-weight: 800;
                  letter-spacing: 8px;
                  color: ${colors.deep};
                  margin: 0;
              }
              h1 { font-size: 24px; font-weight: 800; margin-top: 0; color: ${colors.deep}; }
              p { margin-bottom: 20px; font-size: 16px; }
          </style>
      </head>
      <body>
          <div style="display: none; max-height: 0px; overflow: hidden;">${preheader}</div>
          <div class="container">
              <div class="header">
                  <h1 class="logo-text">Pillar<span class="logo-accent">.</span></h1>
              </div>
              <div class="content">
                  ${content}
              </div>
              <div class="footer">
                  <p style="margin: 0 0 10px 0;">&copy; ${new Date().getFullYear()} Team Pillar. All rights reserved.</p>
                  <p style="margin: 0;">Empowering your academic journey with AI.</p>
                  <div style="margin-top: 20px;">
                      <a href="#" style="color: ${colors.deep}; text-decoration: none; margin: 0 10px;">Privacy Policy</a>
                      <a href="#" style="color: ${colors.deep}; text-decoration: none; margin: 0 10px;">Help Center</a>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  }

  /**
   * Send a generic email using either SMTP (Nodemailer) or Resend
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   * @param {string} textContent - Plain text content (optional)
   * @param {string} template - Template name for logging
   * @returns {Promise<boolean>}
   */
  static async sendEmail(to, subject, html, textContent = null, template = "generic") {
    const provider = process.env.EMAIL_PROVIDER || "smtp";
    const senderEmail = process.env.SMTP_USER || process.env.RESEND_SENDER_EMAIL || "onboarding@resend.dev";
    const senderName = process.env.RESEND_SENDER_NAME || "Pillar";

    try {
      let result;

      if (provider === "resend") {
        if (!resend) {
          logger.warn("⚠️ Resend client not initialized. Falling back to SMTP if available.");
          if (!smtpTransporter) return false;
        } else {
          const { data, error } = await resend.emails.send({
            from: `${senderName} <${senderEmail}>`,
            to: [to],
            subject: subject,
            html: html,
            text: textContent,
          });

          if (error) throw error;
          result = { messageId: data.id };
        }
      }

      // Default or Fallback: SMTP
      if (!result) {
        if (!smtpTransporter) {
          logger.error("❌ No email provider available (SMTP/Resend).");
          return false;
        }

        const info = await smtpTransporter.sendMail({
          from: `"${senderName}" <${senderEmail}>`,
          to,
          subject,
          text: textContent,
          html,
        });
        result = { messageId: info.messageId };
      }

      logger.info(`✅ Email sent via ${provider} to ${to} - ID: ${result.messageId}`);

      await EmailLog.create({
        to,
        subject,
        template,
        status: "sent",
        resendId: result.messageId,
        metadata: { provider },
      }).catch((err) => logger.error("Failed to create success email log", err));

      return true;
    } catch (error) {
      logger.error(`❌ Failed to send email to ${to} via ${provider}:`, error.message);

      await EmailLog.create({
        to,
        subject,
        template,
        status: "failed",
        error: { message: error.message, provider },
      }).catch((err) => logger.error("Failed to create failure email log", err));

      return false;
    }
  }

  /**
   * Send email verification OTP
   * @param {string} to - Recipient email
   * @param {string} otp - 4-digit OTP code
   * @param {string} name - User name
   * @returns {Promise<boolean>}
   */
  static async sendEmailVerificationOTP(to, otp, name = "User") {
    const content = `
      <h1>Verify your email</h1>
      <p>Hello <strong>${name}</strong>,</p>
      <p>Welcome to Team Pillar! We're excited to have you on board. To complete your registration and start your academic journey, please use the verification code below:</p>
      
      <div class="otp-box">
          <p style="margin: 0 0 10px 0; font-weight: 600; color: #44474f; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Verification Code</p>
          <h2 class="otp-code">${otp}</h2>
      </div>
      
      <p>This code is valid for <strong>10 minutes</strong>. For your security, please do not share this code with anyone.</p>
      
      <p>If you didn't create an account with Team Pillar, you can safely ignore this email.</p>
    `;

    const html = this._getBaseTemplate(
      content,
      "Verify Your Email - Team Pillar",
      `Your verification code is ${otp}`,
    );

    const textContent = `
      Welcome to Team Pillar, ${name}!
      Your email verification code is: ${otp}
      This code will expire in 10 minutes.
    `;

    return this.sendEmail(
      to,
      "Verify Your Email - Team Pillar",
      html,
      textContent,
      "otp",
    );
  }

  /**
   * Send a password reset email
   * @param {string} to - Recipient email
   * @param {string} token - Reset token/OTP
   * @returns {Promise<boolean>}
   */
  static async sendPasswordResetEmail(to, token) {
    const content = `
      <h1>Reset your password</h1>
      <p>Hello,</p>
      <p>We received a request to reset your password for your Team Pillar account. Use the code below to proceed with the reset:</p>
      
      <div class="otp-box">
          <p style="margin: 0 0 10px 0; font-weight: 600; color: #44474f; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Reset Code</p>
          <h2 class="otp-code">${token}</h2>
      </div>
      
      <p>This code will expire in <strong>15 minutes</strong>. If you didn't request a password reset, you can safely ignore this email — your account is still secure.</p>
    `;

    const html = this._getBaseTemplate(
      content,
      "Password Reset - Team Pillar",
      `Your password reset code is ${token}`,
    );

    const textContent = `
      Hello,
      Your password reset code is: ${token}
      This code will expire in 15 minutes.
      Thank you for using Team Pillar!
    `;

    return this.sendEmail(to, "Password Reset - Team Pillar", html, textContent, "password_reset");
  }

  /**
   * Send a token email (deprecated - use sendPasswordResetEmail or specific methods)
   * @param {string} to - Recipient email
   * @param {string} token - Token/code to send
   * @param {string} purpose - Optional purpose description
   * @returns {Promise<boolean>}
   */
  static async sendTokenEmail(to, token, purpose = "Password Reset") {
    if (purpose === "Password Reset") {
      return this.sendPasswordResetEmail(to, token);
    }
    return this.sendEmail(to, `${purpose} - Team Pillar`, `<p>Your ${purpose} code is: <b>${token}</b></p>`, `Your ${purpose} code is: ${token}`, "token");
  }

  /**
   * Send a welcome email
   * @param {string} to - Recipient email
   * @param {string} name - User name
   * @returns {Promise<boolean>}
   */
  static async sendWelcomeEmail(to, name) {
    const content = `
      <h1>Welcome to the Pillar Family! 🎉</h1>
      <p>Hello <strong>${name}</strong>,</p>
      <p>We're absolutely thrilled to have you join our community of ambitious students. Team Pillar is designed to give you the ultimate edge in your academic preparations.</p>
      
      <p><strong>What can you do now?</strong></p>
      <ul style="padding-left: 20px; margin-bottom: 24px;">
          <li style="margin-bottom: 12px;"><strong>Practice Smart:</strong> Take JAMB/UTME mock tests with our adaptive engine.</li>
          <li style="margin-bottom: 12px;"><strong>AI Tutor:</strong> Get instant explanations for complex topics.</li>
          <li style="margin-bottom: 12px;"><strong>Study Planner:</strong> Let us organize your schedule based on your target score.</li>
      </ul>

      <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL || "https://teampillar.app"}/student/dashboard" class="button">Go to Dashboard</a>
      </div>
      
      <p>We're here to support you every step of the way. If you have any questions, just reply to this email.</p>
    `;

    const html = this._getBaseTemplate(
      content,
      "Welcome to Team Pillar!",
      "🎉 We're absolutely thrilled to have you join our community!",
    );

    const textContent = `
      Hello ${name},
      Welcome to Team Pillar! We're excited to have you on board.
      Your account has been successfully created. You can now start using all our features to boost your academic performance.
      Visit your dashboard at: ${process.env.FRONTEND_URL || "https://teampillar.app"}/student/dashboard
      The Team Pillar Team
    `;

    return this.sendEmail(to, "Welcome to Team Pillar!", html, textContent, "welcome");
  }

  /**
   * Send payment confirmation email
   * @param {string} to - Recipient email
   * @param {string} name - User name
   * @param {object} paymentDetails - Payment info
   * @returns {Promise<boolean>}
   */
  static async sendPaymentConfirmation(to, name, paymentDetails) {
    const { planName, amount, currency = "NGN" } = paymentDetails;
    const content = `
      <h1>Payment Confirmed! 🚀</h1>
      <p>Hello <strong>${name}</strong>,</p>
      <p>Great news! Your payment for the <strong>${planName}</strong> has been successfully processed. You now have full access to all premium features.</p>
      
      <div style="background-color: #f8f9ff; border-radius: 16px; padding: 24px; margin: 24px 0;">
          <h3 style="margin: 0 0 16px 0; color: #002452; font-size: 18px;">Transaction Summary</h3>
          <table width="100%" style="border-collapse: collapse;">
              <tr>
                  <td style="padding: 8px 0; color: #44474f;">Plan:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 700;">${planName}</td>
              </tr>
              <tr>
                  <td style="padding: 8px 0; color: #44474f;">Amount:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 700;">${currency} ${amount.toLocaleString()}</td>
              </tr>
              <tr>
                  <td style="padding: 8px 0; color: #44474f;">Status:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #27AE60;">Successful</td>
              </tr>
          </table>
      </div>

      <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL || "https://teampillar.app"}/student/dashboard" class="button">Start Learning Now</a>
      </div>
      
      <p>Thank you for choosing Team Pillar to help you reach your academic goals!</p>
    `;

    const html = this._getBaseTemplate(
      content,
      "Payment Confirmation - Team Pillar",
      `Your payment for ${planName} was successful!`,
    );

    return this.sendEmail(to, "Payment Confirmation - Team Pillar", html, null, "payment");
  }
}

export default EmailService;
