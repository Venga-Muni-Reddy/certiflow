import { prisma } from '../db/prisma.js';
import { pdfService } from '../services/pdf.service.js';
import { storageService } from '../services/storage.service.js';
import { whatsappDeliverJob } from './whatsappWorker.js';

export interface PdfJobData {
  certificateId: string;
  certificateNumber: string;
  batchId: string;
  candidateName: string;
  courseName: string;
  assessmentScore: number;
  completionDate: string;
  districtCode: string;
  phoneNumber: string;
  rawToken: string;
  correlationId: string;
}

/**
 * PDF Generation Worker Processor (Pure Node pdfkit + QR)
 */
export async function processPdfJob(data: PdfJobData): Promise<void> {
  const { certificateId, certificateNumber, batchId, candidateName, courseName, assessmentScore, completionDate, phoneNumber, rawToken, correlationId } = data;

  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      batch: {
        include: { district: true, trainingCentre: true }
      }
    }
  });

  if (!cert) return;

  // Idempotent skip if already rendered
  if (cert.status === 'GENERATED' || cert.status === 'DELIVERED') {
    return;
  }

  // Render branded PDF with QR verification code
  const pdfBuffer = await pdfService.generateCertificatePdf({
    certificateNumber,
    candidateName,
    courseName,
    trainingCentreName: cert.batch.trainingCentre.name,
    districtName: cert.batch.district.name,
    assessmentScore,
    completionDate
  });

  // Save to storage (MinIO / S3 / local fallback)
  const s3ObjectKey = await storageService.saveCertificate(batchId, certificateNumber, pdfBuffer);

  // Update certificate record
  await prisma.certificate.update({
    where: { id: cert.id },
    data: {
      s3ObjectKey,
      status: 'GENERATED'
    }
  });

  // Enqueue WhatsApp delivery
  await whatsappDeliverJob({
    certificateId,
    certificateNumber,
    batchId,
    candidateName,
    courseName,
    phoneNumber,
    rawToken,
    correlationId
  });
}
