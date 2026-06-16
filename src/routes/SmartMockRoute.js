import express from "express";
import rateLimit from "express-rate-limit";
import SmartMockController from "../controllers/SmartMockController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { tryCatch } from "../utils/try-catch.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import {
  validateStartSession,
  validateSubmitSession,
} from "../middleware/Validation/practiceValidation.js";
import { requireRole } from "../middleware/rbac.js";

const router = express.Router();

const smartMockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each user/IP to 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route POST /api/v1/practice/smart-mock/generate
 * @desc Generate an AI-powered smart mock session
 * @access Private
 */
router.post(
  "/generate",
  smartMockLimiter,
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  validateStartSession,
  handleValidationErrors,
  tryCatch(SmartMockController.generateSmartMock)
);

/**
 * @route POST /api/v1/practice/smart-mock/submit
 * @desc Submit and grade a smart mock session
 * @access Private
 */
router.post(
  "/submit",
  smartMockLimiter,
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  validateSubmitSession,
  handleValidationErrors,
  tryCatch(SmartMockController.submitSmartMock)
);

export default router;
