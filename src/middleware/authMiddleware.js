import jwt from "jsonwebtoken";
import { userRepository } from "../repository/UserRepository.js";
import AuthRepository from "../repository/AuthRepository.js";
import AuthService from "../services/AuthService.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../core/logger.js";
import {
  getCachedSessionUser,
  setCachedSessionUser,
  shouldSkipSessionTouch,
  markSessionTouch,
  invalidateCachedSessionUser,
} from "../utils/authSessionCache.js";

const authRepository = new AuthRepository();

// Minimal user projection — only fields needed for auth checks and attaching to req.user
const USER_AUTH_SELECT =
  "_id name username email photoUrl photo language role isAdmin isActive isPro emailVerified onboarding stats notificationPreferences privacySettings subscription subscriptionStatus proExpiresAt selectedSubjects lastSubjectUpdate createdAt";

// Map to track lookups in progress to deduplicate concurrent requests for the same token
const pendingLookups = new Map();

/**
 * Middleware to protect routes and ensure the user is authenticated.
 */
export const protectUser = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(new AppError("Unauthorized", 401));
    }

    // Verify JWT token with pinned algorithm
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // Check if token exists in Auth DB (Session Check)
    const tokenHash = AuthService.hashToken(token);
    const isMutationMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(
      req.method,
    );

    let session;
    let user;

    if (!isMutationMethod) {
      const cached = getCachedSessionUser(tokenHash);
      if (cached) {
        session = cached.session;
        user = cached.user;
      }
    }

    if (!session || !user) {
      // Deduplicate concurrent lookups for the same session token
      let lookupPromise = pendingLookups.get(tokenHash);
      if (!lookupPromise) {
        lookupPromise = Promise.all([
          authRepository.findSessionByToken(tokenHash),
          userRepository.findById(decoded.id, {
            lean: true,
            select: USER_AUTH_SELECT,
          }),
        ]);
        pendingLookups.set(tokenHash, lookupPromise);
        
        lookupPromise.finally(() => {
          pendingLookups.delete(tokenHash);
        });
      }

      [session, user] = await lookupPromise;

      if (!isMutationMethod && session && user) {
        setCachedSessionUser(tokenHash, { session, user });
      }
    }

    if (!session || session.isLoggedOut) {
      invalidateCachedSessionUser(tokenHash);
      return next(new AppError("Unauthorized", 401));
    }

    if (!user) {
      return next(new AppError("Unauthorized", 401));
    }

    if (user.isActive === false) {
      return next(new AppError("Account is deactivated", 403));
    }

    // Server-side session timeout
    let timeoutMs = 0;
    if (process.env.INACTIVITY_TIMEOUT_MS) {
      timeoutMs = Number.parseInt(process.env.INACTIVITY_TIMEOUT_MS, 10);
    } else {
      const timeoutMinutesRaw =
        process.env.AUTH_SESSION_TIMEOUT_MINUTES ||
        process.env.SESSION_TIMEOUT_MINUTES ||
        "0";
      const timeoutMinutes = Number.parseInt(timeoutMinutesRaw, 10);
      if (Number.isFinite(timeoutMinutes) && timeoutMinutes > 0) {
        timeoutMs = timeoutMinutes * 60 * 1000;
      }
    }

    // Throttle how often we write the "last used" timestamp to DB
    const touchIntervalSecondsRaw =
      process.env.AUTH_SESSION_TOUCH_INTERVAL_SECONDS || "60";
    const touchIntervalSeconds = Number.parseInt(touchIntervalSecondsRaw, 10);

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      const lastUsedValue = session.lastLogin || session.createdAt;
      const lastUsedAt = lastUsedValue ? new Date(lastUsedValue) : null;

      if (lastUsedAt && !Number.isNaN(lastUsedAt.getTime())) {
        const nowMs = Date.now();
        const expiresAt = new Date(
          lastUsedAt.getTime() + timeoutMs,
        );

        if (nowMs > expiresAt.getTime()) {
          // Mark session as logged out to prevent reuse
          await authRepository.invalidateSession(tokenHash);
          invalidateCachedSessionUser(tokenHash);
          return next(
            new AppError("Unauthorized", 401, {
              reason: "session_timeout",
              expiresAt: expiresAt.toISOString(),
              timeoutMinutes: timeoutMs / 60000,
            }),
          );
        }

        // Sliding session: update last-used timestamp (throttled)
        if (Number.isFinite(touchIntervalSeconds) && touchIntervalSeconds > 0) {
          const shouldTouch =
            nowMs - lastUsedAt.getTime() >= touchIntervalSeconds * 1000;
          if (shouldTouch) {
            const sessionId = (session?._id || tokenHash).toString();
            if (!shouldSkipSessionTouch(sessionId)) {
              markSessionTouch(sessionId);
              // Keep cached session activity fresh so timeout checks do not use stale lastLogin.
              if (!isMutationMethod) {
                setCachedSessionUser(tokenHash, {
                  session: {
                    ...(typeof session?.toObject === "function"
                      ? session.toObject()
                      : session),
                    lastLogin: new Date(nowMs),
                  },
                  user,
                });
              }
              setImmediate(async () => {
                try {
                  await Promise.all([
                    authRepository.touchToken(tokenHash, new Date(nowMs)),
                    userRepository.updateUser(user._id, { lastActive: new Date(nowMs) }),
                  ]);
                } catch (touchError) {
                  logger.error("Failed to update session activity", {
                    message: touchError.message,
                  });
                }
              });
            }
          }
        }
      }
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Unauthorized", 401));
    }

    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Unauthorized", 401));
    }

    next(error);
  }
};

export const protectAdmin = async (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  return next(new AppError("Forbidden", 403));
};

/**
 * Middleware to ensure the user has a pro subscription.
 */
export const requirePro = (req, res, next) => {
  if (req.user && req.user.subscription === "pro") {
    return next();
  }

  return res.status(403).json({
    status: "error",
    code: "UPGRADE_REQUIRED",
    message: "This feature requires a Pro subscription",
    upgradeUrl: "/pricing",
  });
};

export const optionalProtectUser = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const tokenHash = AuthService.hashToken(token);
    const session = await authRepository.findSessionByToken(tokenHash);
    const user = await userRepository.findById(decoded.id, {
      lean: true,
      select: USER_AUTH_SELECT,
    });

    if (session && !session.isLoggedOut && user && user.isActive !== false) {
      req.user = user;
    }
    next();
  } catch (error) {
    next();
  }
};
