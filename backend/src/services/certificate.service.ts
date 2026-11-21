import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { redisService } from './redis.service.js';
import { auditService } from './audit.service.js';
import { sseService } from './sse.service.js';
import { storageService } from './storage.service.js';
import { AuthenticatedUser } from '../middleware/auth.js';
import { UserRole, PublicVerificationResponseDTO } from '@certiflow/shared';

export function maskCandidateName(fullName: string): string {
  if (!fullName) return '';
  return fullName
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 1) return word + '***';
      return word[0] + '****';
    })
    .join(' ');
}

export class CertificateService {
  /**
   * List all certificates in a batch
   */
  public async listBatchCertificates(batchId: string, user: AuthenticatedUser) {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) {
      const err: any = new Error('Batch not found.');
      err.statusCode = 404;
      err.code = 'BATCH_NOT_FOUND';
      throw err;
    }

    // Role checks
    if (user.role === UserRole.TRAINING_CENTRE && batch.trainingCentreId !== user.trainingCentreId) {
      const err: any = new Error('Forbidden.');
      err.statusCode = 403;
      throw err;
    }

    const certificates = await prisma.certificate.findMany({
      where: { batchId },
      include: {
        candidate: true
      },
      orderBy: { certificateNumber: 'asc' }
    });

    return certificates.map((c) => ({
      id: c.id,
      certificateNumber: c.certificateNumber,
      candidateName: c.candidate.fullName,
      status: c.status,
      deliveryAttempts: c.deliveryAttempts,
      issuedAt: c.issuedAt.toISOString(),
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
      revocationReason: c.revocationReason
    }));
  }

  /**
   * Instant Revocation (Moment #4)
   * Only State Office (Farah) can revoke certificates
   */
  public async revokeCertificate(
    certificateId: string,
    reason: string,
    user: AuthenticatedUser,
    correlationId: string
  ) {
    if (user.role !== UserRole.STATE_OFFICE) {
      const err: any = new Error('Forbidden. Only State Office has the authority to revoke certificates.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        batch: {
          include: { district: true, trainingCentre: true }
        },
        candidate: true
      }
    });

    if (!cert) {
      const err: any = new Error('Certificate not found.');
      err.statusCode = 404;
      err.code = 'CERTIFICATE_NOT_FOUND';
      throw err;
    }

    if (cert.status === 'REVOKED') {
      const err: any = new Error('Certificate has already been revoked.');
      err.statusCode = 409;
      err.code = 'ALREADY_REVOKED';
      throw err;
    }

    const now = new Date();

    // 1. Update Database
    const updated = await prisma.certificate.update({
      where: { id: cert.id },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokedBy: user.id,
        revocationReason: reason
      }
    });

    // 2. Invalidate / Update Redis Verification Cache Immediately (Moment #4)
    const publicPayload: PublicVerificationResponseDTO = {
      found: true,
      certificateNumber: cert.certificateNumber,
      status: 'REVOKED',
      candidateMaskedName: maskCandidateName(cert.candidate.fullName),
      courseName: cert.batch.courseName,
      trainingCentreName: cert.batch.trainingCentre.name,
      districtName: cert.batch.district.name,
      issuedAt: cert.issuedAt.toISOString(),
      revokedAt: now.toISOString(),
      revocationReason: reason
    };

    await redisService.setVerificationCache(cert.certificateNumber, JSON.stringify(publicPayload), 3600);

    // 3. Immutable audit log
    await auditService.log({
      entityType: 'CERTIFICATE',
      entityId: cert.id,
      actorId: user.id,
      actorRole: user.role,
      action: 'CERTIFICATE_REVOKED',
      metadata: {
        certificateNumber: cert.certificateNumber,
        reason,
        candidateGovId: cert.candidate.candidateGovId
      },
      correlationId
    });

    // 4. Real-time broadcast
    await sseService.emitEvent('CERTIFICATE_REVOKED', {
      certificateNumber: cert.certificateNumber,
      revokedAt: now.toISOString(),
      reason
    });

    return {
      id: updated.id,
      certificateNumber: updated.certificateNumber,
      status: updated.status,
      revokedAt: now.toISOString(),
      revokedBy: user.name,
      revocationReason: reason
    };
  }

  /**
   * Public Certificate Verification (Zero-Login, Privacy-Safe - Moment #4)
   */
  public async verifyPublicCertificate(certificateNumber: string): Promise<PublicVerificationResponseDTO> {
    const cleanCertNo = certificateNumber.trim().toUpperCase();

    // 1. Check Redis Cache first (<5ms lookup)
    const cached = await redisService.getVerificationCache(cleanCertNo);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fall back to DB
      }
    }

    // 2. Query PostgreSQL
    let cert: any = null;
    try {
      cert = await prisma.certificate.findUnique({
        where: { certificateNumber: cleanCertNo },
        include: {
          batch: {
            include: { district: true, trainingCentre: true }
          },
          candidate: true
        }
      });
    } catch {
      // Fall through to 404
    }

    if (!cert) {
      const err: any = new Error('No certificate matches the provided certificate number.');
      err.statusCode = 404;
      err.code = 'CERTIFICATE_NOT_FOUND';
      throw err;
    }

    // Zero-Trust Privacy Projection: Exclude phone, govId, score, and s3 keys!
    const projection: PublicVerificationResponseDTO = {
      found: true,
      certificateNumber: cert.certificateNumber,
      status: cert.status === 'REVOKED' ? 'REVOKED' : 'VALID',
      candidateMaskedName: maskCandidateName(cert.candidate.fullName),
      courseName: cert.batch.courseName,
      trainingCentreName: cert.batch.trainingCentre.name,
      districtName: cert.batch.district.name,
      issuedAt: cert.issuedAt.toISOString(),
      revokedAt: cert.revokedAt ? cert.revokedAt.toISOString() : null,
      revocationReason: cert.revocationReason
    };

    // Populate Redis Cache
    await redisService.setVerificationCache(cleanCertNo, JSON.stringify(projection), 3600);

    return projection;
  }

  /**
   * Secure Candidate PDF Download via Cryptographic Secret Token
   */
  public async getCandidateDownload(rawToken: string): Promise<{ buffer: Buffer; fileName: string }> {
    if (!rawToken) {
      const err: any = new Error('Missing download token.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    const cert = await prisma.certificate.findUnique({
      where: { downloadTokenHash: tokenHash },
      include: {
        batch: {
          include: { district: true, trainingCentre: true }
        },
        candidate: true
      }
    });

    if (!cert) {
      const err: any = new Error('Invalid or expired download token.');
      err.statusCode = 401;
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    if (cert.status === 'REVOKED') {
      const err: any = new Error('This certificate was officially revoked by the State Competency Authority.');
      err.statusCode = 403;
      err.code = 'CERTIFICATE_REVOKED';
      throw err;
    }

    // Try reading generated PDF file
    let buffer: Buffer | null = null;
    if (cert.s3ObjectKey) {
      buffer = await storageService.getCertificateBuffer(cert.s3ObjectKey);
    }

    // If PDF not rendered yet, render on the fly dynamically
    if (!buffer) {
      const { pdfService } = await import('./pdf.service.js');
      buffer = await pdfService.generateCertificatePdf({
        certificateNumber: cert.certificateNumber,
        candidateName: cert.candidate.fullName,
        courseName: cert.batch.courseName,
        trainingCentreName: cert.batch.trainingCentre.name,
        districtName: cert.batch.district.name,
        assessmentScore: Number(cert.candidate.assessmentScore),
        completionDate: cert.candidate.completionDate.toISOString().split('T')[0]!
      });
    }

    return {
      buffer,
      fileName: `${cert.certificateNumber}.pdf`
    };
  }
}

export const certificateService = new CertificateService();
