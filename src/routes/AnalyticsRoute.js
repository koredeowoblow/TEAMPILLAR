import express from "express";
import AnalyticsController from "../controllers/AnalyticsController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import {
  validateAnalyticsSummary,
  validateStudentAnalytics,
} from "../middleware/Validation/analyticsValidation.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";

const router = express.Router();

router.get(
  "/summary",
  protectUser,
  protectAdmin,
  validateAnalyticsSummary,
  handleValidationErrors,
  tryCatch(AnalyticsController.summary),
);
router.get(
  "/reports",
  protectUser,
  protectAdmin,
  validateAnalyticsSummary,
  handleValidationErrors,
  tryCatch(AnalyticsController.reports),
);
router.get(
  "/student/:id",
  protectUser,
  validateStudentAnalytics,
  handleValidationErrors,
  tryCatch(AnalyticsController.studentAnalytics),
);

export default router;
