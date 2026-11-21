import { Router, Request, Response, NextFunction } from 'express';
import { certificateService } from '../services/certificate.service.js';

export const publicRouter = Router();

/**
 * GET /api/v1/public/verify/:certificateNumber
 * Zero-Login, Privacy-Guaranteed Public Certificate Verification (Moment #4)
 */
publicRouter.get('/verify/:certificateNumber', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const certNumber = (req.params.certificateNumber || '').trim();
    const verification = await certificateService.verifyPublicCertificate(certNumber);
    res.json(verification);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/certificates/download
 * Secure Candidate Certificate PDF Download with secret download token
 */
publicRouter.get('/certificates/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = (req.query.token as string) || '';
    const { buffer, fileName } = await certificateService.getCandidateDownload(token);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
