import express from "express";
import BillingController from "../controllers/BillingController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utilis/try-catch.js";

const router = express.Router();

import { body } from "express-validator";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";

router.get("/plans", tryCatch(BillingController.getPlans));
router.post(
  "/initialize",
  protectUser,
  body("planId").notEmpty().withMessage("planId is required"),
  handleValidationErrors,
  tryCatch(BillingController.initialize),
);
router.post("/webhook", tryCatch(BillingController.webhook));

export default router;
