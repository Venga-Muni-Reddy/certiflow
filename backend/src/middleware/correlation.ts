import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user?: any;
    }
  }
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.header('X-Correlation-ID') || uuidv4()).trim();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
}
