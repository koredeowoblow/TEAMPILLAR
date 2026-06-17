import { logQueue } from "../queues/logQueue.js";
import { logger } from "../core/logger.js";

class LogService {
  static logAction({ userId, userRole, category, action, description, metadata = {}, req = null }) {
    try {
      const payload = {
        type: "action",
        userId: userId || null,
        userRole,
        category,
        action,
        description,
        metadata: this.sanitizeMetadata(metadata),
      };

      if (req) {
        payload.ipAddress = req.ip || req.socket?.remoteAddress;
        payload.userAgent = req.get("user-agent");
      }

      logQueue.add("log.create", payload, { removeOnComplete: true, removeOnFail: true }).catch((err) => {
        logger.warn("Failed to queue action log", { error: err.message });
      });
    } catch (err) {
      logger.warn("LogService error", { error: err.message });
    }
  }

  static logError(err, { req = null, category = "system", action = "unhandled_error", userId = null, userRole = null, metadata = {} } = {}) {
    try {
      const payload = {
        type: "error",
        userId: userId || req?.user?._id || null,
        userRole: userRole || req?.user?.role || null,
        category,
        action,
        description: err.message || "An error occurred",
        statusCode: err.statusCode || err.status || 500,
        errorMessage: err.message,
        errorStack: err.stack,
        metadata: this.sanitizeMetadata(metadata),
      };

      if (req) {
        payload.ipAddress = req.ip || req.socket?.remoteAddress;
        payload.userAgent = req.get("user-agent");
      }

      logQueue.add("log.create", payload, { removeOnComplete: true, removeOnFail: true }).catch((errQueue) => {
        logger.warn("Failed to queue error log", { error: errQueue.message });
      });
    } catch (errCatch) {
      logger.warn("LogService error", { error: errCatch.message });
    }
  }

  static sanitizeMetadata(metadata) {
    if (!metadata) return {};
    const sanitized = { ...metadata };
    const sensitiveKeys = ["password", "token", "jwt", "otp", "card", "cvv", "secret", "authorization"];
    const traverse = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === "object" && obj[key] !== null) {
          traverse(obj[key]);
        } else if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          obj[key] = "[REDACTED]";
        }
      }
    };
    traverse(sanitized);
    return sanitized;
  }
}

export default LogService;
