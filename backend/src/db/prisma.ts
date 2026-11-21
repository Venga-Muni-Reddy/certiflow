import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.DEBUG_SQL === 'true' ? ['query', 'error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Apply custom PostgreSQL invariants (monotonic sequence, triggers, partial indexes)
 * Executes individual DDL statements directly to comply with PostgreSQL prepared statement rules
 */
export async function applyDatabaseInvariants(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS cert_serial_seq START WITH 100001 INCREMENT BY 1;`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox_events (created_at ASC) WHERE published_at IS NULL;`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_batches_sla_pending ON batches (state_entered_at ASC) WHERE escalated_at IS NULL AND status IN ('PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE');`);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE operations are strictly forbidden'; END; $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_role_scope') THEN ALTER TABLE users ADD CONSTRAINT chk_user_role_scope CHECK ((role = 'TRAINING_CENTRE' AND training_centre_id IS NOT NULL) OR (role = 'DISTRICT_OFFICER' AND district_id IS NOT NULL) OR (role IN ('QUALITY_TEAM', 'STATE_OFFICE'))); END IF; END $$;`);
    console.log('[CertiFlow DB] Custom PostgreSQL invariants applied successfully.');
  } catch (err) {
    console.error('[CertiFlow DB] Error applying custom invariants:', err);
    throw err;
  }
}

export default prisma;
