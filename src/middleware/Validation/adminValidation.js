import { body, query, param } from "express-validator";

// List students with pagination and filtering
export const validateListStudents = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("search")
    .optional()
    .isString()
    .trim()
    .withMessage("search must be a string"),
  query("role")
    .optional()
    .isIn(["STUDENT", "TUTOR", "ADMIN"])
    .withMessage("invalid role"),
  query("classArm").optional().isString().trim(),
  query("subjectFilter").optional().isString().trim(),
  query("scoreRange").optional().isString().trim(),
];

// Get single student
export const validateGetStudent = [
  param("id")
    .notEmpty()
    .withMessage("student id is required")
    .isMongoId()
    .withMessage("student id must be a valid MongoDB ID"),
];

// Bulk question upload validation
export const validateUploadQuestions = [
  body().isArray().withMessage("request body must be an array of questions"),
  body("*.subjectId").notEmpty().withMessage("subjectId is required"),
  body("*.content.type")
    .isIn(["text", "image", "equation"])
    .withMessage("content.type must be text, image, or equation"),
  body("*.content.value").notEmpty().withMessage("content.value is required"),
  body("*.options")
    .isArray({ min: 2, max: 5 })
    .withMessage("options must have 2-5 items"),
  body("*.options.*.text").notEmpty().withMessage("option text is required"),
  body("*.options.*.isCorrect")
    .isBoolean()
    .withMessage("isCorrect must be boolean"),
  body("*.metadata.year")
    .optional()
    .isInt({ min: 2000, max: new Date().getFullYear() })
    .withMessage("invalid year"),
  body("*.metadata.difficulty")
    .optional()
    .isIn(["EASY", "MEDIUM", "HARD"])
    .withMessage("difficulty must be EASY, MEDIUM, or HARD"),
];

// Analytics reports query validation
export const validateAnalyticsReports = [
  query("from").optional().isISO8601().withMessage("from must be ISO date"),
  query("to").optional().isISO8601().withMessage("to must be ISO date"),
  query("subjectId")
    .optional()
    .notEmpty()
    .withMessage("subjectId must not be empty"),
];
