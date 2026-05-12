import { body, query } from "express-validator";

export const validateGetQuestions = [
  query("subjectId").notEmpty().withMessage("subjectId is required"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage("limit must be an integer between 1 and 200"),
  query("difficulty").optional().isIn(["EASY", "MEDIUM", "HARD"]),
  query("year")
    .optional()
    .isInt({ min: 1900 })
    .withMessage("year must be a valid year"),
];

export const validateStartSession = [
  body("subjectId").notEmpty().withMessage("subjectId is required"),
];

export const validateSubmitSession = [
  body("sessionId").notEmpty().withMessage("sessionId is required"),
  body("responses")
    .isArray({ min: 0 })
    .withMessage("responses must be an array"),
  body("responses.*.questionId")
    .notEmpty()
    .withMessage("questionId is required for each response"),
  body("responses.*.selectedOption").optional(),
  body("tabSwitches")
    .optional()
    .isInt({ min: 0 })
    .withMessage("tabSwitches must be a non-negative integer"),
];
