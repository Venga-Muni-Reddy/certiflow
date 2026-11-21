import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

/**
 * GET /api/v1/auth/demo-users
 * Returns available demo personas for quick switching
 */
authRouter.get('/demo-users', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await authService.getDemoUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/demo-switch
 * Switches active demo user and issues a signed JWT
 */
authRouter.post('/demo-switch', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId is required in request body.'
        }
      });
      return;
    }

    const authResult = await authService.switchDemoUser(userId);
    res.json(authResult);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/auth/me
 * Returns profile of current authenticated user
 */
authRouter.get('/me', authenticate, (req: Request, res: Response): void => {
  res.json({ user: req.user });
});
