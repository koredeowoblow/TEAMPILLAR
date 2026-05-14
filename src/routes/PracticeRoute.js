import express from "express";
import PracticeController from "../controllers/PracticeController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/rbac.js";
import { tryCatch } from "../utils/try-catch.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import {
  validateGetQuestions,
  validateStartSession,
  validateSubmitSession,
  validateSessionVisibility,
  validateNextQuestions,
} from "../middleware/Validation/practiceValidation.js";
const router = express.Router();

// Public: get questions for a subject (user must be authenticated in PRD, but allow auth optional)
router.get(
  "/questions",
  protectUser,
  validateGetQuestions,
  handleValidationErrors,
  tryCatch(PracticeController.getQuestions),
);

// Adaptive Engine: mid-session batched fetching
router.post(
  "/questions/next",
  protectUser,
  validateNextQuestions,
  handleValidationErrors,
  tryCatch(PracticeController.getNextQuestions),
);
router.post(
  "/submit",
  protectUser,
  validateSubmitSession,
  handleValidationErrors,
  tryCatch(PracticeController.submit),
);
router.get("/results/:id", protectUser, tryCatch(PracticeController.getResult));

// Subjects
router.get("/subjects", protectUser, tryCatch(PracticeController.getSubjects));

// Session Lifecycle
router.post(
  "/session/start",
  protectUser,
  validateStartSession,
  handleValidationErrors,
  tryCatch(PracticeController.startSession),
);

router.post(
  "/session/submit",
  protectUser,
  validateSubmitSession,
  handleValidationErrors,
  tryCatch(PracticeController.submit),
);

router.post(
  "/session/visibility",
  protectUser,
  validateSessionVisibility,
  handleValidationErrors,
  tryCatch(PracticeController.recordVisibility),
);

router.get("/results/:id", protectUser, tryCatch(PracticeController.getResult));

export default router;
