// src/Utils/AppError.js
export class AppError extends Error {
  constructor(message, statusCode, meta = {}, errorCode) {
    super(message);

    this.statusCode = statusCode || 500;
    this.status = `${this.statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    this.errorCode = errorCode || meta?.errorCode;

    if (meta && typeof meta === "object") {
      this.meta = meta;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}
