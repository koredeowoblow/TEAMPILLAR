import express from "express";
import AdminController from "../controllers/AdminController.js";
import PracticeController from "../controllers/PracticeController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
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
router.patch(
  "/students/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.updateStudent),
);
router.delete(
  "/students/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.deleteStudent),
);
router.post(
  "/students/export",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.exportStudents),
);
router.post(
  "/students/remind",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.sendReminder),
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
  "/analytics/reports/export",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.exportAnalytics),
);
router.post(
  "/analytics/schedule",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.scheduleReport),
);
router.get(
  "/dashboard/stats",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.dashboardStats),
);
router.get(
  "/questions",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.listQuestions),
);
router.get(
  "/questions/stats",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.questionStats),
);
router.post(
  "/questions",
  protectUser,
  protectAdmin,
  validateUploadQuestions,
  handleValidationErrors,
  tryCatch(AdminController.uploadQuestions),
);
router.put(
  "/questions/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.updateQuestion),
);
router.delete(
  "/questions/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.deleteQuestion),
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

/* ─────────────────── SUBJECTS ─────────────────── */

router.get(
  "/subjects",
  protectUser,
  protectAdmin,
  tryCatch(PracticeController.getSubjects),
);

router.post(
  "/subjects",
  protectUser,
  protectAdmin,
  tryCatch(PracticeController.createSubject),
);

router.patch(
  "/subjects/:id",
  protectUser,
  protectAdmin,
  tryCatch(PracticeController.updateSubject),
);

router.delete(
  "/subjects/:id",
  protectUser,
  protectAdmin,
  tryCatch(PracticeController.deleteSubject),
);

export default router;
