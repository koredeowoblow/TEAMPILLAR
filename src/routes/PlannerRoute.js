import express from "express";
import PlannerController from "../controllers/PlannerController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import { body } from "express-validator";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";

const router = express.Router();

// GET /planner/schedule — fetch existing schedule
router.get(
  "/schedule",
  protectUser,
  tryCatch(PlannerController.getSchedule),
);

// POST /planner/generate — generate a new schedule
router.post(
  "/generate",
  protectUser,
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
  body("date").notEmpty().withMessage("date is required (YYYY-MM-DD)"),
  handleValidationErrors,
  tryCatch(PlannerController.rescheduleDay),
);

// PATCH /planner/session/:id/complete — toggle session complete
router.patch(
  "/session/:id/complete",
  protectUser,
  tryCatch(PlannerController.markComplete),
);

export default router;
