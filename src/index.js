import express from "express";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import { apiLimiter } from "./middleware/rateLimiter.js";
import cron from "node-cron";
import { logger } from "./core/logger.js";
import "./config/env.js";
import { connectMongoDB } from "./config/mongodb.js";
import { initializeRedis, isRedisAvailable } from "./config/redis.js";
import { attachRequestMeta } from "./middleware/requestMeta.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  applySecurityHeaders,
  enforceSecureTransport,
} from "./middleware/security.js";
import auth from "./routes/AuthRoute.js";
import practice from "./routes/PracticeRoute.js";
import student from "./routes/StudentRoute.js";
import admin from "./routes/AdminRoute.js";
import analytics from "./routes/AnalyticsRoute.js";
import billing from "./routes/BillingRoute.js";
import classes from "./routes/ClassesRoute.js";
import ai from "./routes/AIRoute.js";
import exams from "./routes/ExamRoute.js";
import smartMock from "./routes/SmartMockRoute.js";
import achievements from "./routes/AchievementRoute.js";
import notifications from "./routes/NotificationRoute.js";
import planner from "./routes/PlannerRoute.js";
import support from "./routes/SupportRoute.js";
import { checkMaintenance } from "./middleware/maintenanceMiddleware.js";
import PlatformSettings from "./models/PlatformSettingsModel.js";
import { timingMiddleware } from "./middleware/timing.middleware.js";
import { startHealthMonitor } from "./utils/healthMonitor.js";

// Routes utils
import { measurePerformance } from "./utils/performance.js";
import { scheduleRenderKeepAlive } from "./utils/keepAlive.js";

const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.REQUEST_TIMEOUT_MS || "10000",
  10,
);
const SOCKET_TIMEOUT_MS = Number.parseInt(
  process.env.SOCKET_TIMEOUT_MS || "120000",
  10,
);

let mongoConnectionReady = false;
let redisConnectionReady = false;

// Validate NODE_ENV
if (!process.env.NODE_ENV) {
  console.error(
    '❌ FATAL: NODE_ENV is not set. Set to "production" for production deployments.',
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  logger.info("Running in PRODUCTION mode - security hardened");
} else {
  logger.warn(
    "⚠️ Running in NON-PRODUCTION mode - additional debugging enabled",
  );
}

const app = express();
app.use(timingMiddleware);

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.use(enforceSecureTransport);
app.use(applySecurityHeaders);

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server or requests without Origin
    if (!origin) return callback(null, true);

    const isLocalhost =
      /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

    if (allowedOrigins.includes(origin) || isLocalhost) {
      return callback(null, true);
    }
    return callback(new Error("CORS policy violation: Origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

app.use(cors(corsOptions));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("tiny"));
}

app.use(compression());

// Replace the existing mongoSanitize middleware with a custom wrapper
app.use((req, res, next) => {
  if (req.body) {
    mongoSanitize.sanitize(req.body, {
      allowDots: true, // Allow dot-notation in keys
      replaceWith: "_", // Replace prohibited characters with '_'
    });
  }
  next();
});

// Health check
const healthCheckHandler = measurePerformance(async (_req, res) => {
  const dbStatus = mongoConnectionReady ? "connected" : "disconnected";
  const redisStatus = redisConnectionReady ? "connected" : "disconnected";

  let maintenanceMode = false;
  try {
    const settings = await PlatformSettings.findOne({});
    maintenanceMode = !!settings?.maintenanceMode;
  } catch (err) {
    // Ignore error
  }

  const healthy = dbStatus === "connected" && !maintenanceMode;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : (maintenanceMode ? "maintenance" : "unhealthy"),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    services: {
      database: dbStatus,
      redis: redisStatus,
      maintenanceMode,
    },
  });
}, "GET /health");

app.get("/health", healthCheckHandler);

// Parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API Router
const apiRouter = express.Router();
apiRouter.use(apiLimiter);
apiRouter.use(checkMaintenance);
app.use("/api/v1", apiRouter);

apiRouter.use("/auth", auth);
apiRouter.use("/practice", practice);
apiRouter.use("/student", student);
apiRouter.use("/analytics", analytics);
apiRouter.use("/billing", billing);
apiRouter.use("/classes", classes);
apiRouter.use("/ai", ai);
apiRouter.use("/ai-tutor", ai);
apiRouter.use("/exams", exams);
apiRouter.use("/practice/smart-mock", smartMock);
apiRouter.use("/", achievements); // registers /achievements, /streaks, /leaderboard under /api/v1/
apiRouter.use("/notifications", notifications);
apiRouter.use("/planner", planner);
apiRouter.use("/support", support);

// Admin & Student Registry routes
apiRouter.use("/", admin); // Exposes /students, /tutors, etc. at /api/v1/
apiRouter.use("/admin", admin); // Exposes /admin/settings, etc.

// Root
const rootHandler = measurePerformance(async (_req, res) => {
  const { getEmailServiceHealth } = await import("./config/email.js");
  const emailHealth = getEmailServiceHealth();

  res.status(200).json({
    message: "Pillar API is running",
    health: {
      mongodb: mongoConnectionReady ? "healthy" : "unavailable",
      redis: redisConnectionReady ? "healthy" : "unavailable",
      email: emailHealth,
    },
  });
}, "GET /");

app.get("/", rootHandler);

// 404
app.use((req, _res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  next(error);
});

app.use(errorHandler);

// Process safety
process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION! Shutting down...", {
    name: err.name,
    message: err.message,
  });
  process.exit(1);
});

let server;

async function bootstrap() {
  try {
    startHealthMonitor();
    // MongoDB only
    logger.info("Connecting to MongoDB...");
    await connectMongoDB();
    mongoConnectionReady = true;

    // Redis
    logger.info("Connecting to Redis...");
    await initializeRedis();
    redisConnectionReady = isRedisAvailable();

    // Cron jobs
    logger.info("Starting background cron jobs...");

    cron.schedule("0 * * * *", async () => {
      try {
        const PaymentService = (await import("./services/PaymentService.js"))
          .default;
        await PaymentService.expirePendingPayments();
      } catch (err) {
        logger.error("[Cron] Error running expirePendingPayments", {
          message: err.message,
        });
      }
    });

    try {
      // EventCleanupWorker.start("0 2 * * *");
      // logger.info("Event cleanup worker scheduled");
    } catch (err) {
      logger.error("Failed to start event cleanup worker", {
        message: err.message,
      });
    }

    scheduleRenderKeepAlive({ port: PORT });

    // Start server
    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });

    server.setTimeout(SOCKET_TIMEOUT_MS);
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.headersTimeout = REQUEST_TIMEOUT_MS + 5000;

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      server.close(async () => {
        logger.info("HTTP server closed");

        try {
          // Close Redis
          try {
            const { getRedisClient } = await import("./config/redis.js");
            const redis = await getRedisClient();
            if (redis && redis.isOpen) {
              await redis.quit();
              logger.info("Redis connection closed");
            }
          } catch (rErr) {
            logger.warn("Error closing Redis during shutdown", {
              message: rErr.message,
            });
          }

          // Wait for pending AI requests
          try {
            const { default: AIService } =
              await import("./services/AIService.js");
            const cleanShutdown = await AIService.waitForRequests(10000);
            if (!cleanShutdown) {
              logger.warn(
                "Some AI requests did not complete in time during shutdown",
              );
            }
          } catch (aiErr) {
            logger.error("Error during AI shutdown", {
              message: aiErr.message,
            });
          }

          logger.info("Graceful shutdown complete");
          process.exit(0);
        } catch (error) {
          logger.error("Error during overall shutdown", {
            message: error.message,
          });
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (err) {
    logger.error("Startup failed", { message: err.message });
    process.exit(1);
  }
}

process.on("unhandledRejection", (err) => {
  logger.error("UNHANDLED REJECTION! Shutting down...", {
    name: err.name,
    message: err.message,
  });

  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

export default app;

if (process.env.NODE_ENV !== "test") {
  bootstrap();
}
