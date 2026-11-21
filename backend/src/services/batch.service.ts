import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import {
  UserRole,
  BatchStatus,
  ApprovalStage,
  ApprovalDecision,
  ApprovalRecordStatus,
  BatchSummaryDTO,
  BatchDetailDTO,
  CandidateRowInput,
  CandidateUploadResponseDTO
} from '@certiflow/shared';
import { AuthenticatedUser } from '../middleware/auth.js';
import { auditService } from './audit.service.js';
import { sseService } from './sse.service.js';
import { outboxService } from './outbox.service.js';

export class BatchService {
  /**
   * Create a new DRAFT batch
   */
  public async createBatch(courseName: string, user: AuthenticatedUser, correlationId: string) {
    if (!user.trainingCentreId) {
      throw new Error('Only training centre operators can create batches.');
    }

    const tc = await prisma.trainingCentre.findUnique({
      where: { id: user.trainingCentreId },
      include: { district: true }
    });

    if (!tc) {
      throw new Error('Training centre profile not found.');
    }

    const countToday = await prisma.batch.count({
      where: { trainingCentreId: tc.id }
    });
    const batchCode = `BCH-2026-${tc.code}-${String(countToday + 1).padStart(3, '0')}`;

    const batch = await prisma.batch.create({
      data: {
        batchCode,
        courseName,
        trainingCentreId: tc.id,
        districtId: tc.districtId,
        status: BatchStatus.DRAFT,
        candidateCount: 0,
        submissionVersion: 1,
        version: 1,
        stateEnteredAt: new Date()
      }
    });

    await auditService.log({
      entityType: 'BATCH',
      entityId: batch.id,
      actorId: user.id,
      actorRole: user.role,
      action: 'BATCH_CREATED',
      metadata: { batchCode, courseName },
      correlationId
    });

    return batch;
  }

  /**
   * Role-scoped listing of batches
   */
  public async listBatches(user: AuthenticatedUser, queryStatus?: BatchStatus, escalatedOnly = false): Promise<BatchSummaryDTO[]> {
    const where: any = {};

    if (queryStatus) {
      where.status = queryStatus;
    }

    if (escalatedOnly) {
      where.escalatedAt = { not: null };
    }

    // Role Scoping
    if (user.role === UserRole.TRAINING_CENTRE) {
      where.trainingCentreId = user.trainingCentreId;
    } else if (user.role === UserRole.DISTRICT_OFFICER) {
      where.districtId = user.districtId;
    } else if (user.role === UserRole.QUALITY_TEAM) {
      // Quality team sees batches in PENDING_QUALITY or batches they reviewed
      where.OR = [
        { status: BatchStatus.PENDING_QUALITY },
        { candidateCount: { gt: 50 }, status: { in: [BatchStatus.PENDING_STATE, BatchStatus.APPROVED_ISSUING, BatchStatus.ISSUED] } }
      ];
    }
    // STATE_OFFICE has global visibility

    const batches = await prisma.batch.findMany({
      where,
      include: {
        district: true,
        trainingCentre: true,
        approvals: {
          where: {
            stage: ApprovalStage.DISTRICT,
            decision: ApprovalDecision.APPROVE,
            status: ApprovalRecordStatus.ACTIVE
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return batches.map((b) => ({
      id: b.id,
      batchCode: b.batchCode,
      courseName: b.courseName,
      trainingCentreName: b.trainingCentre.name,
      districtCode: b.district.code,
      districtName: b.district.name,
      status: b.status as BatchStatus,
      candidateCount: b.candidateCount,
      requiresQualityReview: b.candidateCount > 50,
      submissionVersion: b.submissionVersion,
      districtApprovalsCount: b.approvals.filter((a) => a.submissionVersion === b.submissionVersion).length,
      districtApprovalsRequired: 2,
      stateEnteredAt: b.stateEnteredAt.toISOString(),
      escalatedAt: b.escalatedAt ? b.escalatedAt.toISOString() : null,
      lastFeedback: b.lastFeedback
    }));
  }

  /**
   * Get detailed batch view with candidates preview and full audit timeline
   */
  public async getBatchDetails(batchId: string, user: AuthenticatedUser): Promise<BatchDetailDTO> {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        district: true,
        trainingCentre: true,
        candidates: { orderBy: { rowNumber: 'asc' } },
        approvals: {
          include: { actor: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!batch) {
      const err: any = new Error('Batch not found.');
      err.statusCode = 404;
      err.code = 'BATCH_NOT_FOUND';
      throw err;
    }

    // Horizontal tenant guard
    if (user.role === UserRole.TRAINING_CENTRE && batch.trainingCentreId !== user.trainingCentreId) {
      const err: any = new Error('Forbidden. You do not own this batch.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (user.role === UserRole.DISTRICT_OFFICER && batch.districtId !== user.districtId) {
      const err: any = new Error('Forbidden. Batch belongs to another district.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const auditTrail = await prisma.auditLog.findMany({
      where: { entityType: 'BATCH', entityId: batch.id },
      orderBy: { createdAt: 'desc' }
    });

    const activeDistrictApprovals = batch.approvals.filter(
      (a) =>
        a.submissionVersion === batch.submissionVersion &&
        a.stage === ApprovalStage.DISTRICT &&
        a.decision === ApprovalDecision.APPROVE &&
        a.status === ApprovalRecordStatus.ACTIVE
    ).length;

    return {
      batch: {
        id: batch.id,
        batchCode: batch.batchCode,
        courseName: batch.courseName,
        trainingCentreName: batch.trainingCentre.name,
        districtCode: batch.district.code,
        districtName: batch.district.name,
        status: batch.status as BatchStatus,
        candidateCount: batch.candidateCount,
        requiresQualityReview: batch.candidateCount > 50,
        submissionVersion: batch.submissionVersion,
        districtApprovalsCount: activeDistrictApprovals,
        districtApprovalsRequired: 2,
        stateEnteredAt: batch.stateEnteredAt.toISOString(),
        escalatedAt: batch.escalatedAt ? batch.escalatedAt.toISOString() : null,
        lastFeedback: batch.lastFeedback
      },
      candidates: batch.candidates.map((c) => ({
        id: c.id,
        rowNumber: c.rowNumber,
        fullName: c.fullName,
        phoneNumber: c.phoneNumber,
        candidateGovId: c.candidateGovId,
        assessmentScore: Number(c.assessmentScore),
        completionDate: c.completionDate.toISOString().split('T')[0]!
      })),
      approvals: batch.approvals.map((a) => ({
        id: a.id,
        submissionVersion: a.submissionVersion,
        stage: a.stage as ApprovalStage,
        actorName: a.actor.name,
        actorRole: a.actor.role as UserRole,
        decision: a.decision as ApprovalDecision,
        reason: a.reason,
        status: a.status as ApprovalRecordStatus,
        createdAt: a.createdAt.toISOString()
      })),
      auditTrail: auditTrail.map((at) => ({
        id: at.id,
        action: at.action,
        actorRole: at.actorRole,
        metadata: at.metadata as Record<string, unknown>,
        correlationId: at.correlationId,
        createdAt: at.createdAt.toISOString()
      }))
    };
  }

  /**
   * Atomic Candidate Spreadsheet Upload (Moment #1)
   */
  public async uploadCandidates(
    batchId: string,
    candidates: CandidateRowInput[],
    user: AuthenticatedUser,
    correlationId: string
  ): Promise<CandidateUploadResponseDTO> {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch) {
      const err: any = new Error('Batch not found.');
      err.statusCode = 404;
      err.code = 'BATCH_NOT_FOUND';
      throw err;
    }

    if (batch.trainingCentreId !== user.trainingCentreId) {
      const err: any = new Error('Forbidden. You do not own this batch.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (batch.status !== BatchStatus.DRAFT && batch.status !== BatchStatus.CHANGES_REQUESTED) {
      const err: any = new Error(`Candidates cannot be uploaded to a batch in '${batch.status}' status.`);
      err.statusCode = 409;
      err.code = 'INVALID_BATCH_STATUS';
      throw err;
    }

    // Atomic Database Transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete prior candidate rows for this draft batch
      await tx.batchCandidate.deleteMany({ where: { batchId: batch.id } });

      // 2. Insert validated candidate records
      const candidateRecords = candidates.map((c, idx) => ({
        batchId: batch.id,
        rowNumber: idx + 1,
        fullName: c.fullName,
        phoneNumber: c.phoneNumber,
        candidateGovId: c.candidateGovId,
        assessmentScore: c.assessmentScore,
        completionDate: new Date(c.completionDate)
      }));

      await tx.batchCandidate.createMany({
        data: candidateRecords
      });

      // 3. Update candidate count on batch
      await tx.batch.update({
        where: { id: batch.id },
        data: {
          candidateCount: candidates.length,
          version: { increment: 1 }
        }
      });

      // 4. Record audit log
      await tx.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: batch.id,
          actorId: user.id,
          actorRole: user.role,
          action: 'CANDIDATES_UPLOADED',
          metadata: {
            count: candidates.length,
            requiresQualityReview: candidates.length > 50
          },
          correlationId
        }
      });
    });

    return {
      batchId: batch.id,
      uploadedCount: candidates.length,
      requiresQualityReview: candidates.length > 50,
      candidatesPreview: candidates.slice(0, 5).map((c, idx) => ({
        rowNumber: idx + 1,
        fullName: c.fullName,
        phoneNumber: c.phoneNumber,
        candidateGovId: c.candidateGovId,
        assessmentScore: c.assessmentScore,
        completionDate: c.completionDate
      }))
    };
  }

  /**
   * Submit draft batch for approval (DRAFT -> PENDING_DISTRICT)
   */
  public async submitBatch(batchId: string, user: AuthenticatedUser, correlationId: string) {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch) {
      const err: any = new Error('Batch not found.');
      err.statusCode = 404;
      err.code = 'BATCH_NOT_FOUND';
      throw err;
    }

    if (batch.status !== BatchStatus.DRAFT) {
      const err: any = new Error(`Only DRAFT batches can be submitted. Current status: ${batch.status}`);
      err.statusCode = 409;
      err.code = 'INVALID_STATUS';
      throw err;
    }

    if (batch.candidateCount === 0) {
      const err: any = new Error('Cannot submit an empty batch. Upload candidate spreadsheet first.');
      err.statusCode = 422;
      err.code = 'EMPTY_BATCH';
      throw err;
    }

    const updated = await prisma.batch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.PENDING_DISTRICT,
        stateEnteredAt: new Date(),
        version: { increment: 1 }
      }
    });

    await auditService.log({
      entityType: 'BATCH',
      entityId: batch.id,
      actorId: user.id,
      actorRole: user.role,
      action: 'BATCH_SUBMITTED',
      metadata: { submissionVersion: updated.submissionVersion, candidateCount: updated.candidateCount },
      correlationId
    });

    await sseService.emitEvent('BATCH_UPDATED', {
      batchId: updated.id,
      batchCode: updated.batchCode,
      status: updated.status,
      submissionVersion: updated.submissionVersion,
      timestamp: updated.stateEnteredAt.toISOString()
    });

    return updated;
  }

  /**
   * Resubmit a sent-back batch (Moment #6: Resubmission Versioning)
   */
  public async resubmitBatch(batchId: string, user: AuthenticatedUser, correlationId: string) {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch) {
      const err: any = new Error('Batch not found.');
      err.statusCode = 404;
      err.code = 'BATCH_NOT_FOUND';
      throw err;
    }

    if (batch.status !== BatchStatus.CHANGES_REQUESTED) {
      const err: any = new Error(`Only batches in CHANGES_REQUESTED status can be resubmitted.`);
      err.statusCode = 409;
      err.code = 'INVALID_STATUS';
      throw err;
    }

    const newVersion = batch.submissionVersion + 1;

    // Resubmission transaction: mark prior approvals SUPERSEDED, bump version, reset to PENDING_DISTRICT
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Mark prior approvals SUPERSEDED
      await tx.batchApproval.updateMany({
        where: { batchId: batch.id, status: ApprovalRecordStatus.ACTIVE },
        data: { status: ApprovalRecordStatus.SUPERSEDED }
      });

      // 2. Increment submissionVersion, reset status to PENDING_DISTRICT with 0 active approvals
      const b = await tx.batch.update({
        where: { id: batch.id },
        data: {
          status: BatchStatus.PENDING_DISTRICT,
          submissionVersion: newVersion,
          stateEnteredAt: new Date(),
          escalatedAt: null,
          version: { increment: 1 }
        }
      });

      // 3. Immutable audit log
      await tx.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: batch.id,
          actorId: user.id,
          actorRole: user.role,
          action: 'BATCH_RESUBMITTED',
          metadata: {
            previousVersion: batch.submissionVersion,
            newVersion,
            activeApprovalsReset: 0
          },
          correlationId
        }
      });

      return b;
    });

    await sseService.emitEvent('BATCH_UPDATED', {
      batchId: updated.id,
      batchCode: updated.batchCode,
      status: updated.status,
      submissionVersion: updated.submissionVersion,
      timestamp: updated.stateEnteredAt.toISOString()
    });

    return updated;
  }

  /**
   * Concurrency-Safe Officer Decision (Moments #2 & #3)
   */
  public async recordDecision(
    batchId: string,
    decision: ApprovalDecision,
    reason: string | null | undefined,
    user: AuthenticatedUser,
    correlationId: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Acquire pessimistic row lock (FOR UPDATE)
      const rawBatches: any[] = await tx.$queryRawUnsafe(
        `SELECT id, batch_code as "batchCode", status, candidate_count as "candidateCount", 
                submission_version as "submissionVersion", version, district_id as "districtId"
         FROM batches
         WHERE id = $1::uuid
         FOR UPDATE`,
        batchId
      );

      if (!rawBatches || rawBatches.length === 0) {
        const err: any = new Error('Batch not found.');
        err.statusCode = 404;
        err.code = 'BATCH_NOT_FOUND';
        throw err;
      }

      const batch = rawBatches[0];
      const status = batch.status as BatchStatus;

      // 2. Role & Stage Verification Guards
      let stage: ApprovalStage;
      if (user.role === UserRole.DISTRICT_OFFICER) {
        if (status !== BatchStatus.PENDING_DISTRICT) {
          const err: any = new Error(`Batch is in '${status}' state; District Officer cannot act on it.`);
          err.statusCode = 403;
          err.code = 'STAGE_MISMATCH';
          throw err;
        }
        if (batch.districtId !== user.districtId) {
          const err: any = new Error('District Officer cannot review a batch from another district.');
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
        stage = ApprovalStage.DISTRICT;
      } else if (user.role === UserRole.QUALITY_TEAM) {
        if (status !== BatchStatus.PENDING_QUALITY) {
          const err: any = new Error(`Batch is in '${status}' state; Quality Team cannot act on it.`);
          err.statusCode = 403;
          err.code = 'STAGE_MISMATCH';
          throw err;
        }
        stage = ApprovalStage.QUALITY;
      } else if (user.role === UserRole.STATE_OFFICE) {
        if (status !== BatchStatus.PENDING_STATE) {
          const err: any = new Error(`Batch is in '${status}' state; State Office cannot act on it.`);
          err.statusCode = 403;
          err.code = 'STAGE_MISMATCH';
          throw err;
        }
        stage = ApprovalStage.STATE;
      } else {
        const err: any = new Error('Role not authorized to record decisions.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      // 3. Check for Duplicate Officer Decision (Guaranteed by DB unique constraint too)
      const existingVote = await tx.batchApproval.findFirst({
        where: {
          batchId: batch.id,
          submissionVersion: batch.submissionVersion,
          stage,
          actorId: user.id,
          status: ApprovalRecordStatus.ACTIVE
        }
      });

      if (existingVote) {
        const err: any = new Error('You have already cast a decision on this batch version.');
        err.statusCode = 409;
        err.code = 'DUPLICATE_DECISION';
        throw err;
      }

      // 4. Insert Officer Decision
      await tx.batchApproval.create({
        data: {
          batchId: batch.id,
          submissionVersion: batch.submissionVersion,
          stage,
          actorId: user.id,
          decision,
          reason: reason || null,
          status: ApprovalRecordStatus.ACTIVE
        }
      });

      // 5. Handle Decisions
      let newStatus: BatchStatus = status as BatchStatus;
      let certificatesQueued = 0;

      if (decision === ApprovalDecision.REJECT) {
        newStatus = BatchStatus.REJECTED;
      } else if (decision === ApprovalDecision.SEND_BACK) {
        newStatus = BatchStatus.CHANGES_REQUESTED;
      } else if (decision === ApprovalDecision.APPROVE) {
        if (stage === ApprovalStage.DISTRICT) {
          // Count active approvals for this version
          const activeApprovals = await tx.batchApproval.count({
            where: {
              batchId: batch.id,
              submissionVersion: batch.submissionVersion,
              stage: ApprovalStage.DISTRICT,
              decision: ApprovalDecision.APPROVE,
              status: ApprovalRecordStatus.ACTIVE
            }
          });

          // District Quorum Rule: exactly 2 distinct officers
          if (activeApprovals >= 2) {
            newStatus = batch.candidateCount > 50 ? BatchStatus.PENDING_QUALITY : BatchStatus.PENDING_STATE;
          }
        } else if (stage === ApprovalStage.QUALITY) {
          // Quality Team: 1 approval advances to PENDING_STATE
          newStatus = BatchStatus.PENDING_STATE;
        } else if (stage === ApprovalStage.STATE) {
          // State Office: Final approval triggers issuance! (Moment #3)
          newStatus = BatchStatus.APPROVED_ISSUING;

          // Fetch district code for certificate number generation
          const district = await tx.district.findUnique({ where: { id: batch.districtId } });
          const distCode = district?.code || 'HYD';

          const candidates = await tx.batchCandidate.findMany({
            where: { batchId: batch.id }
          });

          for (const cand of candidates) {
            // Sequence-based unique certificate number
            const seqResult: any[] = await tx.$queryRawUnsafe(`SELECT nextval('cert_serial_seq') as seq`);
            const seq = seqResult[0]?.seq || Math.floor(100000 + Math.random() * 900000);
            const certNumber = `PSM-2026-${distCode}-${seq}`;

            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            const cert = await tx.certificate.create({
              data: {
                certificateNumber: certNumber,
                batchId: batch.id,
                candidateId: cand.id,
                downloadTokenHash: tokenHash,
                status: 'PENDING_GENERATION'
              }
            });

            // Enqueue Transactional Outbox Event for BullMQ
            await outboxService.enqueueEvent(
              tx,
              'CERTIFICATE',
              cert.id,
              'CERTIFICATE_ISSUE_REQUESTED',
              {
                certificateId: cert.id,
                certificateNumber: cert.certificateNumber,
                batchId: batch.id,
                candidateId: cand.id,
                candidateName: cand.fullName,
                phoneNumber: cand.phoneNumber,
                courseName: batch.courseName,
                assessmentScore: Number(cand.assessmentScore),
                completionDate: cand.completionDate.toISOString().split('T')[0],
                districtCode: distCode,
                rawToken
              },
              correlationId
            );

            certificatesQueued++;
          }
        }
      }

      // Update Batch State
      const updatedBatch = await tx.batch.update({
        where: { id: batch.id },
        data: {
          status: newStatus,
          stateEnteredAt: newStatus !== status ? new Date() : undefined,
          escalatedAt: null, // Reset SLA escalation upon any officer action
          lastFeedback: (decision === ApprovalDecision.REJECT || decision === ApprovalDecision.SEND_BACK) ? reason : undefined,
          version: { increment: 1 }
        }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: batch.id,
          actorId: user.id,
          actorRole: user.role,
          action: `BATCH_${decision}`,
          metadata: {
            stage,
            decision,
            reason,
            previousStatus: status,
            newStatus,
            certificatesQueued
          },
          correlationId
        }
      });

      // Emit SSE Event
      await sseService.emitEvent('BATCH_UPDATED', {
        batchId: updatedBatch.id,
        batchCode: updatedBatch.batchCode,
        status: updatedBatch.status,
        submissionVersion: updatedBatch.submissionVersion,
        timestamp: updatedBatch.stateEnteredAt.toISOString()
      });

      return {
        batchId: batch.id,
        previousStatus: status,
        newStatus,
        submissionVersion: batch.submissionVersion,
        stageApprovalsCount: 1,
        stageApprovalsRequired: stage === ApprovalStage.DISTRICT ? 2 : 1,
        certificatesQueued
      };
    });
  }
}

export const batchService = new BatchService();
