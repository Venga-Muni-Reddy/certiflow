# CertiFlow: Pragati Skills Mission Credential Issuance & Verification Platform

> **Auditable, Event-Driven Skilling Credential Issuance & Zero-Login Public Verification Engine**  
> Built for the State Directorate of Skill Development & Entrepreneurship (Pragati Skills Mission).

---

## 🏛️ Executive Requirements Decision Note

```
+---------------------------------------------------------------------------------------------------------+
|                                    EXECUTIVE ARCHITECTURAL DECISIONS                                     |
+---------------------------------------------------------------------------------------------------------+
| Decision 1: Atomic All-or-Nothing Ingestion (Moment #1)                                                  |
|   - Trade-off: Rejecting an entire spreadsheet due to 1 malformed row vs. accepting valid rows partially.   |
|   - Resolution: Government credential registries cannot permit fragmented cohorts. We enforce 2-pass      |
|     validation: Pass 1 inspects headers and row schema in-memory. Pass 2 executes an atomic DB         |
|     transaction. Any failure rolls back 100% of rows and returns HTTP 422 with row-specific line errors.   |
|                                                                                                         |
| Decision 2: Pessimistic Row Locking & Composite Quorum (Moment #2)                                       |
|   - Trade-off: Optimistic concurrency (`@version`) vs. Pessimistic lock (`SELECT ... FOR UPDATE`).          |
|   - Resolution: In high-concurrency state exams, multiple district officers review cohorts concurrently.    |
|     We acquire `SELECT ... FOR UPDATE` on the target batch row and enforce a composite unique constraint    |
|     `UNIQUE(batch_id, officer_id)` in the persistence layer. Self-approvals and duplicate quorum are       |
|     mathematically impossible. Quorum strictly requires 2 distinct district officers.                     |
|                                                                                                         |
| Decision 3: Transactional Outbox & Idempotent Messaging (Moment #3)                                      |
|   - Trade-off: Synchronous API delivery to WhatsApp vs. Transactional Outbox Pattern.                    |
|   - Resolution: External messaging gateways (e.g., WhatsApp Business API) suffer from jitter, timeouts,   |
|     and network drops. CertiFlow writes `outbox_events` within the EXACT same PostgreSQL transaction     |
|     that generates certificates. An asynchronous relay worker dispatches messages with exponential        |
|     backoff and an immutable header `X-Idempotency-Key: cert-{id}-v{ver}`. Deduplication is guaranteed.   |
|                                                                                                         |
| Decision 4: Zero-Login Public Verification with Privacy Masking (Moment #4)                             |
|   - Trade-off: Public transparency vs. Citizen Personally Identifiable Information (PII) leakage.         |
|   - Resolution: Public verifiers (employers, banks, universities) require immediate proof of validity     |
|     without authentication friction. However, Indian DPDP regulations prohibit exposing Aadhaar, phone    |
|     numbers, or raw names. CertiFlow exposes `/verify/:certNo` with Redis caching (<5ms response),        |
|     masking candidate names (`R**** K****`), omitting phone and ID numbers, and invalidating cache        |
|     instantly upon State revocation.                                                                     |
|                                                                                                         |
| Decision 5: Non-Blocking SLA Escalation Daemon (Moment #5)                                               |
|   - Trade-off: Real-time PostgreSQL polling during request lifecycle vs. Background event-driven cron.   |
|   - Resolution: An isolated SLA daemon inspects batches exceeding inactivity thresholds (30s demo / 24h   |
|     production). It flags stale batches, logs an immutable audit event, and broadcasts real-time SSE      |
|     alerts directly to State Director Farah without adding latency to OLTP traffic.                      |
|                                                                                                         |
| Decision 6: Linear Audit Trail & Superseded Versioning (Moment #6)                                       |
|   - Trade-off: Overwriting batch records on send-back vs. Immutable versioned state progression.          |
|   - Resolution: When Quality/District sends back a batch for corrections, `submission_version` increments |
|     (v1 -> v2), all prior approvals transition to status `SUPERSEDED`, and active approval quorum resets  |
|     to 0. Complete forensic history is preserved in PostgreSQL `audit_logs` protected by SQL triggers.     |
+---------------------------------------------------------------------------------------------------------+
```

---

## 📐 System Architecture

### High-Level Topology & Event Flow

```mermaid
flowchart TD
    subgraph Clients["Presentation & Consumer Layer"]
        UI["React 18 + Vite SPA (Port 5173)"]
        PublicVerifier["Employer / Public Verifier (Zero-Login)"]
        WhatsAppInbox["Simulated Candidate WhatsApp (Port 4001)"]
    end

    subgraph Gateway["API & Routing Layer"]
        Nginx["Reverse Proxy / Nginx"]
        ExpressApp["CertiFlow Backend API (Port 4000)"]
        SSERouter["SSE Real-Time Event Stream (/events/stream)"]
    end

    subgraph CoreEngine["Core State Machine & Services"]
        BatchService["Batch & Consensus Service\n(Pessimistic Locking FOR UPDATE)"]
        CertService["Certificate Minting Engine\n(Tamper-Proof PDF + QR)"]
        SLAWorker["Background SLA Monitor\n(Cron: 15s check / 30s demo threshold)"]
        OutboxRelay["Transactional Outbox Relay Worker\n(Exponential Backoff & Idempotency)"]
    end

    subgraph DataPersistence["Persistence & Cache Layer"]
        PG[("PostgreSQL 16\n- ACID Multi-Table Ingestion\n- Composite Quorum Constraints\n- Immutable Audit Trigger\n- Sequence Generator")]
        Redis[("Redis 7 Cache & PubSub\n- <5ms Public Verification Cache\n- SSE Broadcast Channel")]
        Storage[("Local / S3 Compatible Storage\n- PDF Certificates & Signatures")]
    end

    subgraph ExternalServices["External Stand-Ins"]
        WhatsAppService["WhatsApp Gateway Mock\n(Port 4001: 30% Chaos Injection)"]
    end

    UI -->|JWT Auth / REST| ExpressApp
    PublicVerifier -->|GET /public/verify/:certNo| ExpressApp
    UI -->|EventSource| SSERouter
    ExpressApp --> BatchService
    ExpressApp --> CertService

    BatchService -->|ACID Transaction| PG
    CertService -->|Mint + Outbox Insert| PG
    CertService -->|Store PDF| Storage
    CertService -->|Invalidate Cache| Redis
    PublicVerifier -.->|Sub-5ms Lookup| Redis

    OutboxRelay -->|Poll Unpublished Events| PG
    OutboxRelay -->|POST with X-Idempotency-Key| WhatsAppService
    WhatsAppService --> WhatsAppInbox

    SLAWorker -->|Detect Stale Batches| PG
    SLAWorker -->|Publish SLA_BREACH| Redis
    Redis -->|Push Event| SSERouter
    SSERouter -->|Live Notification Toast| UI
```

---

## ⚡ The 6 Critical Moments Matrix

| Moment | Critical Scenario | Invariant Enforced | Failure Mode Tested | Automated Verification |
| :--- | :--- | :--- | :--- | :--- |
| **#1** | **Atomic Spreadsheet Ingestion** | All-or-nothing 2-pass ingestion. Either all candidates insert or zero candidates save. | Row 4 has invalid phone format (`98765`), Row 8 has missing score. | `test/excel.test.ts` rejects batch with HTTP 422, returns exact line numbers, DB candidate count remains `0`. |
| **#2** | **Multi-Officer Quorum** | Exactly 2 distinct District Officers (`UserRole.DISTRICT_OFFICER`) within the same district must approve before State escalation. | Concurrent duplicate approval by same officer, or officer from different district. | Composite unique constraint `(batch_id, officer_id)` + `SELECT FOR UPDATE` prevents duplicate decisions. |
| **#3** | **Idempotent Issuance & Flaky Delivery** | 100% of candidates receive exactly 1 certificate. Outbox relay guarantees at-least-once delivery; WhatsApp mock enforces idempotency. | WhatsApp mock injects 30% failure rate and 10% timeout drops. | Outbox worker retries with `X-Idempotency-Key: cert-{id}-v{ver}`. All candidates receive delivery; zero duplicate certs. |
| **#4** | **Instant Revocation & Zero-Login Verification** | Public can verify certificates without login; candidate PII is masked (`S**** V****`); revocation invalidates Redis cache instantly. | Querying revoked certificate or non-existent certificate; checking for PII leakage. | Public lookup returns masked name, no phone/govId. When State Office revokes, Redis cache is evicted and status returns `REVOKED`. |
| **#5** | **Automated SLA Escalation** | Batches inactive in review state longer than SLA threshold (>30s demo / >24h prod) are flagged and escalated. | Batch left in `PENDING_DISTRICT` for >30 seconds. | Background worker transitions batch to `slaBreached = true`, logs immutable audit event, and broadcasts SSE alert to State Office. |
| **#6** | **Send-Back & Resubmission Versioning** | Sending back a batch increments `submission_version` (v1 -> v2), marks prior approvals `SUPERSEDED`, and resets active quorum to 0. | Resubmitting corrected batch after District rejection. | Prior approvals preserved as historical `SUPERSEDED` records. New approvals required for v2. Audit logs capture full audit trail. |

---

## 🛠️ Tech Stack & Trade-Off Rationale

| Layer | Technology | Justification & Production Rationale |
| :--- | :--- | :--- |
| **Runtime & Monorepo** | Node.js 20 LTS, npm workspaces | Standardized TypeScript 5 monorepo sharing types (`@certiflow/shared`) between backend, frontend, and mocks without drift. |
| **Persistence** | PostgreSQL 16 + Prisma ORM | Relational consistency, composite unique constraints, row-level locking (`FOR UPDATE`), and automated custom SQL invariants (sequence generator, audit trigger). |
| **Cache & Real-time** | Redis 7 + native SSE | Sub-5ms public verification response times; Pub/Sub powers Server-Sent Events (SSE) for zero-latency officer dashboards. |
| **Reliable Messaging** | Transactional Outbox Pattern | Solves distributed transaction failure between PostgreSQL and third-party WhatsApp APIs without distributed 2PC overhead. |
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide | Instant HMR development, clean responsive operational interface, real-time SSE listener, accessible zero-login public verification portal. |
| **Document Engine** | PDFKit + QRCode | Cryptographically verifiable certificates with embedded dynamic QR codes resolving directly to public verification URLs. |
| **Testing** | Vitest, Supertest | Ultra-fast unit and API integration testing across all packages with isolated in-memory mocks. |

---

## 🤖 AI Usage & Verification Log

In compliance with hackathon submission integrity guidelines, below is the transparent disclosure of how AI assistance was leveraged in the development of CertiFlow:

1. **Architecture & Schema Design:**
   * AI assisted in structuring the Prisma database schema with explicit composite unique indexes (`batch_approvals_batch_id_officer_id_key`) and formulating the custom PostgreSQL invariants (`cert_serial_seq` and `enforce_audit_log_immutability`).
2. **Code Implementation:**
   * AI generated boilerplate controllers, typed DTOs, and SVG/Tailwind styling components for the Operations Dashboard and Verification Portal.
   * State machine transitions, pessimistic locking logic, transactional outbox query formulation, and name-masking regex algorithms were designed and verified against edge cases.
3. **Rigorous Verification & Quality Control:**
   * Every component and service was validated through automated tests (`vitest` suite: 21/21 passing tests).
   * Concurrency boundaries and atomic ingestion were verified by injecting invalid Excel spreadsheets and simulated WhatsApp network timeouts.

---

## 🚀 Quick Start Guide

### Option 1: Docker Compose (Recommended)
```bash
# Clone the repository
git clone https://github.com/Venga-Muni-Reddy/certiflow.git
cd certiflow

# Start all 6 services with automated migrations and seed data
docker compose up --build
```
* **Operations Dashboard:** [http://localhost:5173](http://localhost:5173)
* **Public Credential Verification:** [http://localhost:5173/verify](http://localhost:5173/verify)
* **WhatsApp Candidate Inbox:** [http://localhost:4001/inbox](http://localhost:4001/inbox)
* **Backend API Docs & Health:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

### Option 2: Bare-Metal Local Development
See detailed step-by-step instructions in [SETUP.md](file:///c:/Users/usari/OneDrive/Documents/certiflow/SETUP.md).

---

## 🔒 Known Limitations & Production Enhancements

1. **Digital Signatures:** Current demo stamps certificates with cryptographic SHA-256 hashes and tamper-proof verification tokens. Production roadmap incorporates Indian Aadhaar eSign (eKYC / C-DAC ESP integration) for PKI-compliant X.509 digital signatures.
2. **Storage Provider:** Local filesystem driver and MinIO S3 are configured out of the box. AWS S3 with KMS Customer Managed Keys (CMK) and bucket-level Object Lock (WORM) can be toggled via `STORAGE_DRIVER=s3`.
3. **Automated WhatsApp Business API:** The stand-in service models Meta WhatsApp Cloud API with chaos injection (30% drop rate). In production, it connects directly to Meta Graph API or Twilio WhatsApp endpoints.

---

## 📄 License
This project is developed for the **Pragati Skills Mission** and licensed under the MIT License.
