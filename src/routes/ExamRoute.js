import express from "express";
import ExamController from "../controllers/ExamController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { requireRole } from "../middleware/rbac.js";
import { tryCatch } from "../utils/try-catch.js";
import { generalLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();
router.use(generalLimiter);

// Schedule new exam - admin only
router.post(
  "/",
  protectUser,
  onboardingGuard,
  requireRole("ADMIN"),
  tryCatch(ExamController.create),
);

export default router;
