import cron from "node-cron";
import { logger } from "../core/logger.js";

const DEFAULT_KEEP_ALIVE_CRON = "*/1 * * * *";

const resolveRenderServiceHost = () => {
  const rawServiceName = process.env.RENDER_SERVICE_NAME?.trim();
  if (!rawServiceName) return null;
  const normalizedServiceName = rawServiceName.replace(/[^a-zA-Z0-9-]/g, "");
  if (!normalizedServiceName) return null;
  return `https://${normalizedServiceName}.onrender.com`;
};

const getKeepAliveSource = () => {
  if (process.env.RENDER_KEEP_ALIVE_URL) return "RENDER_KEEP_ALIVE_URL";
  if (process.env.RENDER_EXTERNAL_URL) return "RENDER_EXTERNAL_URL";
  if (process.env.BASE_URL) return "BASE_URL";
  if (process.env.RENDER_SERVICE_NAME) return "RENDER_SERVICE_NAME";
  return "LOCALHOST_FALLBACK";
};

const resolveKeepAliveUrl = (port) => {
  const configuredUrl = (
    process.env.RENDER_KEEP_ALIVE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.BASE_URL ||
    resolveRenderServiceHost() ||
    `http://127.0.0.1:${port}`
  )?.trim();

  if (!configuredUrl) {
    return null;
  }

  try {
    const keepAliveUrl = new URL(configuredUrl);
    const normalizedBasePath = (keepAliveUrl.pathname || "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/$/, "");
    keepAliveUrl.pathname = `${normalizedBasePath === "/" ? "" : normalizedBasePath}/health`;
    keepAliveUrl.search = "";
    keepAliveUrl.hash = "";

    logger.info("Resolved keep-alive target", {
      url: keepAliveUrl.toString(),
      source: getKeepAliveSource(),
    });

    return keepAliveUrl.toString();
  } catch {
    logger.warn("Skipping Render keep-alive cron because URL is invalid", {
      configuredUrl,
    });
    return null;
  }
};

export const scheduleRenderKeepAlive = ({ port }) => {
  const keepAliveUrl = resolveKeepAliveUrl(port);
  const schedule =
    process.env.RENDER_KEEP_ALIVE_CRON || DEFAULT_KEEP_ALIVE_CRON;

  if (!keepAliveUrl) {
    logger.info("Render keep-alive cron not configured");
    return;
  }

  if (!cron.validate(schedule)) {
    logger.warn(
      "Skipping Render keep-alive cron because expression is invalid",
      {
        schedule,
      },
    );
    return;
  }

  const pingKeepAlive = async () => {
    try {
      const fetchImpl =
        globalThis.fetch || (await import("node-fetch")).default;
      const response = await fetchImpl(keepAliveUrl, {
        method: "GET",
        headers: {
          "User-Agent": "mowdmin-render-keepalive",
        },
      });

      if (!response.ok) {
        logger.warn("Render keep-alive ping returned non-success status", {
          url: keepAliveUrl,
          status: response.status,
        });
      }
    } catch (err) {
      logger.warn("Render keep-alive ping failed", {
        url: keepAliveUrl,
        message: err.message,
      });
    }
  };

  // Run once on startup so deployment logs immediately confirm keep-alive wiring.
  void pingKeepAlive();

  const keepAliveTask = cron.schedule(schedule, pingKeepAlive, {
    scheduled: false,
  });
  keepAliveTask.start();

  logger.warn("Render keep-alive cron scheduled", {
    schedule,
    url: keepAliveUrl,
  });
};
