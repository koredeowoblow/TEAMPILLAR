import express from "express";
import rateLimit from "express-rate-limit";
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


const router = express.Router();

const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(adminRateLimiter);

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
