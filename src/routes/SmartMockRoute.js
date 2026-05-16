import express from "express";
import SmartMockController from "../controllers/SmartMockController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import {
  validateStartSession,
  validateSubmitSession,
} from "../middleware/Validation/practiceValidation.js";

const router = express.Router();

/**
 * @route POST /api/v1/practice/smart-mock/generate
 * @desc Generate an AI-powered smart mock session
 * @access Private
 */
router.post(
  "/generate",
  protectUser,
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
  protectUser,
  validateSubmitSession,
  handleValidationErrors,
  tryCatch(SmartMockController.submitSmartMock)
);

export default router;
