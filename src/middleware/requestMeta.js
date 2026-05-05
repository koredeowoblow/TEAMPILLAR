import { randomUUID } from "crypto";

export const attachRequestMeta = (req, res, next) => {
  const existingMeta = res.locals?.meta ?? {};

  const headerRequestId =
    req.get("X-Request-Id") ||
    req.get("X-Correlation-Id") ||
    req.get("X-Amzn-Trace-Id");

  const requestId =
    existingMeta.requestId ||
    headerRequestId ||
    (typeof randomUUID === "function"
      ? randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const baseMeta = {
    requestId,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  };

  res.locals.meta = { ...baseMeta, ...existingMeta };
  res.setHeader("X-Request-Id", requestId);

  next();
};
