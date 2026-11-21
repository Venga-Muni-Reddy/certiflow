import { Router, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { certificateService } from '../services/certificate.service.js';
import { prisma } from '../db/prisma.js';
import { UserRole, RevokeCertificateSchema } from '@certiflow/shared';

export const certificateRouter = Router();

// Protected certificate endpoints
certificateRouter.use(authenticate);

/**
 * GET /api/v1/certificates
 * List all issued certificates (State Office oversight)
 */
certificateRouter.get('/certificates', async (_req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const certificates = await prisma.certificate.findMany({
      include: {
        candidate: true,
        batch: true
      },
      orderBy: { issuedAt: 'desc' },
      take: 100
    });
    res.json({ certificates });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/batches/:batchId/certificates
 * List certificates issued in a batch
 */
certificateRouter.get('/batches/:batchId/certificates', async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const certificates = await certificateService.listBatchCertificates(req.params.batchId, req.user);
    res.json({ certificates });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/certificates/:certificateId/revoke
 * Revoke an issued certificate (State Office only - Moment #4)
 */
certificateRouter.post(
  '/certificates/:certificateId/revoke',
  requireRole([UserRole.STATE_OFFICE]),
  async (req: any, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RevokeCertificateSchema.parse(req.body);
      const result = await certificateService.revokeCertificate(
        req.params.certificateId,
        parsed.reason,
        req.user,
        req.correlationId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
