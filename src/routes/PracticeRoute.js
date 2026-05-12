import express from "express";
import PracticeController from "../controllers/PracticeController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/rbac.js";
import { tryCatch } from "../utilis/try-catch.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import {
  validateGetQuestions,
  validateStartSession,
  validateSubmitSession,
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
router.post(
  "/submit",
  protectUser,
  validateSubmitSession,
  handleValidationErrors,
  tryCatch(PracticeController.submit),
);
router.get("/results/:id", protectUser, tryCatch(PracticeController.getResult));

// Subjects and session lifecycle
router.get("/subjects", protectUser, tryCatch(PracticeController.getSubjects));
// Admin CRUD for subjects
router.post(
  "/subjects",
  protectUser,
  requireRole("ADMIN"),
  tryCatch(PracticeController.createSubject),
);
router.put(
  "/subjects/:id",
  protectUser,
  requireRole("ADMIN"),
  tryCatch(PracticeController.updateSubject),
);
router.delete(
  "/subjects/:id",
  protectUser,
  requireRole("ADMIN"),
  tryCatch(PracticeController.deleteSubject),
);
router.post(
  "/start",
  protectUser,
  validateStartSession,
  handleValidationErrors,
  tryCatch(PracticeController.startSession),
);

// PRD-compliant session paths
router.post(
  "/session/start",
  protectUser,
  tryCatch(PracticeController.startSession),
);
router.post(
  "/session/submit",
  protectUser,
  tryCatch(PracticeController.submit),
);
router.post(
  "/session/visibility",
  protectUser,
  tryCatch(PracticeController.recordVisibility),
);

export default router;
