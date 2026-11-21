import { Router, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { batchService } from '../services/batch.service.js';
import { excelService } from '../services/excel.service.js';
import { UserRole, BatchStatus, CreateBatchSchema, DecisionSchema } from '@certiflow/shared';

export const batchRouter = Router();

// All batch routes require authentication
batchRouter.use(authenticate);

/**
 * POST /api/v1/batches
 * Create new DRAFT batch (Training Centre only)
 */
batchRouter.post(
  '/',
  requireRole([UserRole.TRAINING_CENTRE]),
  async (req: any, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateBatchSchema.parse(req.body);
      const batch = await batchService.createBatch(parsed.courseName, req.user, req.correlationId);
      res.status(201).json(batch);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/batches/ingest
 * Atomic create & spreadsheet candidate ingestion in a single step (Moment #1)
 */
batchRouter.post(
  '/ingest',
  requireRole([UserRole.TRAINING_CENTRE]),
  uploadMiddleware.single('file'),
  async (req: any, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: {
            code: 'FILE_MISSING',
            message: 'Multipart field "file" containing .csv or .xlsx spreadsheet is required.',
            correlationId: req.correlationId
          }
        });
        return;
      }

      // 2-pass atomic validation
      const parseResult = excelService.parseAndValidateSpreadsheet(req.file.buffer, req.file.originalname);

      if (!parseResult.valid) {
        res.status(422).json({
          error: {
            code: 'SPREADSHEET_VALIDATION_FAILED',
            message: `${parseResult.errors.length} validation error(s) found. No candidates were saved.`,
            correlationId: req.correlationId,
            details: parseResult.errors
          }
        });
        return;
      }

      const courseName = req.body.courseName || 'Full Stack Web Development';
      const batch = await batchService.createBatch(courseName, req.user, req.correlationId);

      const uploadResult = await batchService.uploadCandidates(
        batch.id,
        parseResult.rows,
        req.user,
        req.correlationId
      );

      res.status(201).json({
        batch,
        candidateCount: uploadResult.uploadedCount
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/batches
 * List batches (role-scoped)
 */
batchRouter.get('/', async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = req.query.status as BatchStatus | undefined;
    const escalatedOnly = req.query.escalatedOnly === 'true';
    const batches = await batchService.listBatches(req.user, status, escalatedOnly);
    res.json({ batches });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/batches/:batchId
 * Get detailed batch information, candidate rows, and audit trail
 */
batchRouter.get('/:batchId', async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const details = await batchService.getBatchDetails(req.params.batchId, req.user);
    res.json(details);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/batches/:batchId/candidates/upload
 * Atomic Candidate Spreadsheet Ingestion (Moment #1)
 */
batchRouter.post(
  '/:batchId/candidates/upload',
  requireRole([UserRole.TRAINING_CENTRE]),
  uploadMiddleware.single('file'),
  async (req: any, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: {
            code: 'FILE_MISSING',
            message: 'Multipart field "file" containing .csv or .xlsx spreadsheet is required.',
            correlationId: req.correlationId
          }
        });
        return;
      }

      // 2-pass atomic validation
      const parseResult = excelService.parseAndValidateSpreadsheet(req.file.buffer, req.file.originalname);

      // If ANY row failed, return 422 with structured line errors and commit 0 rows
      if (!parseResult.valid) {
        res.status(422).json({
          error: {
            code: 'SPREADSHEET_VALIDATION_FAILED',
            message: `${parseResult.errors.length} validation error(s) found. No candidates were saved.`,
            correlationId: req.correlationId,
            details: parseResult.errors
          }
        });
        return;
      }

      // Commit valid candidates atomically inside single transaction
      const result = await batchService.uploadCandidates(
        req.params.batchId,
        parseResult.rows,
        req.user,
        req.correlationId
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/batches/:batchId/submit
 * Submit draft batch for District review
 */
batchRouter.post(
  '/:batchId/submit',
  requireRole([UserRole.TRAINING_CENTRE]),
  async (req: any, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await prisma.batch.findUnique({ where: { id: req.params.batchId } });
      if (existing?.status === BatchStatus.CHANGES_REQUESTED) {
        const batch = await batchService.resubmitBatch(req.params.batchId, req.user, req.correlationId);
        res.json(batch);
        return;
      }
      const batch = await batchService.submitBatch(req.params.batchId, req.user, req.correlationId);
      res.json(batch);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/batches/:batchId/resubmit
 * Resubmit a sent-back batch with version increment (Moment #6)
 */
batchRouter.post(
  '/:batchId/resubmit',
  requireRole([UserRole.TRAINING_CENTRE]),
  async (req: any, res: Response, next: NextFunction): Promise<void> => {
    try {
      const batch = await batchService.resubmitBatch(req.params.batchId, req.user, req.correlationId);
      res.json(batch);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/batches/:batchId/decisions
 * Record officer approval, rejection, or send-back with concurrency lock (Moments #2 & #3)
 */
batchRouter.post(
  ['/:batchId/decisions', '/:batchId/decide'],
  requireRole([UserRole.DISTRICT_OFFICER, UserRole.QUALITY_TEAM, UserRole.STATE_OFFICE]),
  async (req: any, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decision = req.body.decision;
      const reason = req.body.reason || req.body.comments;
      const parsed = DecisionSchema.parse({ decision, reason });
      const result = await batchService.recordDecision(
        req.params.batchId,
        parsed.decision,
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
