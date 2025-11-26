import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        ...req.body,
        ...req.params,
        ...req.query
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues.map((err: ZodIssue) => ({
            path: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
}
