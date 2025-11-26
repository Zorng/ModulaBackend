// src/platform/http/middleware/upload.ts
import multer from "multer";
import type { Request } from "express";
// import type { File as MulterFile } from "multer";

/**
 * File Upload Middleware (Multer)
 * Handles multipart/form-data file uploads
 *
 * Configuration:
 * - Storage: Memory (buffer) - files stored in RAM temporarily
 * - Max file size: 5MB
 * - Allowed types: JPEG, PNG, WebP
 * - Field name: 'image'
 */

// Configure multer with memory storage
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Allowed MIME types
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    cb(
      new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`)
    );
  }
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 1, // Only 1 file per request
  },
});

/**
 * Single image upload middleware
 * Usage: app.post('/upload', uploadSingleImage, controller)
 *
 * The uploaded file will be available at req.file
 */
export const uploadSingleImage = upload.single("image");

/**
 * Optional single image upload middleware
 * Doesn't fail if no file is provided (useful for optional images)
 */
/**
 * Optional single image upload middleware
 * Doesn't fail if no file is provided (useful for optional images)
 */
export const uploadOptionalSingleImage = (
  req: Request,
  res: any,
  next: (err?: any) => void
) => {
  upload.single("image")(req, res, (err: any) => {
    // If no file was uploaded, continue without error
    if (
      err instanceof multer.MulterError &&
      err.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      return next();
    }
    // Other errors should be caught
    if (err) {
      return next(err);
    }
    next();
  });
};

/**
 * Error handler for multer errors
 * Converts multer-specific errors to user-friendly messages
 */
export const handleMulterError = (
  err: any,
  req: Request,
  res: any,
  next: any
) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File Too Large",
        message: "Image must be less than 5MB",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Unexpected file field. Use 'image' field name.",
      });
    }
  }

  // Pass other errors to global error handler
  next(err);
};
