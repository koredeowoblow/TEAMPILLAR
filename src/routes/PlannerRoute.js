import express from "express";
import PlannerController from "../controllers/PlannerController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { tryCatch } from "../utils/try-catch.js";
import { body } from "express-validator";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import { requireRole } from "../middleware/rbac.js";
import { generalLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();
router.use(generalLimiter);

// GET /planner/schedule — fetch existing schedule
router.get(
  "/schedule",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  tryCatch(PlannerController.getSchedule),
);

// POST /planner/generate — generate a new schedule
router.post(
  "/generate",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  body("targetScore").isNumeric().withMessage("targetScore must be a number"),
  body("hoursPerDay").isNumeric().withMessage("hoursPerDay must be a number"),
  body("examDate").notEmpty().withMessage("examDate is required"),
  body("prioritySubjects").optional().isArray(),
  body("studyPreference").optional().isString(),
  handleValidationErrors,
  tryCatch(PlannerController.generate),
);

// POST /planner/reschedule-day — regenerate today's sessions
router.post(
  "/reschedule-day",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  body("date").notEmpty().withMessage("date is required (YYYY-MM-DD)"),
  handleValidationErrors,
  tryCatch(PlannerController.rescheduleDay),
);

// PATCH /planner/session/:id/complete — toggle session complete
router.patch(
  "/session/:id/complete",
  protectUser,
  requireRole("STUDENT"),
  onboardingGuard,
  tryCatch(PlannerController.markComplete),
);

export default router;
