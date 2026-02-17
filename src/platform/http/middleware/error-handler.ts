// src/platform/http/middleware/error-handler.ts
import type { Request, Response, NextFunction } from "express";
import { log } from "#logger";
import {
  DomainError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "../../../shared/errors.js";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.v0Context?.requestId;

  log.error("http.request.failed", {
    event: "http.request.failed",
    requestId,
    url: req.url,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  // Handle domain errors (business logic errors)
  if (err instanceof NotFoundError) {
    (res.locals as Record<string, unknown>).errorCode = "NOT_FOUND";
    return res.status(404).json({
      error: err.name,
      message: err.message,
      requestId,
    });
  }

  if (err instanceof ConflictError) {
    (res.locals as Record<string, unknown>).errorCode = "CONFLICT";
    return res.status(409).json({
      error: err.name,
      message: err.message,
      requestId,
    });
  }

  if (err instanceof ForbiddenError) {
    (res.locals as Record<string, unknown>).errorCode = "FORBIDDEN";
    return res.status(403).json({
      error: err.name,
      message: err.message,
      requestId,
    });
  }

  if (err instanceof ValidationError) {
    (res.locals as Record<string, unknown>).errorCode = "VALIDATION_ERROR";
    return res.status(400).json({
      error: err.name,
      message: err.message,
      requestId,
    });
  }

  // Generic domain error
  if (err instanceof DomainError) {
    (res.locals as Record<string, unknown>).errorCode = err.code;
    return res.status(400).json({
      error: err.name,
      code: err.code,
      message: err.message,
      requestId,
    });
  }

  // Database errors (pg-specific)
  if (err.name === "QueryFailedError" || (err as any).code) {
    const pgError = err as any;

    // Unique constraint violation
    if (pgError.code === "23505") {
      (res.locals as Record<string, unknown>).errorCode = "DB_UNIQUE_VIOLATION";
      return res.status(409).json({
        error: "Conflict",
        message: "A record with this value already exists",
        requestId,
      });
    }

    // Foreign key violation
    if (pgError.code === "23503") {
      (res.locals as Record<string, unknown>).errorCode = "DB_FOREIGN_KEY_VIOLATION";
      return res.status(400).json({
        error: "Bad Request",
        message: "Referenced record does not exist",
        requestId,
      });
    }

    // Other database errors
    (res.locals as Record<string, unknown>).errorCode = "DB_ERROR";
    return res.status(500).json({
      error: "Database Error",
      message: "A database error occurred",
      requestId,
    });
  }

  // Default: Internal Server Error
  (res.locals as Record<string, unknown>).errorCode = "INTERNAL_SERVER_ERROR";
  return res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err.message,
    requestId,
  });
};

/**
 * 404 Not Found Handler
 * Catches requests to undefined routes
 * Should be registered BEFORE error handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
    requestId: req.v0Context?.requestId,
  });
};
