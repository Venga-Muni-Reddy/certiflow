import { prisma } from '../db/prisma.js';

export interface AuditLogParams {
  entityType: 'BATCH' | 'CERTIFICATE' | 'AUTH' | 'SYSTEM';
  entityId: string;
  actorId?: string | null;
  actorRole: string;
  action: string;
  metadata?: Record<string, any>;
  correlationId: string;
}

export class AuditService {
  /**
   * Appends an immutable audit record to audit_logs
   */
  public async log(params: AuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          entityType: params.entityType,
          entityId: params.entityId,
          actorId: params.actorId || null,
          actorRole: params.actorRole,
          action: params.action,
          metadata: params.metadata || {},
          correlationId: params.correlationId
        }
      });
    } catch (err) {
      console.error('[AuditService] Failed to write audit log:', err);
    }
  }
}

export const auditService = new AuditService();
