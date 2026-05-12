import express from "express";
import AdminController from "../controllers/AdminController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utilis/try-catch.js";
import {
  validateListStudents,
  validateGetStudent,
  validateUploadQuestions,
  validateAnalyticsReports,
} from "../middleware/Validation/adminValidation.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";

const router = express.Router();

router.get(
  "/students",
  protectUser,
  protectAdmin,
  validateListStudents,
  handleValidationErrors,
  tryCatch(AdminController.listStudents),
);
router.get(
  "/students/:id",
  protectUser,
  protectAdmin,
  validateGetStudent,
  handleValidationErrors,
  tryCatch(AdminController.getStudent),
);
router.get(
  "/analytics/reports",
  protectUser,
  protectAdmin,
  validateAnalyticsReports,
  handleValidationErrors,
  tryCatch(AdminController.analyticsReports),
);
router.get(
  "/dashboard/stats",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.dashboardStats),
);
router.post(
  "/questions",
  protectUser,
  protectAdmin,
  validateUploadQuestions,
  handleValidationErrors,
  tryCatch(AdminController.uploadQuestions),
);
router.get(
  "/tutors",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getTutors),
);

router.get(
  "/settings",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getSettings),
);

export default router;
