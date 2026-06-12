import express from "express";
import SupportController from "../controllers/SupportController.js";
import { optionalProtectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";

const router = express.Router();

router.post(
  "/ticket",
  optionalProtectUser,
  tryCatch(SupportController.createTicket)
);

export default router;
