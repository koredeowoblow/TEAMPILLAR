import express from "express";
import StudentController from "../controllers/StudentController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { tryCatch } from "../utils/try-catch.js";

const router = express.Router();

router.post(
  "/me/onboarding",
  protectUser,
  tryCatch(StudentController.updateOnboarding),
);
router.post(
  "/me/subjects",
  protectUser,
  tryCatch(StudentController.updateSelectedSubjects),
);
router.get(
  "/me/dashboard",
  protectUser,
  onboardingGuard,
  tryCatch(StudentController.getDashboard),
);

export default router;
