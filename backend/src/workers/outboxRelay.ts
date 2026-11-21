import { prisma } from '../db/prisma.js';
import { processPdfJob, PdfJobData } from './pdfWorker.js';

let isRelayRunning = false;

/**
 * Polls unpublished outbox events and dispatches to workers
 */
export async function pollAndRelayOutbox(): Promise<void> {
  if (isRelayRunning) return;
  isRelayRunning = true;

  try {
    // Claim a batch of up to 50 unpublished events
    const events = await prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 50
    });

    for (const evt of events) {
      if (evt.eventType === 'CERTIFICATE_ISSUE_REQUESTED') {
        const payload = evt.payload as unknown as PdfJobData;
        try {
          // Process PDF generation & WhatsApp delivery
          await processPdfJob(payload);

          // Mark published
          await prisma.outboxEvent.update({
            where: { id: evt.id },
            data: { publishedAt: new Date() }
          });
        } catch (err: any) {
          console.error(`[Outbox Relay] Failed to process event ${evt.id}:`, err.message);
        }
      }
    }
  } catch (err: any) {
    // Silently continue if database is starting up
  } finally {
    isRelayRunning = false;
  }
}

/**
 * Start periodic outbox relay poller
 */
export function startOutboxRelay(intervalMs = 1500): NodeJS.Timeout {
  console.log('[Outbox Relay] Transactional outbox relay worker active.');
  return setInterval(pollAndRelayOutbox, intervalMs);
}
