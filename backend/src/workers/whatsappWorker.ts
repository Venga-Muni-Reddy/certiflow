import { prisma } from '../db/prisma.js';
import { config } from '../config/env.js';
import { sseService } from '../services/sse.service.js';

export interface WhatsAppJobData {
  certificateId: string;
  certificateNumber: string;
  batchId: string;
  candidateName: string;
  courseName: string;
  phoneNumber: string;
  rawToken: string;
  correlationId: string;
}

/**
 * Deliver WhatsApp certificate notification to candidate with exponential backoff & jitter (Moment #3)
 */
export async function whatsappDeliverJob(data: WhatsAppJobData): Promise<void> {
  const { certificateId, certificateNumber, batchId, candidateName, courseName, phoneNumber, rawToken, correlationId } = data;

  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId }
  });

  if (!cert || cert.status === 'DELIVERED') {
    return; // Already delivered idempotently
  }

  const downloadUrl = `${config.publicAppUrl}/api/v1/public/certificates/download?token=${rawToken}`;

  const payload = {
    to: phoneNumber,
    candidateName,
    certificateNumber,
    courseName,
    downloadUrl
  };

  const maxRetries = 5;
  let attempt = 0;
  let delivered = false;

  while (attempt < maxRetries && !delivered) {
    attempt++;
    try {
      const response = await fetch(`${config.whatsappServiceUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': certificateId,
          'X-Correlation-ID': correlationId
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        delivered = true;
        break;
      } else {
        const errorText = await response.text();
        console.warn(`[WhatsApp Worker] Attempt ${attempt}/${maxRetries} failed for cert ${certificateNumber}: ${errorText}`);
      }
    } catch (err: any) {
      console.warn(`[WhatsApp Worker] Network exception attempt ${attempt}/${maxRetries} for cert ${certificateNumber}:`, err.message);
    }

    if (!delivered && attempt < maxRetries) {
      // Exponential backoff with random jitter (e.g. 500ms, 1000ms, 2000ms + jitter)
      const delay = Math.pow(2, attempt) * 400 + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Update certificate delivery status
  await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      status: delivered ? 'DELIVERED' : 'DELIVERY_FAILED',
      deliveryAttempts: attempt,
      lastDeliveryError: delivered ? null : 'Exhausted retry attempts to flaky stand-in WhatsApp provider'
    }
  });

  if (delivered) {
    // Check if entire batch has finished issuing
    const undeliveredCount = await prisma.certificate.count({
      where: {
        batchId,
        status: { notIn: ['DELIVERED', 'REVOKED'] }
      }
    });

    if (undeliveredCount === 0) {
      await prisma.batch.update({
        where: { id: batchId },
        data: {
          status: 'ISSUED',
          version: { increment: 1 }
        }
      });

      await sseService.emitEvent('BATCH_UPDATED', {
        batchId,
        status: 'ISSUED',
        timestamp: new Date().toISOString()
      });
    }

    await sseService.emitEvent('CERTIFICATE_DELIVERED', {
      batchId,
      certificateNumber,
      candidateName,
      delivered: true
    });
  }
}
