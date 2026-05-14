import { body, query } from "express-validator";

// Student onboarding validation
export const validateUpdateOnboarding = [
  body("subjects")
    .optional()
    .isArray()
    .withMessage("subjects must be an array"),
  body("targetScore")
    .optional()
    .isInt({ min: 0, max: 400 })
    .withMessage("targetScore must be between 0 and 400"),
  body("studyPlan")
    .optional()
    .isIn(["1-2 hours", "3-4 hours", "5+ hours"])
    .withMessage("invalid studyPlan"),
];

// Student dashboard query validation
export const validateGetDashboard = [
  query("period")
    .optional()
    .isIn(["week", "month", "all"])
    .withMessage("invalid period"),
];
