# CertiFlow: Zero-to-Running Local Setup Guide

This guide walks you through setting up and running **CertiFlow** locally, executing the automated test suite, and manually verifying the **6 Critical Moments**.

---

## 📋 System Prerequisites

* **Node.js:** v20.x or higher (LTS recommended)
* **npm:** v10.x or higher
* **Docker & Docker Compose:** Required for containerized execution
* **Git:** For source code checkout

---

## ⚡ Option 1: Docker Compose (Zero Configuration)

The fastest way to spin up the entire multi-service ecosystem (PostgreSQL, Redis, MinIO S3, Backend API, WhatsApp Mock, and React Frontend) is using Docker Compose.

```bash
# 1. Clone repository
git clone https://github.com/Venga-Muni-Reddy/certiflow.git
cd certiflow

# 2. Build and launch all containers
docker compose up --build
```

The database migrations, custom PostgreSQL invariants (`cert_serial_seq` and audit triggers), and seed data are applied automatically on startup.

### Active Service Endpoints:
* **CertiFlow Operations Dashboard:** [http://localhost:5173](http://localhost:5173)
* **Zero-Login Public Verification Portal:** [http://localhost:5173/verify](http://localhost:5173/verify)
* **Candidate WhatsApp Simulator Inbox:** [http://localhost:4001/inbox](http://localhost:4001/inbox)
* **CertiFlow Backend REST API:** [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
* **MinIO S3 Console:** [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`)

---

## 💻 Option 2: Bare-Metal Local Development

If running locally without Docker:

### 1. Install Dependencies
```bash
npm install
npm run build:shared
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your local PostgreSQL 16 instance is running at `localhost:5432` and Redis 7 is at `localhost:6379`.

### 3. Automated Database Setup & Seed
Execute the automated database setup script. This generates Prisma client types, synchronizes database tables, creates custom sequences and triggers, and seeds all demo accounts:
```bash
# Runs Prisma generate, migrations, custom SQL invariants, and seeds users
npm run db:setup
npm run prisma:seed --workspace=backend
```

### 4. Launch Services in Separate Terminals
```bash
# Terminal 1: Backend API & Background Workers (Port 4000)
npm run dev:backend

# Terminal 2: WhatsApp Flaky Mock Service (Port 4001)
npm run dev:whatsapp

# Terminal 3: React Frontend Application (Port 5173)
npm run dev:frontend
```

---

## 👥 Seed Accounts & Demo Personas

CertiFlow includes a top-bar **Interactive Persona Switcher** allowing you to instantly switch between roles and issue new JWT tokens without manual logins:

| Persona Name | Role | Jurisdiction | Email | Primary Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **Anika Sharma** | `TRAINING_CENTRE_ADMIN` | Hyderabad Metro TC | `anika.tc@pragatiskills.gov.in` | Uploads batches (Moment #1), fixes rejected cohorts (Moment #6). |
| **Dev Patel** | `DISTRICT_OFFICER` | Hyderabad District | `dev.do@pragatiskills.gov.in` | First-tier multi-officer consensus approval (Moment #2). |
| **Meera Reddy** | `DISTRICT_OFFICER` | Hyderabad District | `meera.do@pragatiskills.gov.in` | Second-tier distinct consensus approval (Moment #2). |
| **Kabir Singh** | `DISTRICT_OFFICER` | Hyderabad District | `kabir.do@pragatiskills.gov.in` | Additional district officer for quorum consensus. |
| **Neha Gupta** | `QUALITY_ASSURANCE` | State Directorate | `neha.qa@pragatiskills.gov.in` | Verification of compliance standards and audit criteria. |
| **Farah Khan** | `STATE_DIRECTOR` | State Directorate | `farah.state@pragatiskills.gov.in` | Final sign-off (Moment #3), SLA escalation (Moment #5), Revocation (Moment #4). |

---

## 🧪 Automated Test Suite Execution

Run the complete Vitest automated test suite across all packages (Shared, Backend, and WhatsApp Mock):

```bash
npm test
```

### Test Coverage Highlights:
* `backend/test/excel.test.ts`: Verifies **Moment #1** atomic 2-pass ingestion rollback and line-level HTTP 422 error payloads.
* `backend/test/masking.test.ts`: Verifies **Moment #4** name-masking invariants (`R**** K****`, single names, complex multi-part names).
* `backend/test/api.test.ts`: Verifies JWT issuance, role-based security, unauthenticated public verification, and candidate download token validation.
* `whatsapp-mock/test/whatsapp.test.ts`: Verifies **Moment #3** idempotency enforcement (`X-Idempotency-Key`) under simulated 30% network failure rates.

---

## 🔍 Step-by-Step Manual Verification of the 6 Critical Moments

### Moment #1: Atomic Ingestion & Line-Level Rollback
1. Switch to **Anika (TC)** using the top bar persona strip.
2. Click **"+ Ingest New Batch"**.
3. Click the red button: **"Download Invalid CSV (Fail HTTP 422)"**.
4. Upload the downloaded file and click **"Ingest Batch"**.
5. **Expected Result:** The dialog turns red, showing **"Ingestion Rejected: 0 Candidates Saved (Atomic Rollback)"** with line-specific errors (e.g., Row 4: Phone number invalid; Row 8: Missing assessment score). Database candidate count remains 0.
6. Now click **"Download Valid CSV (Pass)"**, upload it, and click **"Ingest Batch"**. The batch is accepted immediately.

---

### Moment #2: Concurrency-Safe Multi-Officer Quorum
1. As **Anika**, find your newly ingested batch and click **"Submit for District Review"**.
2. Switch to **Dev (DO)** in the top bar. Notice the **"Decide"** button appears.
3. Click **"Decide"** $\rightarrow$ select **"Approve"** $\rightarrow$ click **"Confirm Decision"**.
4. Notice the Quorum badge updates to **"Quorum: 1/2 (Moment #2)"**.
5. Attempting to approve again as Dev is prohibited by the composite unique database constraint.
6. Switch to **Meera (DO)**. Click **"Decide"** $\rightarrow$ select **"Approve"** $\rightarrow$ click **"Confirm Decision"**.
7. Notice the Quorum reaches **2/2**, and the batch automatically advances to **"State Final Review"**.

---

### Moment #3: Idempotent Issuance & WhatsApp Delivery
1. Switch to **Farah (State Director)** in the top bar.
2. On the approved batch, click **"Decide"** $\rightarrow$ select **"Approve (Sign & Issue Certificates)"**.
3. The Transactional Outbox commits certificates and queues delivery events in the same atomic transaction.
4. Open the WhatsApp Inbox simulator at [http://localhost:4001/inbox](http://localhost:4001/inbox) (or click **"WhatsApp Mock ↗"** in the top navigation bar).
5. Notice all candidates receive a personalized WhatsApp notification with their official Certificate Number and secure download link. Even if the mock injects 30% simulated network failures, the Outbox worker retries with `X-Idempotency-Key` until delivery succeeds with zero duplicate certificates.

---

### Moment #4: Instant Revocation & Zero-Login Public Verification
1. Click **"Public Verification"** in the top navigation bar (or visit [http://localhost:5173/verify](http://localhost:5173/verify)).
2. Enter certificate number `PSM-2026-HYD-100106` and click **"Verify Credential"**.
3. **Verify Privacy Invariants:** Notice the candidate's name is masked (`S**** V****`), and no phone numbers, Aadhaar numbers, or raw download URLs are displayed.
4. Switch back to **Operations Dashboard** as **Farah (State Director)**.
5. In the **"State Issued Certificates Registry"** at the bottom, find `PSM-2026-HYD-100106` and click **"Revoke"**.
6. Enter revocation reason: *"Candidate submitted falsified assessment scores during practical exam"* and confirm.
7. Return to the **Public Verification** tab and query `PSM-2026-HYD-100106` again.
8. **Expected Result:** Redis cache is invalidated within 5ms. The screen displays a high-visibility crimson red **"CERTIFICATE HAS BEEN REVOKED"** alert with the formal revocation reason and annulment date.

---

### Moment #5: Automated SLA Escalation
1. Create a new batch as **Anika** and submit it for review.
2. In demo mode, the SLA threshold is set to **30 seconds** (configured via `SLA_THRESHOLD_SECONDS=30`).
3. Leave the batch unapproved for 30 seconds.
4. **Expected Result:** The background SLA cron worker flags the batch with `slaBreached = true`, logs an immutable audit event, and broadcasts a live SSE alert. A banner appears at the top of the State Director's dashboard warning of an overdue batch review.

---

### Moment #6: Send-Back & Resubmission Versioning
1. On a batch in `PENDING_DISTRICT` status, have **Dev (DO)** click **"Decide"** $\rightarrow$ select **"Send Back for Corrections"**.
2. Provide comments: *"Candidate attendance record sheet missing official centre seal."*
3. **Expected Result:**
   * Batch status changes to `SEND_BACK`.
   * The batch version increments from `v1` to `v2`.
   * Any prior approvals are superseded and active approval count resets to 0.
   * Full historical trail is visible in the Batch Inspector audit log.
