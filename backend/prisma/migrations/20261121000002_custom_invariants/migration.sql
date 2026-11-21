-- ==============================================================================
-- Migration: 20261121000002_custom_invariants
-- Monotonic sequences, outbox/SLA partial indexes, immutable audit trigger
-- ==============================================================================

-- 1. Monotonic sequence for collision-free certificate numbers
CREATE SEQUENCE IF NOT EXISTS cert_serial_seq START WITH 100001 INCREMENT BY 1;

-- 2. Partial index so Outbox Relay polling stays O(1) even with millions of historical rows
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
  ON outbox_events (created_at ASC)
  WHERE published_at IS NULL;

-- 3. Partial index for SLA Escalation worker scanning un-escalated pending batches
CREATE INDEX IF NOT EXISTS idx_batches_sla_pending
  ON batches (state_entered_at ASC)
  WHERE escalated_at IS NULL
    AND status IN ('PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE');

-- 4. Immutability trigger protecting audit_logs from UPDATE or DELETE
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE operations are strictly forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_mutation();

-- 5. Role-to-Scope Integrity Constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_role_scope'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_user_role_scope CHECK (
        (role = 'TRAINING_CENTRE' AND training_centre_id IS NOT NULL) OR
        (role = 'DISTRICT_OFFICER' AND district_id IS NOT NULL) OR
        (role IN ('QUALITY_TEAM', 'STATE_OFFICE'))
      );
  END IF;
END $$;
