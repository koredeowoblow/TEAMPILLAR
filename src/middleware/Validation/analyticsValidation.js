import { query } from "express-validator";

// Analytics summary query validation
export const validateAnalyticsSummary = [
  query("from").optional().isISO8601().withMessage("from must be ISO date"),
  query("to").optional().isISO8601().withMessage("to must be ISO date"),
];

// Student analytics query validation
export const validateStudentAnalytics = [
  query("from").optional().isISO8601().withMessage("from must be ISO date"),
  query("to").optional().isISO8601().withMessage("to must be ISO date"),
  query("subjectId")
    .optional()
    .notEmpty()
    .withMessage("subjectId must not be empty"),
];
