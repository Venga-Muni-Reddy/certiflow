import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId || 'unknown';
  console.error(`[Error] [${correlationId}]`, err);

  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 422 : 500);
  const code = err.code || (statusCode === 422 ? 'VALIDATION_ERROR' : 'INTERNAL_SERVER_ERROR');
  const message = err.message || 'An unexpected internal server error occurred.';

  res.status(statusCode).json({
    error: {
      code,
      message,
      correlationId,
      ...(err.details ? { details: err.details } : {})
    }
  });
}
