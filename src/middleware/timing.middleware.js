// src/middleware/timing.middleware.js
export const timingMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
    if (duration > 200) {
      console.warn(`[SLOW] ${req.method} ${req.originalUrl} — ${duration.toFixed(2)}ms | Status: ${res.statusCode}`);
    }
  });
  next();
};
