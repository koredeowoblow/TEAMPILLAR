import express from "express";
import SupportController from "../controllers/SupportController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import { chatLimiter, generalLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// Student Routes
router.post("/tickets", protectUser, generalLimiter, tryCatch(SupportController.createTicket));
router.get("/tickets", protectUser, generalLimiter, tryCatch(SupportController.listStudentTickets));
router.get("/tickets/:id", protectUser, generalLimiter, tryCatch(SupportController.getTicket));
router.post("/tickets/:id/messages", protectUser, chatLimiter, tryCatch(SupportController.studentSendMessage));

// Admin Routes 
// Prefixed automatically in index.js with /api/v1/support
router.get("/admin/tickets", protectUser, protectAdmin, generalLimiter, tryCatch(SupportController.listAdminTickets));
router.get("/admin/tickets/stats", protectUser, protectAdmin, generalLimiter, tryCatch(SupportController.getStats));
router.get("/admin/tickets/:id", protectUser, protectAdmin, generalLimiter, tryCatch(SupportController.getTicket));
router.patch("/admin/tickets/:id", protectUser, protectAdmin, generalLimiter, tryCatch(SupportController.updateTicket));
router.post("/admin/tickets/:id/messages", protectUser, protectAdmin, chatLimiter, tryCatch(SupportController.adminSendMessage));

export default router;
