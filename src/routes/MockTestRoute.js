import express from "express";
import MockTestController from "../controllers/MockTestController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { onboardingGuard } from "../middleware/onboardingGuard.js";
import { tryCatch } from "../utils/try-catch.js";
import { generalLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.use(generalLimiter);

router.post("/start", protectUser, onboardingGuard, tryCatch(MockTestController.startMockTest));
router.get("/active", protectUser, onboardingGuard, tryCatch(MockTestController.getActiveSession));
router.patch("/:sessionId/progress", protectUser, tryCatch(MockTestController.saveProgress));
router.post("/submit", protectUser, onboardingGuard, tryCatch(MockTestController.submitMockTest));
router.get("/history", protectUser, onboardingGuard, tryCatch(MockTestController.getMockHistory));
router.get("/stats", protectUser, onboardingGuard, tryCatch(MockTestController.getMockStats));

export default router;
