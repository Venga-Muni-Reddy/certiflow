# CertiFlow Project Status & Implementation Tracker

## 1. Project Overview & Vision
**CertiFlow** is an auditable, event-driven skilling certificate issuance and public verification platform for the **Pragati Skills Mission**. It replaces spreadsheets, informal WhatsApp approvals, and manual Word document generation with an automated, concurrency-safe, tamper-proof system delivering certificates in minutes with zero-login instant public verification.

* **Target Submission Deadline:** 2:30 PM
* **Local Architecture:** PostgreSQL 16, Redis 7 (Cache, Pub/Sub, BullMQ), Node.js/Express TypeScript backend + BullMQ workers, Stand-in WhatsApp mock with chaos injection, React + Vite frontend.

---

## 2. Phase-by-Phase Roadmap & Status

| Phase | Description | Status | Review & Approval Gates |
| :--- | :--- | :---: | :--- |
| **Phase 1** | **Monorepo Scaffolding & Shared Types**<br>• Setup npm workspaces (`shared`, `backend`, `frontend`, `whatsapp-mock`)<br>• Shared TypeScript models, enums, DTOs, Zod validators<br>• Verified build across all 4 workspaces (`npm run build`)<br>• Project status tracking doc | **COMPLETED** | ✅ Verified & Ready for User Review |
| **Phase 2** | **Database & Persistence Layer**<br>• Prisma schema for all 8 entities (`prisma/schema.prisma`)<br>• Custom SQL invariants (`cert_serial_seq`, partial indexes, immutable audit trigger)<br>• Idempotent seed data (Anika, Dev, Meera, Kabir, Neha, Farah + 3 sample batches)<br>• Generated Prisma client & type-checked | **COMPLETED** | ✅ Verified & Ready for User Review |
| **Phase 3** | **Stand-In WhatsApp Mock Service**<br>• Flaky WhatsApp mock with `/api/messages`<br>• Idempotency ledger (`X-Idempotency-Key`)<br>• Dynamic Chaos simulation endpoint (`/api/chaos`)<br>• Web inbox UI (`/inbox`) for live message & download link inspection | **NOT STARTED** | Requires User Approval |
| **Phase 4** | **Backend API & BullMQ Workers**<br>• Express REST API with JWT auth and RBAC middleware<br>• Demo persona switcher (`/api/v1/auth/demo-switch`)<br>• Atomic 2-pass spreadsheet validator (0 rows on error)<br>• Concurrency-safe approval state machine (`SELECT ... FOR UPDATE`)<br>• Transactional Outbox poller (`SKIP LOCKED`)<br>• BullMQ PDF generator (`pdfkit` + QR) & WhatsApp delivery worker with exponential backoff<br>• SLA monitor cron worker (30s demo / 24h prod)<br>• Instant revocation & zero-login masked public verification<br>• Live SSE stream (`/api/v1/events/stream`) | **NOT STARTED** | Requires User Approval |
| **Phase 5** | **Frontend Application (React + Vite)**<br>• Stitch-integrated design tokens & UI components<br>• Top-bar Persona Switcher with role badges<br>• Training Centre Dashboard (Batch creation, CSV upload, error preview modal)<br>• District & Quality Officer Review View (Side-by-side candidates, approve/reject/send-back modal)<br>• State Office Operations Dashboard (Pending batches, SLA escalations, issued certificates, revocation)<br>• Real-time SSE updates without page refresh<br>• Public Certificate Verification page (`/verify/:certNo`) | **NOT STARTED** | Requires User Approval |
| **Phase 6** | **Automated Tests & Submission Package**<br>• Comprehensive Vitest/Supertest suite verifying the 6 critical moments<br>• `docker-compose.yml` for single-command startup<br>• `README.md` (requirements decision note, architecture, AI log, trade-offs)<br>• `SETUP.md` (zero-to-running local walkthrough)<br>• `DEPLOYMENT.md` (100k users, 10k DAU, 30k certs/hr peak, failure playbooks, AWS cost breakdown) | **NOT STARTED** | Requires User Approval |

---

## 3. The 6 Critical Moments Verification Checklist

- [ ] **Moment #1 (Atomic Spreadsheet Ingestion):** Uploading malformed CSV/XLSX returns HTTP 422 with line errors; zero candidates saved in DB.
- [ ] **Moment #2 (Concurrent Approval Race):** Dev and Meera approving simultaneously advances the batch exactly once (`SELECT ... FOR UPDATE` & composite unique constraint).
- [ ] **Moment #3 (60-Candidate Flaky WhatsApp Delivery):** Outbox -> BullMQ -> WhatsApp worker delivers 60 certificates with zero duplicates despite 40% simulated provider failures.
- [ ] **Moment #4 (Instant Revocation & Masked Public Verify):** Revoking an issued certificate updates PostgreSQL, flushes Redis cache, and immediately renders `REVOKED` on public lookup with candidate name masked (`A**** R****`).
- [ ] **Moment #5 (Automated SLA Escalation):** Stale batch sitting past SLA emits `BATCH_ESCALATED` via SSE to State Office (`Farah`).
- [ ] **Moment #6 (Send-Back & Resubmission Versioning):** Resubmission increments `submission_version` (v1 -> v2), supersedes prior approvals, and resets active approvals to 0 in `PENDING_DISTRICT`.

---

## 4. Invariants Matrix ("Things That Must Never Happen")

- [ ] **Invariant 1:** Unauthorized roles acting out of stage returns HTTP 403 Forbidden.
- [ ] **Invariant 2:** No candidate receives duplicate certificates; monotonic sequence guarantees unique `certificate_number`.
- [ ] **Invariant 3:** Revoked certificate never renders `VALID`.
- [ ] **Invariant 4:** Unauthenticated public verification never exposes candidate phone number, government ID, or direct PDF download URLs.
- [ ] **Invariant 5:** Every decision and state change is immutably recorded in `audit_logs` with `correlation_id`.
