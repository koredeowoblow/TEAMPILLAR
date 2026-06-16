import express from "express";
import AchievementController from "../controllers/AchievementController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import { requireRole } from "../middleware/rbac.js";
import { generalLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();
router.use(generalLimiter);

router.get(
  "/achievements",
  protectUser,
  requireRole("STUDENT"),
  tryCatch(AchievementController.getAchievements),
);

router.post(
  "/streaks",
  protectUser,
  requireRole("STUDENT"),
  tryCatch(AchievementController.updateStreak),
);

router.get(
  "/leaderboard",
  protectUser,
  requireRole("STUDENT"),
  tryCatch(AchievementController.getLeaderboard),
);

export default router;
