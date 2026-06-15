import OTPService from "./OTPService.js";
import EmailService from "./emailService.js";

class NotificationOrchestrator {
  static async sendEmailVerification(email, displayName) {
    const otp = await OTPService.storeOTP(email, "email_verification", 10);
    await EmailService.sendEmailVerificationOTP(email, otp, displayName);
  }

  static async sendWelcomeEmail(email, displayName) {
    await EmailService.sendWelcomeEmail(email, displayName);
  }

  static async sendPasswordResetOTP(email) {
    const otp = await OTPService.storeOTP(email, "password_reset", 15);
    await EmailService.sendTokenEmail(email, otp, "Password Reset");
  }

  static async verifyEmailOTP(email, otp) {
    return OTPService.verifyOTP(email, otp, "email_verification");
  }

  static async verifyPasswordOTP(email, otp) {
    return OTPService.verifyOTP(email, otp, "password_reset");
  }
}

export default NotificationOrchestrator;
