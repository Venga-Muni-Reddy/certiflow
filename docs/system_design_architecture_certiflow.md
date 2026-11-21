# System Design Architecture (SDA) Document: CertiFlow

## 1. Architectural Overview & Core Principles

**CertiFlow** is designed as a modular, event-driven distributed system built around four architectural pillars:

1. **Strict Transactional Consistency at Decision Boundaries:** Batch state transitions, officer approvals, and certificate revocations execute inside ACID PostgreSQL transactions using pessimistic row-level locking (`SELECT ... FOR UPDATE`) and database-level unique constraints.
2. **Reliable Asynchronous Execution (Transactional Outbox + BullMQ):** Slow or unreliable I/O—PDF generation, QR rendering, and flaky WhatsApp delivery—never blocks HTTP request threads. Domain events are persisted atomically alongside business state changes in an `outbox_events` table and relayed into Redis-backed BullMQ queues.
3. **End-to-End Idempotency:** Every worker job and external provider request carries a deterministic idempotency key so worker crashes, container restarts, or network retries never issue duplicate certificates or duplicate WhatsApp messages.
4. **Horizontal Statelessness & Real-Time Fanout:** API and Worker containers hold zero local state. Live UI updates propagate via **Redis Pub/Sub $\rightarrow$ Server-Sent Events (SSE)**, while certificate files reside in S3-compatible object storage (**MinIO** locally, **AWS S3** in production).

---

## 2. High-Level System Architecture

```text
                         ┌─────────────────────────────────────────┐
                         │         React + Vite SPA (UI)           │
                         │  (Role Switcher, Live Dashboards, Verify)│
                         └──────────────┬──────────────▲───────────┘
                                        │ REST / JWT   │ SSE Stream
                                        ▼              │
┌─────────────────────────────────────────────────────────────────────────┐
│                     Node.js + Express + TypeScript API                  │
│  [Auth/RBAC Guard] [Spreadsheet Validator] [State Machine] [SSE Broker] │
└──────┬───────────────────────┬──────────────────────────▲───────────────┘
       │ Prisma + Raw SQL      │ Read/Write Cache         │ Pub/Sub
       │ (FOR UPDATE)          ▼                          │
       │               ┌──────────────────────────────────┴───────────────┐
       │               │                 Redis 7 Cluster                  │
       │               │  • Public Verify Cache (cert:verify:<certNo>)    │
       │               │  • Pub/Sub Channel (certiflow:events)            │
       │               │  • BullMQ Queues (pdf-gen, whatsapp, sla, dlq)   │
       │               └───────┬──────────────────────────────────▲───────┘
       ▼                       │ Consume Jobs                     │ Enqueue
┌──────────────────────┐       ▼                                  │
│    PostgreSQL 16     │  ┌───────────────────────────────────────┴───────┐
│  • users / districts │  │         Background Worker Service (TS)        │
│  • batches / items   │  │  • Outbox Relay Poller (100ms interval)       │
│  • batch_approvals   │  │  • PDF + QR Generator Worker (pdfkit)         │
│  • certificates      │  │  • WhatsApp Delivery Worker (Retry + Jitter)  │
│  • outbox_events     │  │  • SLA Escalation Cron Worker                 │
│  • audit_logs        │  └───────────┬───────────────────────┬───────────┘
└──────────────────────┘              │ PutObject /           │ POST /send
                                      │ Signed URL            │ (Idempotency-Key)
                                      ▼                       ▼
                         ┌─────────────────────┐  ┌───────────────────────┐
                         │ MinIO (Local) / S3  │  │ Stand-In WhatsApp API │
                         │ (Private Bucket)    │  │ (Chaos/Timeout Sim +  │
                         └─────────────────────┘  │  Candidate Inbox UI)  │
                                                  └───────────────────────┘
```

---

## 3. Tech Stack Justification (No Box-Ticking)

| Component | Technology | Why It Exists in CertiFlow |
| :--- | :--- | :--- |
| **Frontend** | React + Vite + TypeScript | Fast SPA with native `EventSource` SSE hook for live dashboard updates without polling and instant persona switching. |
| **Backend API** | Node.js + Express + TypeScript | Unified TypeScript types shared across API, workers, and frontend; lightweight middleware pipeline for RBAC and Zod validation. |
| **Database & ORM** | PostgreSQL 16 + Prisma | ACID transactions, composite unique constraints for idempotency, and `$queryRaw` `FOR UPDATE` locks for race-free concurrent approvals. |
| **Cache & Pub/Sub** | Redis 7 | Sub-millisecond public certificate verification lookups (`<5ms`), instant revocation cache invalidation, and cross-instance SSE Pub/Sub fanout. |
| **Queue & Workers** | BullMQ (on Redis) | Built-in exponential backoff with jitter, concurrency limits, delayed/repeatable cron jobs (SLA monitor), and Dead Letter Queue (DLQ) inspection. |
| **PDF Generation** | `pdfkit` + `qrcode` | Pure Node.js stream rendering (~15ms per PDF, ~40MB RAM footprint), avoiding headless Chromium overhead when scaling to 30,000 PDFs/hour. |
| **Object Storage** | MinIO (Local) / AWS S3 | Keeps container filesystems stateless; supports pre-signed time-limited download URLs so private certificates are never publicly guessable. |

---

## 4. Database Schema Design (PostgreSQL + Prisma)

### 4.1 Core Tables & Constraints

1. **`districts`**: `id (UUID PK)`, `name`, `code (UNIQUE)`
2. **`training_centres`**: `id (UUID PK)`, `name`, `code (UNIQUE)`, `district_id (FK -> districts)`
3. **`users`**:
   * `id (UUID PK)`, `name`, `email (UNIQUE)`, `role (ENUM: TRAINING_CENTRE, DISTRICT_OFFICER, QUALITY_TEAM, STATE_OFFICE)`
   * `district_id (UUID NULLABLE FK)`, `training_centre_id (UUID NULLABLE FK)`
4. **`batches`**:
   * `id (UUID PK)`, `batch_code (UNIQUE)`, `training_centre_id (FK)`, `district_id (FK)`
   * `course_name`, `status (ENUM: DRAFT, PENDING_DISTRICT, PENDING_QUALITY, PENDING_STATE, CHANGES_REQUESTED, REJECTED, APPROVED_ISSUING, ISSUED)`
   * `candidate_count (INT)`, `submission_version (INT DEFAULT 1)`, `version (INT DEFAULT 1)` (optimistic lock guard)
   * `state_entered_at (TIMESTAMPTZ)`, `escalated_at (TIMESTAMPTZ NULLABLE)`, `last_feedback (TEXT NULLABLE)`
   * `created_at`, `updated_at`
5. **`batch_candidates`**:
   * `id (UUID PK)`, `batch_id (FK ON DELETE CASCADE)`, `row_number (INT)`
   * `full_name`, `phone_number`, `candidate_gov_id`, `assessment_score (NUMERIC)`, `completion_date (DATE)`
   * **Constraint:** `UNIQUE (batch_id, candidate_gov_id)` — prevents duplicate candidates in a batch.
6. **`batch_approvals`**:
   * `id (UUID PK)`, `batch_id (FK)`, `submission_version (INT)`, `stage (ENUM: DISTRICT, QUALITY, STATE)`
   * `actor_id (FK -> users)`, `decision (ENUM: APPROVE, REJECT, SEND_BACK)`, `reason (TEXT NULLABLE)`
   * `status (ENUM: ACTIVE, SUPERSEDED DEFAULT ACTIVE)`, `created_at (TIMESTAMPTZ)`
   * **Constraint:** `UNIQUE (batch_id, submission_version, stage, actor_id)` — guarantees an officer cannot approve the same batch version twice even under concurrent requests.
7. **`certificates`**:
   * `id (UUID PK)`, `certificate_number (VARCHAR UNIQUE)` (e.g., `PSM-2026-HYD-000142`)
   * `batch_id (FK)`, `candidate_id (UUID UNIQUE FK -> batch_candidates)` — enforces **1 certificate per candidate** at DB level.
   * `download_token_hash (VARCHAR UNIQUE)` — SHA-256 hash of cryptographic download token.
   * `s3_object_key (VARCHAR NULLABLE)`
   * `status (ENUM: PENDING_GENERATION, GENERATED, DELIVERED, DELIVERY_FAILED, REVOKED)`
   * `delivery_attempts (INT DEFAULT 0)`, `last_delivery_error (TEXT NULLABLE)`
   * `issued_at (TIMESTAMPTZ)`, `revoked_at (TIMESTAMPTZ NULLABLE)`, `revoked_by (UUID NULLABLE)`, `revocation_reason (TEXT NULLABLE)`
8. **`outbox_events`**:
   * `id (UUID PK)`, `aggregate_type`, `aggregate_id`, `event_type`, `payload (JSONB)`, `correlation_id`
   * `published_at (TIMESTAMPTZ NULLABLE)`, `created_at (TIMESTAMPTZ)`
   * **Index:** `INDEX idx_outbox_unpublished ON outbox_events (created_at) WHERE published_at IS NULL`
9. **`audit_logs`** (Append-Only):
   * `id (UUID PK)`, `entity_type`, `entity_id`, `actor_id`, `actor_role`, `action`, `metadata (JSONB)`, `correlation_id`, `created_at (TIMESTAMPTZ)`

---

## 5. Deep-Dive Architectural Flows (The 6 Critical Moments)

### Flow 1: Atomic Spreadsheet Ingestion (Moment #1)

1. Training centre (`Anika`) uploads `.csv`/`.xlsx` via `POST /api/batches/:id/candidates/upload`.
2. Stream parser loads rows into memory (capped at 500 rows/batch) and runs a 2-pass validator:
   * **Pass 1 (Row Schema):** Validates `full_name`, Indian mobile format (`+91XXXXXXXXXX`), `candidate_gov_id`, `assessment_score` (`0–100`), and ISO `completion_date`.
   * **Pass 2 (Cross-Row Uniqueness):** Detects duplicate `candidate_gov_id` or `phone_number` within the uploaded sheet.
3. If `errors.length > 0`, returns `422 Unprocessable Entity` with `{ valid: false, errors: [{ row, field, message }] }` before opening a DB write transaction.
4. If `errors.length === 0`, opens a single `prisma.$transaction`: deletes any prior draft rows for that batch, bulk-inserts all validated rows, updates `batch.candidate_count`, and writes an `audit_logs` record.

### Flow 2: Concurrency-Safe District Quorum (Moment #2)

1. When `Dev` and `Meera` click **Approve** simultaneously on `POST /api/batches/:id/decision`:
2. Transaction 1 executes `SELECT * FROM batches WHERE id = $1 FOR UPDATE`, locking the batch row. Transaction 2 blocks at the database lock until Transaction 1 commits.
3. Transaction 1 verifies `batch.status === 'PENDING_DISTRICT'`, inserts `Dev`'s approval (`ACTIVE` count = `1 < 2`), commits, and releases the lock.
4. Transaction 2 acquires the lock, reads the committed state (`ACTIVE` count = `1`), inserts `Meera`'s approval (`ACTIVE` count = `2 === 2`), transitions `batch.status` to `PENDING_QUALITY` (if `candidate_count > 50`) or `PENDING_STATE` (if `<= 50`), updates `state_entered_at = NOW()`, writes `audit_logs` + `outbox_events`, and commits.
5. If a third officer (`Kabir`) raced at the exact same millisecond, his transaction acquires the lock after Transaction 2 commits, sees `batch.status !== 'PENDING_DISTRICT'`, and cleanly returns `409 Conflict` ("Batch already moved to next stage").

### Flow 3: Outbox $\rightarrow$ PDF Generation $\rightarrow$ Resilient WhatsApp Delivery (Moment #3)

1. **Atomic Batch Approval:** When State Office (`Farah`) approves a 60-candidate batch:
   * Inside one DB transaction: updates `batch.status = 'APPROVED_ISSUING'`, pre-inserts 60 `certificates` rows (`status = 'PENDING_GENERATION'`, deterministic unique `certificate_number` generated via PostgreSQL `SEQUENCE`, unique `download_token_hash`), and writes 60 `CERTIFICATE_ISSUE_REQUESTED` rows into `outbox_events`.
2. **Outbox Relay:** Worker polls `outbox_events WHERE published_at IS NULL FOR UPDATE SKIP LOCKED` (batch of 100), pushes jobs to BullMQ queue `certificate-generate` using `jobId: cert:{certificate_id}`, and sets `published_at = NOW()`.
3. **PDF Generation Worker:**
   * Checks if `certificates.status` is already `GENERATED` or `DELIVERED` (idempotent skip).
   * Renders branded PDF with `pdfkit` embedding a QR code pointing to `https://<host>/verify/<certificate_number>`.
   * Uploads PDF to MinIO/S3 at `certificates/{batch_id}/{certificate_number}.pdf`.
   * Updates `status = 'GENERATED'` and enqueues `whatsapp-deliver` job (`jobId: wa:{certificate_id}`).
4. **WhatsApp Delivery Worker:**
   * Calls the **Stand-In WhatsApp Provider** with header `X-Idempotency-Key: {certificate_id}` and payload `{ to: phone, certificateNumber, downloadUrl }`.
   * The stand-in provider stores processed `X-Idempotency-Key` values in its own DB/Redis table—if a network timeout occurs after the provider accepted the message, the retry returns the cached `200 OK` receipt instead of sending a duplicate message.
   * BullMQ retries transient `5xx`/timeout failures up to **6 attempts** with exponential backoff (`2s, 4s, 8s, 16s, 32s, 64s` + random jitter).

### Flow 4: Instant Revocation & Zero-Trust Public Verification (Moment #4)

1. **Verification Lookup (`GET /api/public/verify/:certificateNumber`):**
   * Checks Redis key `cert:verify:{certificateNumber}` (TTL 1 hour).
   * On cache miss, queries PostgreSQL and populates Redis with **non-sensitive public projection only**:
     ```json
     {
       "certificateNumber": "PSM-2026-HYD-000142",
       "status": "VALID",
       "candidateMaskedName": "R**** K****",
       "courseName": "Solar PV Technician",
       "trainingCentre": "Nirmaan Skill Academy",
       "issuedAt": "2026-11-21T09:15:00Z",
       "revokedAt": null,
       "revocationReason": null
     }
     ```
   * Phone numbers, government IDs, and S3 download links are **excluded** at the query projection layer.
2. **Instant Revocation (`POST /api/certificates/:id/revoke`):**
   * Protected by `STATE_OFFICE` RBAC guard.
   * Inside DB transaction: sets `status = 'REVOKED'`, `revoked_at = NOW()`, `revocation_reason = req.body.reason`, appends `audit_logs` entry.
   * Immediately writes the updated `REVOKED` payload to Redis (`SET cert:verify:{certificateNumber} ...`) and publishes `CERTIFICATE_REVOKED` to Redis Pub/Sub. Within milliseconds, every public verification request reflects `REVOKED`.
3. **Secure Candidate Download (`GET /api/public/certificates/download?token=<raw_token>`):**
   * Hashes `raw_token` with SHA-256 and looks up `download_token_hash`.
   * Rejects if token is invalid (`401`) or certificate `status === 'REVOKED'` (`403 Certificate Revoked`).
   * Generates a **5-minute pre-signed MinIO/S3 GET URL** (or streams the PDF directly) so storage credentials never leak.

### Flow 5: Automated SLA Escalation (Moment #5)

* BullMQ repeatable job runs every **15 seconds** (demo) / **5 minutes** (prod).
* Executes atomic update:
  ```sql
  UPDATE batches
  SET escalated_at = NOW()
  WHERE status IN ('PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE')
    AND escalated_at IS NULL
    AND state_entered_at < NOW() - ($1::interval)
  RETURNING id, batch_code, status, district_id, state_entered_at;
  ```
* Inserts `SLA_BREACHED` records into `audit_logs` and publishes `BATCH_ESCALATED` over Redis Pub/Sub so `Farah`'s State Office dashboard highlights breached batches immediately.

### Flow 6: Send-Back & Resubmission Versioning (Moment #6)

* **Send Back:** Officer sets `status = 'CHANGES_REQUESTED'`, `last_feedback = reason`, `state_entered_at = NOW()`.
* **Resubmission (`POST /api/batches/:id/resubmit`):**
  * Inside DB transaction:
    1. Marks all `batch_approvals` where `batch_id = $1 AND status = 'ACTIVE'` as `status = 'SUPERSEDED'`.
    2. Increments `submission_version = submission_version + 1`.
    3. Resets `status = 'PENDING_DISTRICT'`, `escalated_at = NULL`, `state_entered_at = NOW()`.
    4. Appends `BATCH_RESUBMITTED` to `audit_logs` (preserving full history of `v1` approvals and feedback).

---

## 6. Security, RBAC & Observability Design

1. **Authentication & Demo Persona Switching:**
   * All protected routes require `Authorization: Bearer <JWT>` signed with `JWT_SECRET`.
   * Demo login endpoint `POST /api/auth/demo-switch` accepts `{ userId }` (enabled only when `DEMO_MODE=true`) and issues a real signed JWT for `Anika`, `Dev`, `Meera`, `Kabir`, `Neha`, or `Farah`. Every downstream authorization check validates the JWT claims and queries current user scope from DB—never trusting client headers.
2. **Row-Level Authorization Matrix:**
   * `TRAINING_CENTRE`: `batch.training_centre_id === user.training_centre_id`
   * `DISTRICT_OFFICER`: `batch.district_id === user.district_id && batch.status === 'PENDING_DISTRICT'`
   * `QUALITY_TEAM`: `batch.status === 'PENDING_QUALITY'`
   * `STATE_OFFICE`: `batch.status === 'PENDING_STATE'` (for approvals) or any issued certificate (for revocation)
3. **End-to-End Traceability:**
   * Express middleware attaches `X-Correlation-ID` (UUIDv4) to every request, binds it to a Pino child logger, stores it in `audit_logs.correlation_id` and `outbox_events.correlation_id`, and passes it into BullMQ job data so logs for any batch or certificate can be filtered by a single ID.

---

## 7. Local Container Topology (`docker-compose.yml`)

Running `docker compose up --build` starts 6 containers on an isolated bridge network:

1. **`postgres`**: PostgreSQL 16 with healthcheck (`pg_isready`) and persistent volume.
2. **`redis`**: Redis 7 with AOF persistence enabled (`--appendonly yes`).
3. **`minio`**: S3-compatible object storage + auto-init bucket creation (`certiflow-certs`).
4. **`whatsapp-mock`**: Dedicated Node/Express stand-in WhatsApp service with configurable `FAILURE_RATE` / `TIMEOUT_RATE`, idempotency ledger, and a built-in `/inbox` web view so reviewers can inspect delivered WhatsApp messages and click candidate download links.
5. **`backend`**: Runs `prisma migrate deploy && prisma db seed` on startup, serves REST API + SSE stream, and hosts BullMQ workers.
6. **`frontend`**: Vite + React app served via Nginx/Vite preview proxying `/api` to `backend`.

---

## 8. Production Scaling & Deployment Architecture (`DEPLOYMENT.md` Blueprint)

Designed for **100,000 registered users**, **10,000 DAU**, and **Results Day peak of 500 batches/hour (30,000 PDFs + 30,000 WhatsApp messages/hour = ~8.33 certs/sec sustained, ~25 certs/sec burst)**:

* **Compute (AWS ECS Fargate):**
  * **API Service:** 2–6 tasks behind an Application Load Balancer (ALB) with idle timeout `3600s` for long-lived SSE connections.
  * **Worker Service:** Auto-scaled from 2 to 12 tasks based on BullMQ queue depth (`ApproximateNumberOfMessages` / Redis list length). At 15ms/PDF + network I/O, 8 worker tasks with concurrency 10 process **~120 certificates/sec** (clearing 30,000 certificates in **< 5 minutes**).
* **Data Stores:**
  * **Amazon RDS PostgreSQL (`db.r6g.large`, Multi-AZ)** + PgBouncer connection pooling to handle peak worker concurrency without exhausting DB connections.
  * **Amazon ElastiCache Redis (`cache.r6g.large`, Multi-AZ)** with AOF enabled for BullMQ durability, Pub/Sub fanout, and public verification caching.
  * **Amazon S3 (Private Bucket + SSE-S3 encryption)** with 5-minute pre-signed URLs for candidate PDF downloads.
* **Failure Mode Playbooks:**
  * *Worker Crash:* BullMQ lock expiration (`lockDuration: 30s`) automatically reclaims stalled jobs; idempotent DB status + WhatsApp idempotency key prevent duplicates.
  * *Redis Restart:* BullMQ jobs awaiting enqueue remain safely in PostgreSQL `outbox_events` (`published_at IS NULL`) and replay automatically once Redis recovers; verification cache falls back cleanly to RDS.
  * *WhatsApp Outage:* Exponential backoff retries handle outages up to ~30 minutes; extended outages park jobs in `whatsapp-dlq` for one-click admin replay once Meta/BSP recovers.
  * *Slow Database:* Public verification traffic is 95%+ absorbed by Redis cache; worker concurrency throttles dynamically via BullMQ rate limiter to protect RDS CPU.
* **Estimated Monthly Production Cost (AWS ap-south-1 Mumbai):** **~$485 – $620 / month (~₹41,000 – ₹52,000)** (ECS Fargate ~$140, RDS Multi-AZ ~$195, ElastiCache ~$110, ALB + S3 + CloudWatch ~$65).