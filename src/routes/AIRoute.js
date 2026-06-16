import express from "express";
import AIController from "../controllers/AIController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { tryCatch } from "../utils/try-catch.js";
import { body } from "express-validator";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import { requireRole } from "../middleware/rbac.js";

const router = express.Router();

// Generate explanation for a question
router.post(
  "/explain",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  body("questionId").notEmpty().withMessage("questionId is required"),
  body("context")
    .optional()
    .isObject()
    .withMessage("context must be an object"),
  handleValidationErrors,
  tryCatch(AIController.explain),
);

// Generate personalized study plan
router.post(
  "/study-plan",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  body("weakTopics")
    .optional()
    .isArray()
    .withMessage("weakTopics must be an array"),
  handleValidationErrors,
  tryCatch(AIController.generateStudyPlan),
);

router.post(
  "/question-insight",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  body("id").notEmpty().withMessage("id is required"),
  body("failRate").isNumeric().withMessage("failRate must be numeric"),
  body("topic").optional().isString(),
  body("distractor").optional().isString(),
  handleValidationErrors,
  tryCatch(AIController.generateQuestionInsight),
);

router.post(
  "/chat",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  body("message").notEmpty().withMessage("message is required"),
  body("subject").optional().isString(),
  body("sessionId").optional().isString(),
  body("history").optional().isArray(),
  handleValidationErrors,
  tryCatch(AIController.chat),
);

export default router;
