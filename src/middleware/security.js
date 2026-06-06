import helmet from "helmet";
import { logger } from "../core/logger.js";

const HSTS_MAX_AGE_SECONDS =
  Number.parseInt(process.env.HSTS_MAX_AGE_SECONDS ?? "", 10) || 63072000;

const EXPECT_CT_MAX_AGE_SECONDS =
  Number.parseInt(process.env.EXPECT_CT_MAX_AGE_SECONDS ?? "", 10) || 86400;

const EXPECT_CT_REPORT_URI = process.env.EXPECT_CT_REPORT_URI?.trim();

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"]
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: HSTS_MAX_AGE_SECONDS,
    includeSubDomains: true,
    preload: true,
  },
  xContentTypeOptions: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}

function isSecureRequest(req) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();

  return req.secure || forwardedProto === "https" || req.socket?.encrypted;
}

function buildHttpsUrl(req) {
  const hostHeader = req.get("x-forwarded-host") || req.get("host");
  const host = hostHeader?.split(",")[0]?.trim();

  if (!host) {
    return null;
  }

  return `https://${host}${req.originalUrl}`;
}

function buildExpectCtHeader() {
  const parts = [`max-age=${EXPECT_CT_MAX_AGE_SECONDS}`, "enforce"];

  if (EXPECT_CT_REPORT_URI) {
    parts.push(`report-uri=\"${EXPECT_CT_REPORT_URI}\"`);
  }

  return parts.join(", ");
}

export function enforceSecureTransport(req, res, next) {
  const host = req.get("host") || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("[::1]");

  if (!isProductionEnvironment() || isSecureRequest(req) || isLocal) {
    return next();
  }

  const forwardedProto = req.get("x-forwarded-proto") || "none";
  const httpsUrl = buildHttpsUrl(req);

  logger.warn("Rejected insecure request", {
    method: req.method,
    path: req.originalUrl,
    forwardedProto,
    ip: req.ip,
  });

  if (httpsUrl) {
    return res.redirect(308, httpsUrl);
  }

  return res.status(403).json({
    status: "error",
    message: "HTTPS is required",
  });
}

export function applySecurityHeaders(req, res, next) {
  securityHeaders(req, res, (err) => {
    if (err) {
      return next(err);
    }

    if (isSecureRequest(req)) {
      res.setHeader("Expect-CT", buildExpectCtHeader());
    }

    return next();
  });
}
