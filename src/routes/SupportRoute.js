import express from "express";
import SupportController from "../controllers/SupportController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";

const router = express.Router();

// Student Routes
router.post("/tickets", protectUser, tryCatch(SupportController.createTicket));
router.get("/tickets", protectUser, tryCatch(SupportController.listStudentTickets));
router.get("/tickets/:id", protectUser, tryCatch(SupportController.getTicket));
router.post("/tickets/:id/messages", protectUser, tryCatch(SupportController.studentSendMessage));

// Admin Routes 
// Prefixed automatically in index.js with /api/v1/support
router.get("/admin/tickets", protectUser, protectAdmin, tryCatch(SupportController.listAdminTickets));
router.get("/admin/tickets/stats", protectUser, protectAdmin, tryCatch(SupportController.getStats));
router.get("/admin/tickets/:id", protectUser, protectAdmin, tryCatch(SupportController.getTicket));
router.patch("/admin/tickets/:id", protectUser, protectAdmin, tryCatch(SupportController.updateTicket));
router.post("/admin/tickets/:id/messages", protectUser, protectAdmin, tryCatch(SupportController.adminSendMessage));

export default router;
