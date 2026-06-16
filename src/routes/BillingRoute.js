import express from "express";
import BillingController from "../controllers/BillingController.js";
import { protectUser } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
import { requireRole } from "../middleware/rbac.js"; //student role added here, might be removed in the future when guardians are implemented

import AdminPricingController from "../controllers/AdminPricingController.js";

const router = express.Router();

import { body } from "express-validator";
import { handleValidationErrors } from "../middleware/Validation/handleValidationErrors.js";

router.get("/plans", tryCatch(AdminPricingController.getPublicPlans));
router.post(
  "/initialize",
  protectUser,
  requireRole("STUDENT"),
  body("planId").notEmpty().withMessage("planId is required"),
  body("billingCycle").notEmpty().withMessage("billingCycle is required"),
  handleValidationErrors,
  tryCatch(BillingController.initialize),
);
router.post(
  "/subscribe",
  protectUser,
  requireRole("STUDENT"),
  body("planId").notEmpty().withMessage("planId is required"),
  body("billingCycle").notEmpty().withMessage("billingCycle is required"),
  handleValidationErrors,
  tryCatch(BillingController.initializeSubscription),
);
router.get("/verify", protectUser,requireRole("STUDENT"), tryCatch(BillingController.verify));
router.post("/webhook", tryCatch(BillingController.webhook));

export default router;
