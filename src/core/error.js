import { AppError } from "../utils/AppError.js";
import { logger } from "./logger.js";
import { sendError } from "./response.js";

export { AppError };

const handleCastErrorDB = (err) => {
  const message = "Invalid request.";
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const message = "Duplicate field value.";
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const message = "Invalid input data.";
  return new AppError(message, 400);
};

const handleJWTError = () => new AppError("Unauthorized", 401);

const handleJWTExpiredError = () => new AppError("Unauthorized", 401);

const handleSyntaxError = (err) => {
  const message = "Invalid JSON payload.";
  return new AppError(message, 400);
};

const sendErrorDev = (err, res) => {
  logger.error("request_error", {
    statusCode: err.statusCode,
    status: err.status,
    message: err.message,
    stack: err.stack,
    error: err,
  });

  return sendError(res, {
    statusCode: err.statusCode,
    status: err.status,
    message: err.message || "Something went wrong",
    meta: err?.meta,
    errorCode: err?.errorCode || "ERR_INTERNAL",
    data: {
      name: err?.name || "Error",
      stack: err?.stack || null,
      details: err?.errors || err?.details || null,
      cause: err?.cause?.message || null,
    },
  });
};

const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    return sendError(res, {
      statusCode: err.statusCode,
      status: err.status,
      message: err.message,
      meta: err?.meta,
      errorCode: err?.errorCode || "ERR_INTERNAL",
    });
  }

  // Programming or other unknown error: don't leak error details
  logger.error("ERROR 💥", err);

  return sendError(res, {
    statusCode: 500,
    status: "error",
    message: "Something went wrong",
    meta: err?.meta,
  });
};

export const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Handle JSON Syntax Errors specifically and early
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    const syntaxErr = handleSyntaxError(err);
    if (process.env.NODE_ENV === "development") {
      return sendErrorDev(syntaxErr, res);
    }
    return sendErrorProd(syntaxErr, res);
  }

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === "production") {
    let error = { ...err };
    error.message = err.message; // Explicitly copy message as it's not enumerable

    if (error.name === "CastError") error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error, res);
  } else {
    // Default fallback
    sendErrorDev(err, res);
  }
};
