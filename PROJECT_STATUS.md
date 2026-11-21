# CertiFlow Project Status & Implementation Tracker

## 1. Project Overview & Vision
**CertiFlow** is an auditable, event-driven skilling certificate issuance and public verification platform for the **Pragati Skills Mission**. It replaces spreadsheets, informal WhatsApp approvals, and manual Word document generation with an automated, concurrency-safe, tamper-proof system delivering certificates in minutes with zero-login instant public verification.

* **Target Submission Deadline:** 2:30 PM
* **Local Architecture:** PostgreSQL 16, Redis 7 (Cache, Pub/Sub, BullMQ), Node.js/Express TypeScript backend + BullMQ workers, Stand-in WhatsApp mock with chaos injection, React + Vite frontend.

---

## 2. Phase-by-Phase Roadmap & Status

| Phase | Description | Status | Review & Approval Gates |
| :--- | :--- | :---: | :--- |
| **Phase 1** | **Monorepo Scaffolding & Shared Types**<br>• Setup npm workspaces (`shared`, `backend`, `frontend`, `whatsapp-mock`)<br>• Shared TypeScript models, enums, DTOs, Zod validators<br>• Verified build across all 4 workspaces (`npm run build`)<br>• Project status tracking doc | **COMPLETED** | ✅ Verified & Approved |
| **Phase 2** | **Database & Persistence Layer**<br>• Prisma schema for all 8 entities (`prisma/schema.prisma`)<br>• Custom SQL invariants (`cert_serial_seq`, partial indexes, immutable audit trigger)<br>• Idempotent seed data (Anika, Dev, Meera, Kabir, Neha, Farah + 3 sample batches)<br>• Generated Prisma client & type-checked | **COMPLETED** | ✅ Verified & Approved |
| **Phase 3** | **Stand-In WhatsApp Mock Service**<br>• Flaky WhatsApp mock with `/api/messages`<br>• Idempotency ledger (`X-Idempotency-Key`)<br>• Dynamic Chaos simulation endpoint (`/api/chaos`)<br>• Web inbox UI (`/inbox`) for live message & download link inspection<br>• Verified with 7 passing automated tests | **COMPLETED** | ✅ Verified & Approved |
| **Phase 4** | **Backend API & BullMQ Workers**<br>• Express REST API with JWT auth and RBAC middleware<br>• Demo persona switcher (`/api/v1/auth/demo-switch`)<br>• Atomic 2-pass spreadsheet validator (0 rows on error)<br>• Concurrency-safe approval state machine (`SELECT ... FOR UPDATE`)<br>• Transactional Outbox relay poller (`SKIP LOCKED`)<br>• Pure Node PDF/QR generator & WhatsApp delivery with exponential backoff<br>• SLA monitor cron worker (30s demo / 24h prod)<br>• Instant revocation & zero-login masked public verification<br>• Live SSE stream (`/api/v1/events/stream`)<br>• 14 automated tests passed | **COMPLETED** | ✅ Verified & Approved |
| **Phase 5** | **Frontend Application (React + Vite)**<br>• Tailwind CSS design system & reactive state management<br>• Top-bar Persona Switcher with live SSE sync pill (Anika, Dev, Meera, Kabir, Neha, Farah)<br>• Training Centre Dashboard with atomic spreadsheet uploader & HTTP 422 error preview modal (Moment #1)<br>• Multi-Officer Quorum & Review modal with Send-Back versioning (v1 &rarr; v2) & mandatory comments (Moments #2 & #6)<br>• State Directorate Dashboard with SLA escalation banner & instant revocation modal (Moments #4 & #5)<br>• Real-time SSE stream subscriber (`/api/v1/events/stream`) with auto-reconnect & toast alerts<br>• Zero-login Public Verification portal (`/verify`) with masked names (`R**** K****`), privacy notice, and zero unauthenticated PII leakage | **COMPLETED** | ✅ Verified & Approved |
| **Phase 6** | **Automated Packaging & Submission Package**<br>• Comprehensive Vitest/Supertest suite verifying the 6 critical moments (21/21 passing)<br>• Multi-stage Dockerfiles (`backend`, `frontend`, `whatsapp-mock`)<br>• `docker-compose.yml` for single-command startup with healthchecks & volumes<br>• `README.md` (Executive requirements decision note at top, architecture, AI log, trade-offs)<br>• `SETUP.md` (Zero-to-running local walkthrough with seed accounts & 6 moments guide)<br>• `DEPLOYMENT.md` (100k users, 10k DAU, 30k certs/hr peak, failure playbooks, AWS Mumbai cost breakdown ~$495-$630/mo) | **COMPLETED** | ✅ Verified & Ready for Final Review |

---

## 3. The 6 Critical Moments Verification Checklist

- [x] **Moment #1 (Atomic Spreadsheet Ingestion):** Uploading malformed CSV/XLSX returns HTTP 422 with line errors; zero candidates saved in DB.
- [x] **Moment #2 (Concurrent Approval Race):** Dev and Meera approving simultaneously advances the batch exactly once (`SELECT ... FOR UPDATE` & composite unique constraint).
- [x] **Moment #3 (60-Candidate Flaky WhatsApp Delivery):** Outbox -> BullMQ -> WhatsApp worker delivers 60 certificates with zero duplicates despite 30% simulated provider failures.
- [x] **Moment #4 (Instant Revocation & Masked Public Verify):** Revoking an issued certificate updates PostgreSQL, flushes Redis cache, and immediately renders `REVOKED` on public lookup with candidate name masked (`S**** V****`).
- [x] **Moment #5 (Automated SLA Escalation):** Stale batch sitting past SLA emits `BATCH_ESCALATED` via SSE to State Office (`Farah`).
- [x] **Moment #6 (Send-Back & Resubmission Versioning):** Resubmission increments `submission_version` (v1 -> v2), supersedes prior approvals, and resets active approvals to 0 in `PENDING_DISTRICT`.

---

## 4. Invariants Matrix ("Things That Must Never Happen")

- [x] **Invariant 1:** Unauthorized roles acting out of stage returns HTTP 403 Forbidden.
- [x] **Invariant 2:** No candidate receives duplicate certificates; monotonic sequence guarantees unique `certificate_number`.
- [x] **Invariant 3:** Revoked certificate never renders `VALID`.
- [x] **Invariant 4:** Unauthenticated public verification never exposes candidate phone number, government ID, or direct PDF download URLs.
- [x] **Invariant 5:** Every decision and state change is immutably recorded in `audit_logs` with `correlation_id`.
