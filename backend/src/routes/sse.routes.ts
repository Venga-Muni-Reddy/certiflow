import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { sseService } from '../services/sse.service.js';

export const sseRouter = Router();

/**
 * GET /api/v1/events/stream
 * Subscribes user to live platform events (SSE)
 */
sseRouter.get('/stream', authenticate, (req: any, res: Response): void => {
  const clientId = uuidv4();
  sseService.addClient(clientId, res, req.user);
});
