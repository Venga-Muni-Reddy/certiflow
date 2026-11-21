import { Router, Request, Response } from 'express';
import { state } from '../state.js';

export const chaosRouter = Router();

/**
 * GET /api/chaos
 * Returns current failure and timeout configuration plus telemetry
 */
chaosRouter.get('/chaos', (_req: Request, res: Response) => {
  res.json({
    chaos: state.chaos,
    stats: state.stats
  });
});

/**
 * POST /api/chaos
 * Dynamically adjusts chaos simulation parameters for tests or demo
 */
chaosRouter.post('/chaos', (req: Request, res: Response) => {
  const { failureRate, timeoutRate } = req.body;

  if (typeof failureRate === 'number') {
    state.chaos.failureRate = Math.max(0, Math.min(1, failureRate));
  }
  if (typeof timeoutRate === 'number') {
    state.chaos.timeoutRate = Math.max(0, Math.min(1, timeoutRate));
  }

  res.json({
    message: 'Chaos settings updated successfully.',
    chaos: state.chaos
  });
});

/**
 * POST /api/reset
 * Clears message store and idempotency ledger (for automated tests)
 */
chaosRouter.post('/reset', (_req: Request, res: Response) => {
  state.reset();
  res.json({
    message: 'WhatsApp inbox, idempotency ledger, and statistics reset to zero.',
    stats: state.stats
  });
});
