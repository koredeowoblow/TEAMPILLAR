import express from "express";
import StudentController from "../controllers/StudentController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";

const router = express.Router();

router.post(
  "/me/onboarding",
  protectUser,
  tryCatch(StudentController.updateOnboarding),
);
router.get(
  "/me/dashboard",
  protectUser,
  tryCatch(StudentController.getDashboard),
);

export default router;
