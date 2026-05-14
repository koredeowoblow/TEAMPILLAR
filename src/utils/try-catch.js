// src/Utils/try-catch.js

import { measurePerformance } from "./performance.js";

/**
 * Wrapper to handle async errors in controllers.
 * Avoids repetitive try/catch blocks in each route.
 * @param {Function} controller - Async controller function
 * @returns {Function} Express middleware
 */
export const tryCatch = (controller) => async (req, res, next) => {
  try {
    const label = `${req.method} ${req.originalUrl || req.path}`;
    const controllerWithPerformance = measurePerformance(
      () => controller(req, res, next),
      label,
    );

    await controllerWithPerformance();
  } catch (err) {
    next(err); // Pass error to your global error handler
  }
};
