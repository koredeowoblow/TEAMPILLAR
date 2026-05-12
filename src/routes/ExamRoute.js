import express from "express";
import ExamController from "../controllers/ExamController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/rbac.js";
import { tryCatch } from "../utilis/try-catch.js";

const router = express.Router();

// Schedule new exam - admin only
router.post(
  "/",
  protectUser,
  requireRole("ADMIN"),
  tryCatch(ExamController.create),
);

export default router;
