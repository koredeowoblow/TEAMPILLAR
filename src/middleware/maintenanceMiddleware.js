import PlatformSettings from "../models/PlatformSettingsModel.js";
import jwt from "jsonwebtoken";
import { userRepository } from "../repository/UserRepository.js";

// Keep a local cache of maintenance mode to avoid DB queries on every request
let isMaintenanceActive = false;
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache

async function checkMaintenanceMode() {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_TTL_MS) {
    return isMaintenanceActive;
  }

  try {
    const settings = await PlatformSettings.findOne({});
    isMaintenanceActive = !!settings?.maintenanceMode;
    lastCacheUpdate = now;
  } catch (err) {
    console.error("Failed to check maintenance mode status:", err);
  }
  return isMaintenanceActive;
}

export const checkMaintenance = async (req, res, next) => {
  // Allow health check, auth, and admin endpoints to bypass maintenance
  const isHealthCheck = req.path === "/health" || req.path === "/api/v1/health";
  const isAdminRoute = req.path.startsWith("/api/v1/admin") || req.path.startsWith("/admin");
  const isAuthRoute = req.path.startsWith("/api/v1/auth") || req.path.startsWith("/auth");

  if (isHealthCheck || isAdminRoute || isAuthRoute) {
    return next();
  }

  const active = await checkMaintenanceMode();
  if (!active) {
    return next();
  }

  // If maintenance is active, check if the request is from an admin
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"],
      });
      const user = await userRepository.findById(decoded.id);
      if (user && user.isAdmin) {
        return next();
      }
    } catch (err) {
      // Ignore token verification errors
    }
  }

  // Return 503 Service Unavailable for other requests
  res.status(503).json({
    status: "error",
    code: "MAINTENANCE_MODE",
    message: "The platform is currently undergoing scheduled maintenance. Please try again later.",
  });
};
