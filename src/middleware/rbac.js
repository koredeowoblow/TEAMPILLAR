import { AppError } from "../utils/AppError.js";

// RBAC roles mapping to allowed actions
const rolePermissions = {
  STUDENT: [
    "read:practice",
    "write:session",
    "read:analytics:own",
    "read:profile",
    "write:profile",
  ],
  TUTOR: [
    "read:practice",
    "read:students",
    "read:analytics:student",
    "write:feedback",
  ],
  ADMIN: ["read:*", "write:*", "delete:*"],
};

// Authorize middleware: check if user has required permission
export const authorize = (requiredPermissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Unauthorized", 401));
    }

    const userRole = req.user.role || "STUDENT";
    const userPermissions = rolePermissions[userRole] || [];

    // Check if user has admin wildcard or specific permission
    const hasPermission = requiredPermissions.some(
      (perm) =>
        userPermissions.includes(perm) ||
        userPermissions.includes("write:*") ||
        userPermissions.includes("read:*"),
    );

    if (!hasPermission) {
      return next(new AppError("Forbidden", 403));
    }

    next();
  };
};

// Enforce single role
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Unauthorized", 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403));
    }
    next();
  };
};
