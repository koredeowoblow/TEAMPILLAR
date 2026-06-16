import express from "express";
import AnalyticsController from "../controllers/AnalyticsController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { tryCatch } from "../utils/try-catch.js";
import {
  validateAnalyticsSummary,
  validateStudentAnalytics,
} from "../middleware/Validation/analyticsValidation.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import { requireRole } from "../middleware/rbac.js";

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
  requireRole("STUDENT"),
  onboardingGuard,
  validateStudentAnalytics,
  handleValidationErrors,
  tryCatch(AnalyticsController.studentAnalytics),
);

// Student Portal Analytics
router.get("/overview", protectUser, requireRole("STUDENT"), onboardingGuard, tryCatch(AnalyticsController.getOverviewStats));
router.get("/subjects", protectUser, requireRole("STUDENT"), onboardingGuard, tryCatch(AnalyticsController.getSubjectPerformance));
router.get("/topics", protectUser, requireRole("STUDENT"), onboardingGuard, tryCatch(AnalyticsController.getTopicPerformance));
router.get("/trends", protectUser, requireRole("STUDENT"),  onboardingGuard, tryCatch(AnalyticsController.getPerformanceTrends));
router.get("/trend", protectUser, requireRole("STUDENT"), onboardingGuard, tryCatch(AnalyticsController.getSessionTrend));

export default router;
