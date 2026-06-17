import express from "express";
import { adminLimiter } from "../middleware/rateLimiters.js";
import AdminController from "../controllers/AdminController.js";
import PracticeController from "../controllers/PracticeController.js";
import AdminPricingController from "../controllers/AdminPricingController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import {
  validateListStudents,
  validateGetStudent,
  validateUploadQuestions,
  validateAnalyticsReports,
} from "../middleware/Validation/adminValidation.js";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";
import AdminLogController from "../controllers/AdminLogController.js";

const router = express.Router();

router.use(adminLimiter);

/* ─────────────────── STUDENTS ─────────────────── */

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
  "/students/:id/achievements",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getStudentAchievements),
);
router.get(
  "/students/:studentId/sessions/:sessionId/results",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getStudentSessionResult),
);
router.get(
  "/students/:studentId/practice-setup",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getStudentPracticeSetup),
);
router.get(
  "/students/:studentId/ai-sessions",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getStudentAISessions),
);
router.get(
  "/students/:studentId/ai-sessions/:sessionId/messages",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getStudentAISessionMessages),
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
  "/students",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.createStudent),
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

/* ─────────────────── USER MANAGEMENT (migrated from AuthRoute) ─────────────────── */

router.get(
  "/users",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getAllUsers),
);
router.get(
  "/users/:userId",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getUserById),
);
router.put(
  "/users/:userId",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.adminUpdateUser),
);
router.patch(
  "/users/:userId/promote",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.toggleAdminStatus),
);
router.post(
  "/users/:userId/otp",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.adminTriggerOTP),
);
router.post(
  "/users/create-admin",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.createAdmin),
);
router.delete(
  "/users/:userId",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.deleteUserProfile),
);

/* ─────────────────── ANALYTICS ─────────────────── */

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
router.get(
  "/live-monitor",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.liveMonitorData),
);

/* ─────────────────── LOGS & AUDIT ─────────────────── */

router.get(
  "/logs",
  protectUser,
  protectAdmin,
  tryCatch(AdminLogController.getLogs),
);
router.get(
  "/logs/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminLogController.getLogDetail),
);
router.get(
  "/logs/user/:userId",
  protectUser,
  protectAdmin,
  tryCatch(AdminLogController.getUserTimeline),
);

/* ─────────────────── TUTORS ─────────────────── */

router.get(
  "/tutors",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getTutors),
);

/* ─────────────────── SETTINGS ─────────────────── */

router.get(
  "/settings",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getSettings),
);
router.put(
  "/settings",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.updateSettings),
);

/* ─────────────────── QUESTIONS ─────────────────── */

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
router.get(
  "/questions/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminController.getQuestion),
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

/* ─────────────────── PRICING ─────────────────── */

router.get(
  "/pricing",
  protectUser,
  protectAdmin,
  tryCatch(AdminPricingController.listPlans),
);

router.post(
  "/pricing",
  protectUser,
  protectAdmin,
  tryCatch(AdminPricingController.createPlan),
);

router.put(
  "/pricing/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminPricingController.updatePlan),
);

router.delete(
  "/pricing/:id",
  protectUser,
  protectAdmin,
  tryCatch(AdminPricingController.softDeletePlan),
);

router.put(
  "/pricing/:id/toggle-popular",
  protectUser,
  protectAdmin,
  tryCatch(AdminPricingController.togglePopular),
);

export default router;
