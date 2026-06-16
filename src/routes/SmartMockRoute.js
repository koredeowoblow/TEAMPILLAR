import express from "express";
import { generalLimiter } from "../middleware/rateLimiters.js";
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



/**
 * @route POST /api/v1/practice/smart-mock/generate
 * @desc Generate an AI-powered smart mock session
 * @access Private
 */
router.post(
  "/generate",
  generalLimiter,
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
  generalLimiter,
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  validateSubmitSession,
  handleValidationErrors,
  tryCatch(SmartMockController.submitSmartMock)
);

export default router;
