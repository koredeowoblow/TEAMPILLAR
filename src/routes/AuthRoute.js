import { Router } from "express";
import AuthController from "../controllers/AuthController.js";
import {
  validateUserRegistration,
  validateUserLogin,
  validateForgotPassword,
  validateResetPassword,
  validateEmailVerification,
  validateResendVerification,
  validateChangePassword,
} from "../middleware/Validation/authValidation.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiters.js";
import { tryCatch } from "../utils/try-catch.js";
import { logger } from "../core/logger.js";
import upload from "../config/multer.js";
import SettingsController from "../controllers/SettingsController.js";

const auth = Router();

const logLoginRequest = (req, _res, next) => {
  if (process.env.NODE_ENV !== "production") {
    logger.info("Login route hit", {
      email: req.body?.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }
  next();
};

auth.post(
  "/register",
  authLimiter,
  validateUserRegistration,
  handleValidationErrors,
  tryCatch(AuthController.register),
);
auth.post(
  "/login",
  authLimiter,
  validateUserLogin,
  handleValidationErrors,
  tryCatch(AuthController.login),
);

auth.post("/logout", protectUser, tryCatch(AuthController.logout));

auth.post("/refresh", authLimiter, tryCatch(AuthController.refreshToken));
auth.post(
  "/forgot-password",
  authLimiter,
  validateForgotPassword,
  handleValidationErrors,
  tryCatch(AuthController.forgotPassword),
);
auth.post(
  "/reset-password",
  authLimiter,
  validateResetPassword,
  handleValidationErrors,
  tryCatch(AuthController.resetPassword),
);
auth.post(
  "/change-password",
  protectUser,
  validateChangePassword,
  handleValidationErrors,
  tryCatch(AuthController.changePassword),
);
auth.post(
  "/verify-otp",
  authLimiter,
  validateEmailVerification,
  handleValidationErrors,
  tryCatch(AuthController.verifyEmail),
);
auth.post(
  "/verify-email",
  authLimiter,
  validateEmailVerification,
  handleValidationErrors,
  tryCatch(AuthController.verifyEmail),
);

auth.post(
  "/resend-otp",
  authLimiter,
  validateResendVerification,
  handleValidationErrors,
  tryCatch(AuthController.resendEmailVerification),
);

auth.get("/me", protectUser, tryCatch(AuthController.getProfile));
auth.get("/onboarding-status", protectUser, tryCatch(AuthController.getOnboardingStatus));
auth.patch(
  "/profile",
  protectUser,
  upload.single("photo"),
  tryCatch(AuthController.createOrUpdateProfile),
);

// User settings
auth.get("/settings", protectUser, tryCatch(SettingsController.getSettings));
auth.patch("/settings/profile", protectUser, tryCatch(SettingsController.updateProfile));
auth.post(
  "/settings/photo",
  protectUser,
  upload.single("photo"),
  tryCatch(SettingsController.uploadPhoto),
);
auth.delete("/settings/photo", protectUser, tryCatch(SettingsController.removePhoto));
auth.patch(
  "/settings/notifications",
  protectUser,
  tryCatch(SettingsController.updateNotifications),
);
auth.patch("/settings/privacy", protectUser, tryCatch(SettingsController.updatePrivacy));
auth.get("/subscription", protectUser, tryCatch(SettingsController.getSubscription));
auth.post("/deactivate", protectUser, tryCatch(SettingsController.deactivateAccount));
auth.post("/reactivate", protectUser, tryCatch(SettingsController.reactivateAccount));

// Social Authentication
auth.post("/google", authLimiter, tryCatch(AuthController.googleAuth));
auth.post("/apple", authLimiter, tryCatch(AuthController.appleAuth));

// Admin user management routes have been consolidated into AdminRoute.js
// under /api/v1/admin/users/*

// ─── Session & Account Management ─────────────────────────────────────────────
auth.get("/sessions",    protectUser, tryCatch(AuthController.getActiveSessions));
auth.post("/logout-all", protectUser, tryCatch(AuthController.logoutAllDevices));
auth.delete("/account",  protectUser, tryCatch(AuthController.deleteAccount));

export default auth;
