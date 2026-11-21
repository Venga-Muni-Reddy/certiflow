import { prisma } from '../db/prisma.js';
import { config } from '../config/env.js';
import { sseService } from '../services/sse.service.js';
import { auditService } from '../services/audit.service.js';

/**
 * SLA Escalation Monitor (Moment #5)
 * Scans pending batches exceeding SLA threshold (30s in demo / 24h in prod)
 */
export async function runSlaMonitorScan(): Promise<void> {
  const thresholdMs = config.slaThresholdSeconds * 1000;
  const cutoffTime = new Date(Date.now() - thresholdMs);

  try {
    // Atomic update of un-escalated stale batches
    const staleBatches = await prisma.batch.findMany({
      where: {
        status: { in: ['PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE'] },
        escalatedAt: null,
        stateEnteredAt: { lt: cutoffTime }
      },
      include: {
        district: true,
        trainingCentre: true
      }
    });

    for (const b of staleBatches) {
      const now = new Date();
      await prisma.batch.update({
        where: { id: b.id },
        data: { escalatedAt: now }
      });

      await auditService.log({
        entityType: 'BATCH',
        entityId: b.id,
        actorId: null,
        actorRole: 'SYSTEM_SLA_WORKER',
        action: 'SLA_BREACHED',
        metadata: {
          batchCode: b.batchCode,
          status: b.status,
          stateEnteredAt: b.stateEnteredAt,
          slaThresholdSeconds: config.slaThresholdSeconds
        },
        correlationId: `sla-cron-${b.id}`
      });

      console.log(`[SLA Worker] Escalated stale batch ${b.batchCode} (entered state at ${b.stateEnteredAt.toISOString()}). Broadcasted to State Office.`);

      await sseService.emitEvent('BATCH_ESCALATED', {
        batchId: b.id,
        batchCode: b.batchCode,
        status: b.status,
        districtCode: b.district.code,
        escalatedAt: now.toISOString()
      });
    }
  } catch (err) {
    console.error('[SLA Worker] Error during SLA scan:', err);
  }
}

/**
 * Start periodic SLA monitor
 */
export function startSlaCron(): NodeJS.Timeout {
  console.log(`[SLA Worker] Starting SLA monitor (Interval: ${config.slaCheckIntervalSeconds}s, Threshold: ${config.slaThresholdSeconds}s).`);
  return setInterval(runSlaMonitorScan, config.slaCheckIntervalSeconds * 1000);
}
