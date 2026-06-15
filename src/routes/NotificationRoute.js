import express from "express";
import NotificationController from "../controllers/NotificationController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import { generalLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();
router.use(generalLimiter);

// All routes require authentication
router.use(protectUser);

router.get("/",                          tryCatch(NotificationController.list));
router.get("/unread-count",              tryCatch(NotificationController.unreadCount));
router.patch("/mark-all-read",           tryCatch(NotificationController.markAllRead));
router.patch("/:id/read",               tryCatch(NotificationController.markRead));
router.delete("/",                       tryCatch(NotificationController.deleteAll));
router.delete("/:id",                   tryCatch(NotificationController.deleteOne));

export default router;
