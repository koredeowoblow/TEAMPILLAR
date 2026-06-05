import brevoClient from "../config/email.js";

class EmailService {
  /**
   * Send a generic email using Brevo API
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   * @param {string} textContent - Plain text content (optional)
   * @returns {Promise<boolean>}
   */
  static async sendEmail(to, subject, html, textContent = null) {
    try {
      // Use simple object structure for Brevo instead of constructor
      const sendSmtpEmail = {
        sender: {
          name: process.env.BREVO_SENDER_NAME || "Team Pillar",
          email: process.env.BREVO_SENDER_EMAIL || "team@pillarenergy.com",
        },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html,
      };

      // Add plain text version if provided
      if (textContent) {
        sendSmtpEmail.textContent = textContent;
      }

      // Send email via Brevo API
      if (!brevoClient) {
        throw new Error("Brevo client not initialized. Check BREVO_API_KEY.");
      }
      const response = await brevoClient.sendTransacEmail(sendSmtpEmail);

      console.log(
        `✅ Email sent to ${to} - Subject: ${subject} - Message ID: ${response.messageId}`,
      );
      return true;
    } catch (error) {
      const status = error?.response?.status;
      console.error(`❌ Failed to send email to ${to}:`, error.message);
      if (status) {
        console.error("Brevo HTTP Status:", status);
      }

      const brevoBody =
        error?.response?.data ?? error?.response?.body ?? error?.body;
      if (brevoBody) {
        console.error("Brevo API Error:", brevoBody);
      }

      if (status === 401) {
        console.error(
          "Brevo auth failed (401). Check that BREVO_API_KEY is a valid Brevo API key and has Transactional Email permissions.",
        );
      }
      throw new Error(`Email sending failed: ${error.message}`);
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
    const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Verify Your Email - Team Pillar</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
                    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e1e5e9; border-top: none; }
                    .otp-container { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; margin: 25px 0; border-radius: 12px; text-align: center; }
                    .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 10px 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.1); }
                    .verification-note { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; border-top: 1px solid #e1e5e9; padding-top: 20px; }
                    .btn { background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🎉 Welcome to Team Pillar!</h1>
                    <p>We're excited to have you join our community</p>
                </div>
                <div class="content">
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>Thank you for registering with Team Pillar App! To complete your registration and verify your email address, please use the verification code below:</p>
                    
                    <div class="otp-container">
                        <p style="margin: 0; font-size: 16px;">Your verification code is:</p>
                        <div class="otp-code">${otp}</div>
                        <p style="margin: 0; font-size: 14px; opacity: 0.9;">Enter this code in the app to verify your email</p>
                    </div>
                    
                    <div class="verification-note">
                        <h3 style="margin-top: 0; color: #28a745;">⏰ Important Information:</h3>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>This verification code will expire in <strong>10 minutes</strong></li>
                            <li>For your security, don't share this code with anyone</li>
                            <li>If you didn't register for Team Pillar, please ignore this email</li>
                        </ul>
                    </div>
                    
                    <p>Once verified, you'll have full access to all Team Pillar features including:</p>
                 
                    
                    <p>Need help? Contact our support team - we're here to help!</p>
                    
                    <div class="footer">
                        <p><strong>Team Pillar App Team</strong></p>                                                                            
                        <p style="margin-top: 15px; font-size: 12px;">This is an automated message, please do not reply to this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

    const textContent = `
            Welcome to Team Pillar, ${name}!
            
            Your email verification code is: ${otp}
            
            This code will expire in 10 minutes.
            
            Enter this code in the app to verify your email address and complete your registration.
            
            Thank you for joining our community!
            
            Team Pillar App Team
        `;

    return this.sendEmail(
      to,
      "Verify Your Email - Team Pillar App",
      html,
      textContent,
    );
  }

  /**
   * Send a token email (e.g., password reset, verification)
   * @param {string} to - Recipient email
   * @param {string} token - Token/code to send
   * @param {string} purpose - Optional purpose description
   * @returns {Promise<boolean>}
   */
  static async sendTokenEmail(to, token, purpose = "Password Reset") {
    const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${purpose} - Team Pillar </title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                    .token { background: #4F46E5; color: white; padding: 15px 20px; font-size: 24px; font-weight: bold; text-align: center; border-radius: 6px; margin: 20px 0; letter-spacing: 2px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Team Pillar App</h1>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p>Your ${purpose.toLowerCase()} code is:</p>
                    <div class="token">${token}</div>
                    <p><strong>Important:</strong> This code will expire in 10 minutes for security reasons.</p>
                    <p>If you didn't request this ${purpose.toLowerCase()}, please ignore this email or contact our support team.</p>
                    <div class="footer">
                        <p>Thank you for using Team Pillar App!</p>
                        <p>This is an automated message, please do not reply to this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

    const textContent = `
            Hello,
            
            Your ${purpose} code is: ${token}
            
            This code will expire in 10 minutes.
            
            Thank you for using Team Pillar App!
        `;

    return this.sendEmail(to, `${purpose} - Team Pillar`, html, textContent);
  }

  /**
   * Send a welcome/onboarding email
   * @param {string} to - Recipient email
   * @param {string} name - User name
   * @returns {Promise<boolean>}
   */
  static async sendWelcomeEmail(to, name) {
    const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Welcome to Team Pillar</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                    .welcome-message { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4F46E5; }
                    .cta-button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Welcome to Team Pillar!</h1>
                </div>
                <div class="content">
                    <p>Hello <strong>${name}</strong>,</p>
                    <div class="welcome-message">
                        <p>🎉 <strong>Welcome to Team Pillar!</strong> We're absolutely thrilled to have you join our community.</p>
                        <p>Your account has been successfully created</p>
                    </div>
                    <p><strong>What's next?</strong></p>
                    <div class="footer">
                        <p>Thank you for joining us on this spiritual journey!</p>
                        <p><strong>The Team Pillar Team</strong></p>
                        <p>This is an automated message, please do not reply to this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

    const textContent = `
            Hello ${name},
            
            Welcome to Team Pillar! We're excited to have you on board.
            
            Your account has been successfully created, and you're now part of our growing community.
            
            
            Thank you for joining us!
            
            The Team Pillar Team
        `;

    return this.sendEmail(
      to,
      "Welcome to Team Pillar    - Let's Get Started!",
      html,
      textContent,
    );
  }
}

export default EmailService;
