# Product Requirements Document (PRD): CertiFlow

## 1. Executive Summary & Product Vision
**CertiFlow** is an event-driven, auditable skilling certificate issuance and public verification platform built for the **Pragati Skills Mission**. It replaces manual spreadsheet emails, informal WhatsApp approvals, and manual Word document generation with a tamper-proof workflow that moves passed candidate batches from training centre submission to WhatsApp certificate delivery in minutes while providing instant, login-free public verification.

---

## 2. Opinionated Product & Domain Decisions (Resolving Brief Ambiguities)
Where the problem statement left business rules open, CertiFlow enforces the following deliberate decisions:

| Ambiguity | Deliberate Decision | Rationale |
| :--- | :--- | :--- |
| **District Quorum Rule** | **2 distinct District Officers** must approve a batch to advance it. A single **Reject** or **Send Back** immediately transitions the batch out of District Review. | Matches the 3 district officer demo personas (`Dev`, `Meera`, `Kabir`) and prevents deadlocks when one officer spots an error. |
| **Large Batch Threshold** | Batches with **`> 50` candidates** require mandatory **Quality Team** (`Neha`) sign-off after District quorum and before State Office final approval. | Ensures standard ~60-candidate batches (Moment #3) exercise the full multi-stage pipeline. |
| **Resubmission Policy (Moment #6)** | Sending a batch back **invalidates and archives all prior approvals** for that batch version, resetting approvals to zero upon resubmission. | Because the training centre can edit candidate rows before resending, prior officer sign-offs on unedited data are no longer valid. |
| **Stale Batch SLA (Moment #5)** | Any batch sitting in an active review state for **`> 24 hours`** (configurable down to **`30 seconds`** in demo/test mode) triggers an automatic escalation alert to the State Office (`Farah`). | Allows reviewers to test SLA escalation live in seconds while modeling real-world 24h operational SLAs. |
| **Public Verification Privacy** | Public lookup accepts a **Certificate Number** (or QR scan) without login and returns only: Status (`VALID` / `REVOKED`), Masked Candidate Name (`R*** K****`), Course Name, Issuing Centre, and Issue Date—**never** phone numbers, full PII, or the downloadable PDF. | Satisfies employer verification needs while preventing strangers from scraping personal details or downloading someone else's certificate. |
| **Candidate Delivery & Download** | WhatsApp delivery sends a direct link containing a **cryptographically signed, non-guessable download token** (plus optional media payload) backed by object storage. | Ensures only the recipient with the WhatsApp link can download the PDF, even if someone guesses a sequential certificate number. |

---

## 3. User Personas & RBAC Permissions

| Persona (Demo User) | Role | Scope & Permitted Actions |
| :--- | :--- | :--- |
| **Anika** | `TRAINING_CENTRE` | Scoped to her own centre. Create batches, upload CSV/XLSX candidate sheets, view batch status/rejection reasons, edit & resubmit `CHANGES_REQUESTED` batches. |
| **Dev, Meera, Kabir** | `DISTRICT_OFFICER` | Scoped to their assigned district. View pending district batches, cast `APPROVE`, `REJECT`, or `SEND_BACK` (with mandatory reason). Cannot approve the same batch twice. |
| **Neha** | `QUALITY_TEAM` | Scoped to batches with `> 50` candidates in `PENDING_QUALITY`. Cast `APPROVE`, `REJECT`, or `SEND_BACK` with reason. |
| **Farah** | `STATE_OFFICE` | Global visibility across all districts. Give final `APPROVE` (`PENDING_STATE`), view SLA-breached/stuck batches, and `REVOKE` issued certificates with reason. |
| **Candidates** | Unauthenticated (Token) | Receive WhatsApp message with unique download link; download genuine PDF certificate. |
| **Employers / Public** | Unauthenticated | Query public verification endpoint/UI by Certificate Number or QR URL to check authenticity (`VALID` vs `REVOKED`). |

*Note for Demo Setup:* A quick-switch role/user switcher bar in the UI issues valid short-lived JWTs/sessions for `Anika`, `Dev`, `Meera`, `Kabir`, `Neha`, and `Farah` while still enforcing full backend RBAC middleware on every API call.

---

## 4. Batch & Certificate State Machines

### 4.1 Batch Lifecycle State Machine
* `DRAFT` $\rightarrow$ Created, awaiting valid spreadsheet upload (atomic validation; invalid upload leaves batch clean with zero partial rows).
* `PENDING_DISTRICT` $\rightarrow$ Submitted by Training Centre; awaiting **2 distinct District Officer approvals**.
* `PENDING_QUALITY` $\rightarrow$ Automatically entered if `candidate_count > 50` after District quorum; awaiting **1 Quality Team approval**.
* `PENDING_STATE` $\rightarrow$ Entered directly from `PENDING_DISTRICT` (if $\le 50$ candidates) or `PENDING_QUALITY` (if $> 50$ candidates); awaiting **1 State Office final approval**.
* `CHANGES_REQUESTED` $\rightarrow$ Sent back by District, Quality, or State officer with mandatory reason. Centre can edit rows and resubmit $\rightarrow$ increments `submission_version`, clears active approvals, and returns to `PENDING_DISTRICT`.
* `REJECTED` $\rightarrow$ Terminal rejection by District, Quality, or State officer with mandatory reason.
* `APPROVED_ISSUING` $\rightarrow$ State Office granted final approval; issuance jobs enqueued.
* `ISSUED` $\rightarrow$ All candidate certificates generated and delivery jobs dispatched.

### 4.2 Certificate Lifecycle State Machine
* `PENDING_GENERATION` $\rightarrow$ Record created idempotently upon batch approval with unique `certificate_number` (e.g., `PSM-2026-DIST01-000482`).
* `GENERATED` $\rightarrow$ PDF rendered with embedded QR verification code and stored; WhatsApp dispatch queued.
* `DELIVERED` $\rightarrow$ Stand-in WhatsApp provider confirmed delivery.
* `DELIVERY_FAILED` $\rightarrow$ Exhausted retries (or parked in Dead Letter Queue for replay).
* `REVOKED` $\rightarrow$ Cancelled by State Office with reason and timestamp; immediately reflected in public verification and Redis cache.

---

## 5. Functional Requirements & The 6 Critical Moments

### FR-1: Atomic Spreadsheet Ingestion (Moment #1)
* **Input:** `.csv` or `.xlsx` containing `full_name`, `phone_number` (E.164/10-digit Indian mobile), `course_name`, `assessment_score`, `completion_date`, and `candidate_gov_id` (or unique roll ID).
* **Validation & Atomicity:** The entire file is parsed and validated before any database write. Validation checks missing fields, invalid phone numbers, duplicate roll IDs within the sheet, and invalid scores.
* **Outcome:** If any row fails, the API returns HTTP `422` with a structured array of `{ rowNumber, field, error }` and writes **zero rows** inside a single PostgreSQL transaction.

### FR-2: Concurrency-Safe Multi-Officer Approval (Moment #2)
* **Concurrency Control:** Approval endpoints wrap state transitions in a PostgreSQL transaction using row-level locking (`SELECT ... FOR UPDATE`) and an optimistic `version` counter on the `batches` table, backed by a unique constraint `UNIQUE (batch_id, submission_version, actor_id)` on `batch_approvals`.
* **Outcome:** If `Dev` and `Meera` approve simultaneously, both approvals are recorded cleanly; if two officers race on the threshold approval, the transaction serializes them so the batch transitions to `PENDING_QUALITY` (or `PENDING_STATE`) **exactly once**.

### FR-3: Idempotent Certificate Generation & Resilient WhatsApp Delivery (Moment #3)
* **Event-Driven Pipeline:** When State Office approves a batch of 60 candidates, the API commits `APPROVED_ISSUING` + an **Outbox event** in one DB transaction and returns immediately (`< 200ms`).
* **Worker Pipeline (BullMQ on Redis):**
  1. `certificate.generate` worker generates PDF + QR code idempotently (keyed by `batch_id + candidate_id` and DB unique constraint on `certificate_number`).
  2. `whatsapp.send` worker calls the flaky stand-in WhatsApp provider using an `idempotency_key` (`cert_id`), configured with exponential backoff + jitter (e.g., 5 retries) to survive timeouts and 500s.
* **Outcome:** Every candidate receives **at most and at least one** certificate even across worker restarts or provider failures.

### FR-4: Instant Certificate Revocation & Public Verification (Moment #4)
* **Revocation:** State Office (`Farah`) revokes a certificate via `POST /api/certificates/:id/revoke` with a mandatory reason.
* **Cache Invalidation:** The transaction updates PostgreSQL (`status = 'REVOKED'`, `revoked_at`, `revoked_by`, `revocation_reason`), appends an audit log entry, and immediately updates/invalidates the Redis verification cache (`cert:verify:{certificate_number}`).
* **Outcome:** Public verification checks (`GET /api/public/verify/:certificateNumber`) immediately report `REVOKED` with revocation date/reason—never `VALID`.

### FR-5: Automated SLA Escalation for Stale Batches (Moment #5)
* **Background Scheduler:** A recurring BullMQ repeatable job scans batches in `PENDING_DISTRICT`, `PENDING_QUALITY`, and `PENDING_STATE` whose `state_entered_at` exceeds the SLA threshold (`24h` prod / `30s` demo) and `escalated_at IS NULL`.
* **Action:** Marks `escalated_at = NOW()`, writes an `SLA_BREACHED` audit event, and broadcasts a real-time alert to State Office (`Farah`) via Server-Sent Events (SSE).

### FR-6: Send-Back & Resubmission Policy (Moment #6)
* **Send Back:** Any reviewing officer can send a batch back with a mandatory comment, setting status to `CHANGES_REQUESTED`.
* **Resubmission:** Training Centre (`Anika`) uploads a corrected spreadsheet or edits candidate fields and clicks **Resubmit**.
* **Explicit Rule:** System increments `batch.submission_version` (e.g., `v1` $\rightarrow$ `v2`), marks prior `v1` approvals as `SUPERSEDED` (preserved in audit history), and resets `v2` approval count to `0` in `PENDING_DISTRICT`.

### FR-7: Real-Time UI Updates Without Page Refresh
* **Transport:** Server-Sent Events (`GET /api/events/stream`) backed by **Redis Pub/Sub** so multiple backend API containers stay synchronized.
* **Events Pushed:** `BATCH_SUBMITTED`, `BATCH_APPROVED`, `BATCH_SENT_BACK`, `BATCH_ESCALATED`, `CERTIFICATE_ISSUED`, `CERTIFICATE_REVOKED`. All connected dashboards update live.

---

## 6. Non-Functional Requirements & Security Invariants

1. **Strict RBAC & Horizontal Isolation:**
   * Training centres can only read/write their own batches.
   * District officers can only view/act on batches belonging to their assigned district.
   * Officers cannot act on batches outside their stage (e.g., a District Officer calling the State approval endpoint receives `403 Forbidden`).
2. **Immutable Audit Trail:**
   * Every state change, upload, approval, send-back, escalation, delivery attempt, and revocation writes an append-only row to `audit_logs` (`id`, `entity_type`, `entity_id`, `actor_id`, `actor_role`, `action`, `metadata_json`, `correlation_id`, `created_at`).
3. **Observability:**
   * Structured JSON logging (Pino) with `correlation_id` propagated from HTTP request $\rightarrow$ Outbox $\rightarrow$ BullMQ job $\rightarrow$ WhatsApp stand-in call.
   * Health & metrics endpoints (`/health`, `/metrics`) tracking queue depth, worker failures, and processing latency.
4. **Local Containerized Execution:**
   * Single command `docker compose up --build` starts PostgreSQL, Redis, API server, Background Worker(s), and React/Vite frontend with automatic migrations and seeded demo data (`Anika`, `Dev`, `Meera`, `Kabir`, `Neha`, `Farah`).

---

## 7. High-Level Technical Architecture

```text
[React + Vite UI] <──── SSE (Live Updates) ────┐
       │                                       │
   REST API (JWT + RBAC)                       │
       ▼                                       │
[Node.js + Express + TS API] ──► [Redis Pub/Sub]
       │             │
  Prisma/Drizzle     └──► [Redis Cache (Public Verify)]
       ▼
[PostgreSQL + Outbox Table]
       │
       ▼ (Outbox Relay)
[BullMQ Queues on Redis]
  ├──► [PDF & QR Generator Worker] ──► [Local Volume / S3 Storage]
  ├──► [WhatsApp Delivery Worker]  ──► [Flaky Stand-In WhatsApp Provider]
  └──► [SLA Monitor Cron Worker]   ──► [Escalation Events]
```

---

## 8. Acceptance & Automated Test Matrix
The automated test suite (Vitest / Supertest) will explicitly verify:
1. **Atomic Validation:** Uploading a 10-row CSV with 2 malformed rows returns `422` with row-level errors and leaves `0` candidates in DB.
2. **Concurrent Approval Race:** Firing two concurrent `POST /approve` requests from `Dev` and `Meera` advances the batch once without duplicate state transitions or duplicate certificates.
3. **Large vs. Standard Batch Routing:** A 45-candidate batch skips Quality Team (`PENDING_DISTRICT` $\rightarrow$ `PENDING_STATE`); a 60-candidate batch routes `PENDING_DISTRICT` $\rightarrow$ `PENDING_QUALITY` $\rightarrow$ `PENDING_STATE`.
4. **Flaky WhatsApp Idempotency:** Approving a 60-candidate batch against a stand-in provider configured with a 50% failure/timeout rate results in **60 unique certificates** and **60 successful deliveries** with zero duplicates.
5. **Instant Revocation:** Revoking an issued certificate immediately flips `GET /api/public/verify/:certNo` from `VALID` to `REVOKED`.
6. **SLA Escalation:** Aging a pending batch past the SLA threshold triggers escalation and emits an alert to `Farah`.
7. **Resubmission Reset:** Sending a batch back after 1 district approval and resubmitting resets `v2` approvals to `0` while keeping `v1` history intact.
8. **RBAC & Privacy Guards:** Unauthorized role actions return `403`, public verification hides phone numbers/PDF URLs, and invalid download tokens return `401/403`.

---

## 9. Deliverables Checklist (Submission Package)
1. **Public GitHub Repository:** Full TypeScript monorepo (`frontend`, `backend`, `worker`, `shared`), `Dockerfile`s, `docker-compose.yml`, and automated integration tests.
2. **`README.md`:** Executive requirements decisions note at the top, architecture overview, trade-offs, AI usage & verification log, and known limitations.
3. **`SETUP.md` (or section in `README.md`):** Zero-to-running local guide with demo credentials and test execution commands.
4. **`DEPLOYMENT.md`:** Production scaling architecture for 100k users / 10k DAU / 30k peak hourly certificates, failure playbooks (worker crash, Redis restart, WhatsApp outage, slow DB), S3 + signed URL storage, observability, and monthly cost breakdown.
5. **Demo Video ($\le 2$ mins):** End-to-end walkthrough demonstrating role switching (`Anika` $\rightarrow$ `Dev`/`Meera` $\rightarrow$ `Neha` $\rightarrow$ `Farah`), live SSE updates, flaky WhatsApp recovery, revocation, and public verification.