const buildFallbackRequestMeta = (res) => {
  const req = res?.req;
  if (!req) return {};

  const headerRequestId =
    (typeof req.get === "function" &&
      (req.get("X-Request-Id") || req.get("X-Correlation-Id") || req.get("X-Amzn-Trace-Id"))) ||
    req.headers?.["x-request-id"] ||
    req.headers?.["x-correlation-id"] ||
    req.headers?.["x-amzn-trace-id"];

  return {
    requestId:
      res?.locals?.meta?.requestId ||
      res?.getHeader?.("X-Request-Id") ||
      headerRequestId ||
      undefined,
    ip: req.ip,
    userAgent: (typeof req.get === "function" ? req.get("User-Agent") : req.headers?.["user-agent"]) || undefined,
    // method: req.method,
    // path: req.originalUrl || req.url,
    timestamp: new Date().toISOString(),
  };
};

const mergeMeta = (res, meta = {}) => {
  const requestMeta = res?.locals?.meta ?? {};
  const fallbackMeta = buildFallbackRequestMeta(res);
  return { ...fallbackMeta, ...requestMeta, ...meta };
};

export const sendSuccess = (res, { message = "Success", data = {}, meta = {}, statusCode = 200 } = {}) => {
  return res.status(statusCode).json({
    status: "success",
    message,
    data,
    meta: mergeMeta(res, meta),
  });
};

export const sendError = (res, { message = "Error", statusCode = 400, data = {}, meta = {} } = {}) => {
  return res.status(statusCode).json({
    status: "error",
    message,
    data,
    meta: mergeMeta(res, meta),
  });
};

// Validation responses in this codebase historically use { success: false, errors: [...] }.
// This helper keeps that shape but ensures meta is consistently included.
export const sendValidationError = (
  res,
  { message = "Validation failed", statusCode = 422, errors = [], meta = {} } = {}
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    meta: mergeMeta(res, meta),
  });
};
