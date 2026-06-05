import { body, validationResult } from "express-validator";
import { sendValidationError } from "../../core/response.js";
import { userRepository } from "../../repository/UserRepository.js";
// ✅ Password complexity regex
export const validatePassword = (password) => {
  const re =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return re.test(String(password));
};

// ✅ Express-validator rules for registration
export const validateUserRegistration = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters"),
  body("fullName")
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters"),
  body().custom((_, { req }) => {
    const name = (req.body.name || req.body.fullName || "").trim();
    if (name.length < 2) {
      throw new Error("Name is required and must be at least 2 characters");
    }
    return true;
  }),

  body("email").trim().isEmail().withMessage("Invalid email format"),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .custom((value) => {
      if (!validatePassword(value)) {
        throw new Error(
          "Password must include uppercase, lowercase, number, and special character",
        );
      }
      return true;
    }),
];

// ✅ Express-validator rules for login
export const validateUserLogin = [
  body("email").trim().isEmail().withMessage("Valid email is required"),

  body("password").notEmpty().withMessage("Password is required"),
];

// ✅ Forgot password validation
export const validateForgotPassword = [
  body("email").isEmail().withMessage("Invalid email"),
  // .custom(async (email) => {
  //   const user = await UserRepository.findByEmail(email);
  //   if (!user) throw new Error("Email not found");
  // }),
];

// ✅ Reset password validation
export const validateResetPassword = [
  body("email")
    .isEmail()
    .withMessage("Invalid email")
    .custom(async (email) => {
      const user = await userRepository.findByEmail(email);
      if (!user) throw new Error("Invalid request");
    }),
  body("otp")
    .isLength({ min: 4, max: 4 })
    .isNumeric()
    .withMessage("OTP must be a 4-digit number"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .custom((value) => {
      if (!validatePassword(value)) {
        throw new Error(
          "Password must include uppercase, lowercase, number, and special character",
        );
      }
      return true;
    }),
  body("confirmPassword").custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error("Password confirmation does not match");
    }
    return true;
  }),
];

// ✅ Change password validation (user is already authenticated — email comes from req.user)
export const validateChangePassword = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long")
    .custom((value) => {
      if (!validatePassword(value)) {
        throw new Error(
          "Password must include uppercase, lowercase, number, and special character",
        );
      }
      return true;
    }),
];

// ✅ Email verification validation
export const validateEmailVerification = [
  body("email")
    .isEmail()
    .withMessage("Invalid email")
    .custom(async (email) => {
      const user = await userRepository.findByEmail(email);
      if (!user) throw new Error("Invalid request");
    }),
  body("otp")
    .isLength({ min: 4, max: 4 })
    .isNumeric()
    .withMessage("OTP must be a 4-digit number"),
];

// ✅ Resend verification validation
export const validateResendVerification = [
  body("email")
    .isEmail()
    .withMessage("Invalid email")
    .custom(async (email) => {
      const user = await userRepository.findByEmail(email);
      if (!user) throw new Error("Invalid request");
    }),
];
// middleware to check validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendValidationError(res, {
      statusCode: 400,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};
