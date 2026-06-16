import express from "express";
import StudentController from "../controllers/StudentController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { tryCatch } from "../utils/try-catch.js";
import { requireRole } from "../middleware/rbac.js"

const router = express.Router();

router.post(
  "/me/onboarding",
  protectUser,
  requireRole("STUDENT"),
  tryCatch(StudentController.updateOnboarding),
);
router.post(
  "/me/subjects",
  protectUser,
  requireRole("STUDENT"),
  tryCatch(StudentController.updateSelectedSubjects),
);
router.get(
  "/me/dashboard",
  protectUser,
  requireRole("STUDENT"),  //RBAC added
  onboardingGuard,
  tryCatch(StudentController.getDashboard),
);

export default router;
