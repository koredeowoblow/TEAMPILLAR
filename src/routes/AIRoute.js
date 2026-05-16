import express from "express";
import AIController from "../controllers/AIController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import { body } from "express-validator";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";

const router = express.Router();

// Generate explanation for a question
router.post(
  "/explain",
  protectUser,
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
  body("id").notEmpty().withMessage("id is required"),
  body("failRate").isNumeric().withMessage("failRate must be numeric"),
  body("topic").optional().isString(),
  body("distractor").optional().isString(),
  handleValidationErrors,
  tryCatch(AIController.generateQuestionInsight),
);

export default router;
