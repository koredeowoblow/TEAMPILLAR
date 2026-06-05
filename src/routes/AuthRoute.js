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
import {
  authLimiter,
  registrationLimiter,
  otpLimiter,
  passwordResetLimiter,
} from "../middleware/rateLimiter.js";
import { tryCatch } from "../utils/try-catch.js";
import { logger } from "../core/logger.js";
// import upload from "../Config/multer.js";

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
  registrationLimiter,
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
  passwordResetLimiter,
  validateForgotPassword,
  handleValidationErrors,
  tryCatch(AuthController.forgotPassword),
);
auth.post(
  "/reset-password",
  otpLimiter,
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
  otpLimiter,
  validateEmailVerification,
  handleValidationErrors,
  tryCatch(AuthController.verifyEmail),
);
auth.post(
  "/verify-email",
  otpLimiter,
  validateEmailVerification,
  handleValidationErrors,
  tryCatch(AuthController.verifyEmail),
);

auth.post(
  "/resend-otp",
  passwordResetLimiter,
  validateResendVerification,
  handleValidationErrors,
  tryCatch(AuthController.resendEmailVerification),
);

auth.get("/me", protectUser, tryCatch(AuthController.getProfile));
auth.patch(
  "/profile",
  protectUser,
  tryCatch(AuthController.createOrUpdateProfile),
);

// Social Authentication
auth.post("/google", authLimiter, tryCatch(AuthController.googleAuth));
auth.post("/apple", authLimiter, tryCatch(AuthController.appleAuth));

// Admin Management (Admin Only)
auth.get(
  "/admin/users",
  protectUser,
  protectAdmin,
  tryCatch(AuthController.getAllUsers),
);
auth.get(
  "/admin/users/:userId",
  protectUser,
  protectAdmin,
  tryCatch(AuthController.getUserById),
);
auth.put(
  "/admin/users/:userId",
  logLoginRequest,
  protectUser,
  protectAdmin,
  tryCatch(AuthController.adminUpdateUser),
);
auth.patch(
  "/admin/users/:userId/promote",
  protectUser,
  protectAdmin,
  tryCatch(AuthController.toggleAdminStatus),
);
auth.post(
  "/admin/users/:userId/otp",
  protectUser,
  protectAdmin,
  tryCatch(AuthController.adminTriggerOTP),
);

// ─── Session & Account Management ─────────────────────────────────────────────
auth.get("/sessions",    protectUser, tryCatch(AuthController.getActiveSessions));
auth.post("/logout-all", protectUser, tryCatch(AuthController.logoutAllDevices));
auth.delete("/account",  protectUser, tryCatch(AuthController.deleteAccount));

export default auth;
