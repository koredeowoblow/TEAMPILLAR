import express from "express";
import PracticeController from "../controllers/PracticeController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
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
import { requireEntitlement } from "../middleware/entitlement.js";
import { generalLimiter } from "../middleware/rateLimiters.js";
const router = express.Router();
router.use(generalLimiter);

// Public: get questions for a subject (user must be authenticated in PRD, but allow auth optional)
router.get(
  "/questions",
  protectUser,
  requireRole("STUDENT"), //RBAC added
  onboardingGuard,
  validateGetQuestions,
  handleValidationErrors,
  tryCatch(PracticeController.getQuestions),
);

// Adaptive Engine: mid-session batched fetching
router.post(
  "/questions/next",
  protectUser,
  requireRole("STUDENT"), //RBAC added
  onboardingGuard,
  validateNextQuestions,
  handleValidationErrors,
  tryCatch(PracticeController.getNextQuestions),
);
router.get("/sessions", protectUser, requireRole("STUDENT"), onboardingGuard, tryCatch(PracticeController.getSessions));

// Subjects
router.get("/subjects", protectUser, requireRole("STUDENT"), tryCatch(PracticeController.getSubjects));

// Topics
router.get("/topics", protectUser, requireRole("STUDENT"), onboardingGuard, tryCatch(PracticeController.getTopicsForSubject));

// Session Lifecycle
router.post(
  "/session/start",
  protectUser,
  requireRole("STUDENT"),
  requireEntitlement("practice:multi_subject"),
  requireEntitlement("practice:unlimited_questions"),
  onboardingGuard,
  validateStartSession,
  handleValidationErrors,
  tryCatch(PracticeController.startSession),
);

router.post(
  "/session/submit",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  validateSubmitSession,
  handleValidationErrors,
  tryCatch(PracticeController.submit),
);

router.post(
  "/session/visibility",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  validateSessionVisibility,
  handleValidationErrors,
  tryCatch(PracticeController.recordVisibility),
);

router.get("/session/result/:id", protectUser, requireRole("STUDENT"),onboardingGuard, tryCatch(PracticeController.getResult));

export default router;
