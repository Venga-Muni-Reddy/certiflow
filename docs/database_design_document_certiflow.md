# Database Design Document (DDD): CertiFlow

## 1. Overview & Database Strategy

* **RDBMS Engine:** PostgreSQL 16
* **ORM & Migration Tool:** Prisma ORM (`prisma migrate`) paired with targeted raw SQL migrations for PostgreSQL-specific guarantees (sequences, partial indexes, append-only audit protections, and `SELECT ... FOR UPDATE` row-level locks).
* **Primary Design Goals:**
  1. **Zero Duplicate Certificates or Numbers:** Enforced via a monotonic PostgreSQL `SEQUENCE` (`cert_serial_seq`) and `UNIQUE` constraints on `certificates.candidate_id` and `certificates.certificate_number`.
  2. **Race-Free Concurrent Approvals:** Enforced via row-level pessimistic locking (`SELECT ... FOR UPDATE` on `batches`) plus a composite unique constraint on `(batch_id, submission_version, stage, actor_id)` in `batch_approvals`.
  3. **Atomic Batch Ingestion & Outbox Reliability:** All candidate rows and outbox events commit inside single ACID transactions (`prisma.$transaction`).
  4. **Immutable Auditability:** Append-only `audit_logs` table recording every state transition, actor, role, and `correlation_id`.

---

## 2. Entity-Relationship Diagram (ERD)

```
┌──────────────────┐       ┌─────────────────────────┐       ┌─────────────────────────┐
│    districts     │1     *│    training_centres     │1     *│         batches         │
├──────────────────┤───────┤─────────────────────────┤───────┤─────────────────────────┤
│ id (PK)          │       │ id (PK)                 │       │ id (PK)                 │
│ name             │       │ name                    │       │ batch_code (UNIQUE)     │
│ code (UNIQUE)    │       │ code (UNIQUE)           │       │ training_centre_id (FK) │
└────────┬─────────┘       │ district_id (FK)        │       │ district_id (FK)        │
         │                 └────────────┬────────────┘       │ course_name             │
         │1                             │1                   │ status (ENUM)           │
         │                              │                    │ candidate_count         │
         │*                             │*                   │ submission_version      │
┌────────┴──────────────────────────────┴────────────┐       │ version (Optimistic)    │
│                       users                        │       │ state_entered_at        │
├────────────────────────────────────────────────────┤       │ escalated_at            │
│ id (PK)                                            │       └──────┬──────────┬───────┘
│ name                                               │              │1         │1
│ email (UNIQUE)                                     │              │          │
│ role (ENUM)                                        │              │*         │*
│ district_id (FK NULLABLE)                          │   ┌──────────┴──┐   ┌───┴─────────────────┐
│ training_centre_id (FK NULLABLE)                   │   │batch_       │   │batch_candidates     │
└─────────────────────────┬──────────────────────────┘   │approvals    │   ├─────────────────────┤
                          │1                             ├─────────────┤   │id (PK)              │
                          │                              │id (PK)      │   │batch_id (FK)        │
                          └─────────────────────────────*│batch_id (FK)│   │row_number           │
                                                         │actor_id (FK)│   │full_name            │
                                                         │stage (ENUM) │   │phone_number         │
                                                         │decision     │   │candidate_gov_id     │
                                                         │status       │   │assessment_score     │
                                                         └─────────────┘   └──────────┬──────────┘
                                                                                      │1
┌──────────────────────────┐       ┌──────────────────────────────────┐               │
│      outbox_events       │       │           audit_logs             │               │1
├──────────────────────────┤       ├──────────────────────────────────┤   ┌───────────┴─────────┐
│ id (PK)                  │       │ id (PK)                          │   │    certificates     │
│ aggregate_type           │       │ entity_type                      │   ├─────────────────────┤
│ aggregate_id             │       │ entity_id                        │   │ id (PK)             │
│ event_type               │       │ actor_id (NULLABLE)              │   │ certificate_number  │
│ payload (JSONB)          │       │ actor_role                       │   │ batch_id (FK)       │
│ correlation_id           │       │ action                           │   │ candidate_id (UQ FK)│
│ published_at (NULLABLE)  │       │ metadata (JSONB)                 │   │ download_token_hash │
└──────────────────────────┘       │ correlation_id                   │   │ status (ENUM)       │
                                   └──────────────────────────────────┘   │ revoked_at          │
                                                                          └─────────────────────┘
```

---

## 3. Data Dictionary & Table Specifications

### 3.1 `districts`
Administrative regions used to scope District Officers (`Dev`, `Meera`, `Kabir`) and Training Centres.

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `name` | `VARCHAR(120)` | NO | — | e.g., `"Hyderabad Metro"` |
| `code` | `VARCHAR(16)` | NO | — | `UNIQUE`, used in certificate numbers (e.g., `"HYD"`) |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Record creation timestamp |

### 3.2 `training_centres`
Accredited training partners submitting candidate batches (`Anika`).

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `name` | `VARCHAR(200)` | NO | — | e.g., `"Nirmaan Skill Academy"` |
| `code` | `VARCHAR(24)` | NO | — | `UNIQUE`, e.g., `"TC-HYD-01"` |
| `district_id` | `UUID` | NO | — | `FK -> districts.id` (`ON DELETE RESTRICT`) |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Record creation timestamp |

### 3.3 `users`
Platform operators across all four authenticated roles.

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `name` | `VARCHAR(120)` | NO | — | Display name (e.g., `"Anika Sharma"`) |
| `email` | `VARCHAR(180)` | NO | — | `UNIQUE` |
| `role` | `UserRole` | NO | — | Enum: `TRAINING_CENTRE`, `DISTRICT_OFFICER`, `QUALITY_TEAM`, `STATE_OFFICE` |
| `district_id` | `UUID` | YES | `NULL` | Required when `role = DISTRICT_OFFICER` (`FK -> districts.id`) |
| `training_centre_id` | `UUID` | YES | `NULL` | Required when `role = TRAINING_CENTRE` (`FK -> training_centres.id`) |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Record creation timestamp |

### 3.4 `batches`
Represents a cohort of passed candidates submitted by a training centre.

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `batch_code` | `VARCHAR(40)` | NO | — | `UNIQUE`, e.g., `"BCH-2026-001"` |
| `training_centre_id` | `UUID` | NO | — | `FK -> training_centres.id` |
| `district_id` | `UUID` | NO | — | Denormalized `FK -> districts.id` for fast district-scoped queries |
| `course_name` | `VARCHAR(160)` | NO | — | e.g., `"Solar PV Technician"` |
| `status` | `BatchStatus` | NO | `'DRAFT'` | Enum: `DRAFT`, `PENDING_DISTRICT`, `PENDING_QUALITY`, `PENDING_STATE`, `CHANGES_REQUESTED`, `REJECTED`, `APPROVED_ISSUING`, `ISSUED` |
| `candidate_count` | `INT` | NO | `0` | Updated atomically upon candidate spreadsheet upload |
| `submission_version` | `INT` | NO | `1` | Incremented every time a sent-back batch is resubmitted |
| `version` | `INT` | NO | `1` | Optimistic concurrency version counter |
| `state_entered_at` | `TIMESTAMPTZ` | NO | `now()` | Reset on every stage transition; used for SLA breach calculation |
| `escalated_at` | `TIMESTAMPTZ` | YES | `NULL` | Populated when SLA cron flags a stale batch |
| `last_feedback` | `TEXT` | YES | `NULL` | Reason provided on `SEND_BACK` or `REJECT` |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `now()` | Auto-updated timestamp |

### 3.5 `batch_candidates`
Individual candidates belonging to a batch. Replaced atomically if a `DRAFT` or `CHANGES_REQUESTED` batch re-uploads a spreadsheet.

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `batch_id` | `UUID` | NO | — | `FK -> batches.id` (`ON DELETE CASCADE`) |
| `row_number` | `INT` | NO | — | 1-based row index from uploaded CSV/XLSX |
| `full_name` | `VARCHAR(160)` | NO | — | Candidate's legal full name |
| `phone_number` | `VARCHAR(20)` | NO | — | Normalized E.164 format (e.g., `+919876543210`) |
| `candidate_gov_id` | `VARCHAR(64)` | NO | — | Unique roll/ID within batch (`UNIQUE(batch_id, candidate_gov_id)`) |
| `assessment_score` | `NUMERIC(5,2)` | NO | — | Score between `0.00` and `100.00` |
| `completion_date` | `DATE` | NO | — | Course completion date |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Creation timestamp |

### 3.6 `batch_approvals`
Records every officer decision across stages and submission versions.

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `batch_id` | `UUID` | NO | — | `FK -> batches.id` |
| `submission_version` | `INT` | NO | — | Matches `batches.submission_version` at time of decision |
| `stage` | `ApprovalStage` | NO | — | Enum: `DISTRICT`, `QUALITY`, `STATE` |
| `actor_id` | `UUID` | NO | — | `FK -> users.id` |
| `decision` | `ApprovalDecision` | NO | — | Enum: `APPROVE`, `REJECT`, `SEND_BACK` |
| `reason` | `TEXT` | YES | `NULL` | Mandatory when `decision IN ('REJECT', 'SEND_BACK')` |
| `status` | `ApprovalRecordStatus` | NO | `'ACTIVE'` | Enum: `ACTIVE`, `SUPERSEDED` (marked `SUPERSEDED` upon batch resubmission) |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Decision timestamp |
| **Composite Unique** | — | — | — | `UNIQUE (batch_id, submission_version, stage, actor_id)` |

### 3.7 `certificates`
Issued certificates (1-to-1 with `batch_candidates` once State Office approves a batch).

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `certificate_number` | `VARCHAR(48)` | NO | — | `UNIQUE`, format `PSM-YYYY-<DIST>-<6_DIGIT_SEQ>` |
| `batch_id` | `UUID` | NO | — | `FK -> batches.id` |
| `candidate_id` | `UUID` | NO | — | `UNIQUE FK -> batch_candidates.id` (prevents duplicate issuance) |
| `download_token_hash` | `VARCHAR(64)` | NO | — | `UNIQUE` SHA-256 hex digest of secret candidate download token |
| `s3_object_key` | `VARCHAR(255)` | YES | `NULL` | Object storage path once PDF is generated |
| `status` | `CertificateStatus` | NO | `'PENDING_GENERATION'` | Enum: `PENDING_GENERATION`, `GENERATED`, `DELIVERED`, `DELIVERY_FAILED`, `REVOKED` |
| `delivery_attempts` | `INT` | NO | `0` | Counter of WhatsApp delivery attempts |
| `last_delivery_error` | `TEXT` | YES | `NULL` | Latest error message from stand-in WhatsApp provider |
| `issued_at` | `TIMESTAMPTZ` | NO | `now()` | Timestamp of State Office approval |
| `revoked_at` | `TIMESTAMPTZ` | YES | `NULL` | Timestamp if revoked by State Office |
| `revoked_by` | `UUID` | YES | `NULL` | `FK -> users.id` of State Officer who revoked it |
| `revocation_reason` | `TEXT` | YES | `NULL` | Public/audit reason for revocation |

### 3.8 `outbox_events`
Transactional Outbox guaranteeing reliable event handoff from PostgreSQL to BullMQ/Redis.

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `aggregate_type` | `VARCHAR(64)` | NO | — | e.g., `"BATCH"`, `"CERTIFICATE"` |
| `aggregate_id` | `UUID` | NO | — | ID of the target entity |
| `event_type` | `VARCHAR(80)` | NO | — | e.g., `"CERTIFICATE_ISSUE_REQUESTED"` |
| `payload` | `JSONB` | NO | — | Serialized event payload |
| `correlation_id` | `VARCHAR(64)` | NO | — | Request trace ID propagated to workers |
| `published_at` | `TIMESTAMPTZ` | YES | `NULL` | `NULL` until relayed to BullMQ |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Event creation timestamp |

### 3.9 `audit_logs`
Append-only compliance ledger tracing every action end-to-end.

| Column | Type | Nullable | Default | Constraints & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary Key |
| `entity_type` | `VARCHAR(64)` | NO | — | `"BATCH"`, `"CERTIFICATE"`, `"AUTH"` |
| `entity_id` | `UUID` | NO | — | Target entity UUID |
| `actor_id` | `UUID` | YES | `NULL` | `NULL` for system cron workers (e.g., SLA monitor) |
| `actor_role` | `VARCHAR(40)` | NO | — | User role or `"SYSTEM_WORKER"` |
| `action` | `VARCHAR(80)` | NO | — | e.g., `"BATCH_APPROVED"`, `"CERTIFICATE_REVOKED"` |
| `metadata` | `JSONB` | NO | `'{}'` | Before/after state, feedback, IP, or error details |
| `correlation_id` | `VARCHAR(64)` | NO | — | End-to-end trace identifier |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Immutable event timestamp |

---

## 4. Complete Prisma Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  TRAINING_CENTRE
  DISTRICT_OFFICER
  QUALITY_TEAM
  STATE_OFFICE
}

enum BatchStatus {
  DRAFT
  PENDING_DISTRICT
  PENDING_QUALITY
  PENDING_STATE
  CHANGES_REQUESTED
  REJECTED
  APPROVED_ISSUING
  ISSUED
}

enum ApprovalStage {
  DISTRICT
  QUALITY
  STATE
}

enum ApprovalDecision {
  APPROVE
  REJECT
  SEND_BACK
}

enum ApprovalRecordStatus {
  ACTIVE
  SUPERSEDED
}

enum CertificateStatus {
  PENDING_GENERATION
  GENERATED
  DELIVERED
  DELIVERY_FAILED
  REVOKED
}

model District {
  id              String           @id @default(uuid()) @db.Uuid
  name            String           @db.VarChar(120)
  code            String           @unique @db.VarChar(16)
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz
  trainingCentres TrainingCentre[]
  users           User[]
  batches         Batch[]

  @@map("districts")
}

model TrainingCentre {
  id         String   @id @default(uuid()) @db.Uuid
  name       String   @db.VarChar(200)
  code       String   @unique @db.VarChar(24)
  districtId String   @map("district_id") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  district District @relation(fields: [districtId], references: [id], onDelete: Restrict)
  users    User[]
  batches  Batch[]

  @@index([districtId])
  @@map("training_centres")
}

model User {
  id               String   @id @default(uuid()) @db.Uuid
  name             String   @db.VarChar(120)
  email            String   @unique @db.VarChar(180)
  role             UserRole
  districtId       String?  @map("district_id") @db.Uuid
  trainingCentreId String?  @map("training_centre_id") @db.Uuid
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz

  district            District?       @relation(fields: [districtId], references: [id], onDelete: Restrict)
  trainingCentre      TrainingCentre? @relation(fields: [trainingCentreId], references: [id], onDelete: Restrict)
  approvals           BatchApproval[]
  revokedCertificates Certificate[]   @relation("RevokedByUser")

  @@index([role, districtId])
  @@map("users")
}

model Batch {
  id                String      @id @default(uuid()) @db.Uuid
  batchCode         String      @unique @map("batch_code") @db.VarChar(40)
  trainingCentreId  String      @map("training_centre_id") @db.Uuid
  districtId        String      @map("district_id") @db.Uuid
  courseName        String      @map("course_name") @db.VarChar(160)
  status            BatchStatus @default(DRAFT)
  candidateCount    Int         @default(0) @map("candidate_count")
  submissionVersion Int         @default(1) @map("submission_version")
  version           Int         @default(1)
  stateEnteredAt    DateTime    @default(now()) @map("state_entered_at") @db.Timestamptz
  escalatedAt       DateTime?   @map("escalated_at") @db.Timestamptz
  lastFeedback      String?     @map("last_feedback") @db.Text
  createdAt         DateTime    @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime    @updatedAt @map("updated_at") @db.Timestamptz

  trainingCentre TrainingCentre   @relation(fields: [trainingCentreId], references: [id], onDelete: Restrict)
  district       District         @relation(fields: [districtId], references: [id], onDelete: Restrict)
  candidates     BatchCandidate[]
  approvals      BatchApproval[]
  certificates   Certificate[]

  @@index([status, districtId])
  @@index([status, stateEnteredAt])
  @@index([trainingCentreId])
  @@map("batches")
}

model BatchCandidate {
  id             String   @id @default(uuid()) @db.Uuid
  batchId        String   @map("batch_id") @db.Uuid
  rowNumber      Int      @map("row_number")
  fullName       String   @map("full_name") @db.VarChar(160)
  phoneNumber    String   @map("phone_number") @db.VarChar(20)
  candidateGovId String   @map("candidate_gov_id") @db.VarChar(64)
  assessmentScore Decimal @map("assessment_score") @db.Decimal(5, 2)
  completionDate DateTime @map("completion_date") @db.Date
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz

  batch       Batch        @relation(fields: [batchId], references: [id], onDelete: Cascade)
  certificate Certificate?

  @@unique([batchId, candidateGovId])
  @@index([batchId])
  @@map("batch_candidates")
}

model BatchApproval {
  id                String               @id @default(uuid()) @db.Uuid
  batchId           String               @map("batch_id") @db.Uuid
  submissionVersion Int                  @map("submission_version")
  stage             ApprovalStage
  actorId           String               @map("actor_id") @db.Uuid
  decision          ApprovalDecision
  reason            String?              @db.Text
  status            ApprovalRecordStatus @default(ACTIVE)
  createdAt         DateTime             @default(now()) @map("created_at") @db.Timestamptz

  batch Batch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  actor User  @relation(fields: [actorId], references: [id], onDelete: Restrict)

  @@unique([batchId, submissionVersion, stage, actorId])
  @@index([batchId, submissionVersion, status])
  @@map("batch_approvals")
}

model Certificate {
  id                String            @id @default(uuid()) @db.Uuid
  certificateNumber String            @unique @map("certificate_number") @db.VarChar(48)
  batchId           String            @map("batch_id") @db.Uuid
  candidateId       String            @unique @map("candidate_id") @db.Uuid
  downloadTokenHash String            @unique @map("download_token_hash") @db.VarChar(64)
  s3ObjectKey       String?           @map("s3_object_key") @db.VarChar(255)
  status            CertificateStatus @default(PENDING_GENERATION)
  deliveryAttempts  Int               @default(0) @map("delivery_attempts")
  lastDeliveryError String?           @map("last_delivery_error") @db.Text
  issuedAt          DateTime          @default(now()) @map("issued_at") @db.Timestamptz
  revokedAt         DateTime?         @map("revoked_at") @db.Timestamptz
  revokedBy         String?           @map("revoked_by") @db.Uuid
  revocationReason  String?           @map("revocation_reason") @db.Text

  batch         Batch          @relation(fields: [batchId], references: [id], onDelete: Restrict)
  candidate     BatchCandidate @relation(fields: [candidateId], references: [id], onDelete: Restrict)
  revokedByUser User?          @relation("RevokedByUser", fields: [revokedBy], references: [id], onDelete: Restrict)

  @@index([batchId])
  @@index([status])
  @@map("certificates")
}

model OutboxEvent {
  id            String    @id @default(uuid()) @db.Uuid
  aggregateType String    @map("aggregate_type") @db.VarChar(64)
  aggregateId   String    @map("aggregate_id") @db.Uuid
  eventType     String    @map("event_type") @db.VarChar(80)
  payload       Json      @db.JsonB
  correlationId String    @map("correlation_id") @db.VarChar(64)
  publishedAt   DateTime? @map("published_at") @db.Timestamptz
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz

  @@index([createdAt])
  @@map("outbox_events")
}

model AuditLog {
  id            String   @id @default(uuid()) @db.Uuid
  entityType    String   @map("entity_type") @db.VarChar(64)
  entityId      String   @map("entity_id") @db.Uuid
  actorId       String?  @map("actor_id") @db.Uuid
  actorRole     String   @map("actor_role") @db.VarChar(40)
  action        String   @db.VarChar(80)
  metadata      Json     @default("{}") @db.JsonB
  correlationId String   @map("correlation_id") @db.VarChar(64)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([entityType, entityId, createdAt])
  @@index([correlationId])
  @@map("audit_logs")
}
```

---

## 5. Custom SQL Migration Invariants (`0002_custom_invariants.sql`)

In addition to Prisma's generated DDL, a custom migration enforces database-level invariants that Prisma syntax alone cannot express:

```sql
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
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE operations are forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_mutation();

-- 5. Check constraints ensuring role-to-scope integrity
ALTER TABLE users
  ADD CONSTRAINT chk_user_role_scope CHECK (
    (role = 'TRAINING_CENTRE' AND training_centre_id IS NOT NULL) OR
    (role = 'DISTRICT_OFFICER' AND district_id IS NOT NULL) OR
    (role IN ('QUALITY_TEAM', 'STATE_OFFICE'))
  );
```

---

## 6. Critical SQL Query Patterns & Concurrency Control

### 6.1 Pessimistic Locking on Officer Approval (Moment #2)
```sql
BEGIN;

-- Acquire row-level exclusive lock on the batch; concurrent officers wait here
SELECT id, status, candidate_count, submission_version, version
FROM batches
WHERE id = $1
FOR UPDATE;

-- Insert decision (fails cleanly with 23505 if same officer clicks twice)
INSERT INTO batch_approvals (id, batch_id, submission_version, stage, actor_id, decision, reason)
VALUES (gen_random_uuid(), $1, $2, 'DISTRICT', $3, 'APPROVE', NULL);

-- Count active approvals for current submission_version
SELECT COUNT(*)::int AS active_approvals
FROM batch_approvals
WHERE batch_id = $1
  AND submission_version = $2
  AND stage = 'DISTRICT'
  AND decision = 'APPROVE'
  AND status = 'ACTIVE';

-- If active_approvals >= 2, advance state and bump optimistic version
UPDATE batches
SET status = CASE WHEN candidate_count > 50 THEN 'PENDING_QUALITY'::"BatchStatus" ELSE 'PENDING_STATE'::"BatchStatus" END,
    state_entered_at = NOW(),
    version = version + 1,
    updated_at = NOW()
WHERE id = $1;

COMMIT;
```

### 6.2 Batch Certificate Pre-Allocation on State Office Approval (Moment #3)
```sql
INSERT INTO certificates (id, certificate_number, batch_id, candidate_id, download_token_hash, status)
SELECT
  gen_random_uuid(),
  'PSM-' || EXTRACT(YEAR FROM NOW())::text || '-' || d.code || '-' || LPAD(nextval('cert_serial_seq')::text, 6, '0'),
  bc.batch_id,
  bc.id,
  encode(sha256(gen_random_bytes(32)), 'hex'),
  'PENDING_GENERATION'::"CertificateStatus"
FROM batch_candidates bc
JOIN batches b ON b.id = bc.batch_id
JOIN districts d ON d.id = b.district_id
WHERE bc.batch_id = $1
ON CONFLICT (candidate_id) DO NOTHING
RETURNING id, certificate_number, candidate_id;
```

### 6.3 Non-Blocking Outbox Relay Polling
```sql
WITH claimed AS (
  SELECT id
  FROM outbox_events
  WHERE published_at IS NULL
  ORDER BY created_at ASC
  LIMIT 100
  FOR UPDATE SKIP LOCKED
)
UPDATE outbox_events oe
SET published_at = NOW()
FROM claimed
WHERE oe.id = claimed.id
RETURNING oe.*;
```

---

## 7. Demo Seed Data Specification (`prisma/seed.ts`)

Running `npx prisma db seed` populates deterministic UUIDs so reviewers can immediately switch between personas and test all 6 critical moments:

* **Districts:** `Hyderabad Metro (HYD)` and `Warangal Urban (WGL)`.
* **Training Centres:** `Nirmaan Skill Academy (TC-HYD-01)` in `HYD`.
* **Demo Users:**
  * **Anika** (`TRAINING_CENTRE`, `TC-HYD-01`)
  * **Dev** (`DISTRICT_OFFICER`, `HYD`)
  * **Meera** (`DISTRICT_OFFICER`, `HYD`)
  * **Kabir** (`DISTRICT_OFFICER`, `HYD`)
  * **Neha** (`QUALITY_TEAM`, global)
  * **Farah** (`STATE_OFFICE`, global)
* **Pre-Seeded Sample Batches:**
  1. `BCH-2026-DEMO-01`: `DRAFT` (ready for Anika to upload a spreadsheet).
  2. `BCH-2026-DEMO-02`: `PENDING_DISTRICT` with **60 candidates** and **1 existing approval from Dev** (so Meera's approval immediately triggers Quality Team routing for >50 candidates).
  3. `BCH-2026-DEMO-03`: `ISSUED` batch with 5 sample certificates (`PSM-2026-HYD-100001` through `100005`) ready for immediate public verification and revocation testing.