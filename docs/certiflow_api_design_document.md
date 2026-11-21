# API Design Document (ADD): CertiFlow

## 1. API Conventions, Headers & Error Envelope

* **Base URL:** `http://localhost:4000/api/v1` (via Nginx/Vite proxy `/api/v1`)
* **Content-Type:** `application/json` (except `multipart/form-data` for candidate spreadsheet uploads and `application/pdf` for certificate downloads)
* **Authentication:** `Authorization: Bearer <JWT>` (HS256 signed token containing `{ sub: userId, role, districtId, trainingCentreId }`)
* **Observability Header:** Every request accepts or auto-generates `X-Correlation-ID` (UUIDv4), echoed back in response headers and attached to all logs, outbox events, and audit records.

### 1.1 Standard Error Response Envelope
All `4xx` and `5xx` responses conform to a deterministic structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Spreadsheet contains 2 invalid rows; zero candidates were saved.",
    "correlationId": "9f8c2a1b-4d3e-4b1a-8c7d-6e5f4a3b2c1d",
    "details": [
      { "rowNumber": 4, "field": "phone_number", "message": "Invalid Indian mobile number format" },
      { "rowNumber": 9, "field": "candidate_gov_id", "message": "Duplicate candidate_gov_id within file" }
    ]
  }
}
```

### 1.2 Standard HTTP Status Codes
* `200 OK` / `201 Created`: Successful read or mutation
* `400 Bad Request`: Malformed JSON, missing required fields, or corrupt CSV/XLSX file
* `401 Unauthorized`: Missing/expired JWT or invalid candidate download token
* `403 Forbidden`: Valid user acting outside their stage, district, training centre, or on a revoked certificate
* `404 Not Found`: Resource does not exist (or hidden due to tenant isolation)
* `409 Conflict`: Optimistic/state transition conflict (e.g., officer already approved this version, or batch already advanced)
* `422 Unprocessable Entity`: Atomic spreadsheet validation failure (zero rows committed)

---

## 2. Authentication & Demo Persona Switching

### 2.1 List Demo Personas
`GET /api/v1/auth/demo-users` *(Public when `DEMO_MODE=true`)*

**Response `200 OK`:**
```json
{
  "users": [
    { "id": "11111111-1111-1111-1111-111111111101", "name": "Anika", "role": "TRAINING_CENTRE", "scopeLabel": "Nirmaan Skill Academy (HYD)" },
    { "id": "11111111-1111-1111-1111-111111111102", "name": "Dev", "role": "DISTRICT_OFFICER", "scopeLabel": "Hyderabad Metro (HYD)" },
    { "id": "11111111-1111-1111-1111-111111111103", "name": "Meera", "role": "DISTRICT_OFFICER", "scopeLabel": "Hyderabad Metro (HYD)" },
    { "id": "11111111-1111-1111-1111-111111111104", "name": "Kabir", "role": "DISTRICT_OFFICER", "scopeLabel": "Hyderabad Metro (HYD)" },
    { "id": "11111111-1111-1111-1111-111111111105", "name": "Neha", "role": "QUALITY_TEAM", "scopeLabel": "State Quality Assurance" },
    { "id": "11111111-1111-1111-1111-111111111106", "name": "Farah", "role": "STATE_OFFICE", "scopeLabel": "Pragati State Directorate" }
  ]
}
```

### 2.2 Switch Active Demo User
`POST /api/v1/auth/demo-switch` *(Public when `DEMO_MODE=true`)*

**Request Body:**
```json
{ "userId": "11111111-1111-1111-1111-111111111101" }
```

**Response `200 OK`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "11111111-1111-1111-1111-111111111101",
    "name": "Anika",
    "role": "TRAINING_CENTRE",
    "trainingCentreId": "22222222-2222-2222-2222-222222222201",
    "districtId": "33333333-3333-3333-3333-333333333301"
  }
}
```

---

## 3. Batch Lifecycle Endpoints

### 3.1 List Batches (Role-Scoped)
`GET /api/v1/batches?status=PENDING_DISTRICT&escalatedOnly=false`
* **RBAC Scoping:**
  * `TRAINING_CENTRE`: Only batches where `training_centre_id == user.trainingCentreId`
  * `DISTRICT_OFFICER`: Only batches where `district_id == user.districtId`
  * `QUALITY_TEAM`: Batches in `PENDING_QUALITY` (or previously reviewed by Quality)
  * `STATE_OFFICE`: All batches across all districts

**Response `200 OK`:**
```json
{
  "batches": [
    {
      "id": "44444444-4444-4444-4444-444444444402",
      "batchCode": "BCH-2026-DEMO-02",
      "courseName": "Solar PV Technician",
      "trainingCentreName": "Nirmaan Skill Academy",
      "districtCode": "HYD",
      "status": "PENDING_DISTRICT",
      "candidateCount": 60,
      "requiresQualityReview": true,
      "submissionVersion": 1,
      "districtApprovalsCount": 1,
      "districtApprovalsRequired": 2,
      "stateEnteredAt": "2026-11-21T04:00:00.000Z",
      "escalatedAt": null,
      "lastFeedback": null
    }
  ]
}
```

### 3.2 Create Draft Batch
`POST /api/v1/batches`
* **RBAC:** `TRAINING_CENTRE` only

**Request Body:**
```json
{
  "courseName": "Industrial Electrician Level 4"
}
```

**Response `201 Created`:**
```json
{
  "id": "55555555-5555-5555-5555-555555555501",
  "batchCode": "BCH-2026-HYD-009",
  "courseName": "Industrial Electrician Level 4",
  "status": "DRAFT",
  "candidateCount": 0,
  "submissionVersion": 1
}
```

### 3.3 Atomic Candidate Spreadsheet Upload (Moment #1)
`POST /api/v1/batches/:batchId/candidates/upload`
* **RBAC:** `TRAINING_CENTRE` (owner of batch); `batch.status` must be `DRAFT` or `CHANGES_REQUESTED`.
* **Request:** `multipart/form-data` with field `file` (`.csv` or `.xlsx`, max 2MB).
* **Expected Columns:** `full_name`, `phone_number`, `candidate_gov_id`, `assessment_score`, `completion_date`.

**Response `200 OK` (All rows valid):**
```json
{
  "batchId": "55555555-5555-5555-5555-555555555501",
  "uploadedCount": 60,
  "requiresQualityReview": true,
  "candidatesPreview": [
    {
      "rowNumber": 1,
      "fullName": "Rohan Kulkarni",
      "phoneNumber": "+919876543210",
      "candidateGovId": "GOV-9001",
      "assessmentScore": 84.5,
      "completionDate": "2026-11-15"
    }
  ]
}
```

**Response `422 Unprocessable Entity` (Any row invalid — 0 rows saved):**
```json
{
  "error": {
    "code": "SPREADSHEET_VALIDATION_FAILED",
    "message": "3 validation error(s) found. No candidates were imported.",
    "correlationId": "a1b2c3d4-...",
    "details": [
      { "rowNumber": 2, "field": "phone_number", "message": "Must be a valid 10-digit Indian mobile number" },
      { "rowNumber": 7, "field": "assessment_score", "message": "Score must be between 0 and 100" },
      { "rowNumber": 12, "field": "candidate_gov_id", "message": "Duplicate ID 'GOV-9004' found at row 4" }
    ]
  }
}
```

### 3.4 Submit or Resubmit Batch for Approval (Moment #6)
`POST /api/v1/batches/:batchId/submit`
* **RBAC:** `TRAINING_CENTRE` (owner of batch); `batch.status` must be `DRAFT` or `CHANGES_REQUESTED`, and `candidateCount > 0`.
* **Behavior:**
  * If `DRAFT` $\rightarrow$ transitions to `PENDING_DISTRICT` (`submissionVersion = 1`).
  * If `CHANGES_REQUESTED` $\rightarrow$ marks all prior `ACTIVE` rows in `batch_approvals` as `SUPERSEDED`, increments `submissionVersion` (`v1` $\rightarrow$ `v2`), clears `escalatedAt`, and transitions to `PENDING_DISTRICT` with `0` active approvals.

**Response `200 OK`:**
```json
{
  "id": "55555555-5555-5555-5555-555555555501",
  "status": "PENDING_DISTRICT",
  "submissionVersion": 2,
  "activeApprovals": 0
}
```

### 3.5 Get Batch Details, Candidates & Full Audit Timeline
`GET /api/v1/batches/:batchId`
* **RBAC:** Any authorized role within scope (returns `403`/`404` if out of district/centre scope).

**Response `200 OK`:**
```json
{
  "batch": {
    "id": "44444444-4444-4444-4444-444444444402",
    "batchCode": "BCH-2026-DEMO-02",
    "courseName": "Solar PV Technician",
    "status": "PENDING_DISTRICT",
    "candidateCount": 60,
    "submissionVersion": 1,
    "stateEnteredAt": "2026-11-21T04:00:00.000Z",
    "escalatedAt": null
  },
  "approvals": [
    {
      "id": "77777777-...",
      "submissionVersion": 1,
      "stage": "DISTRICT",
      "actorName": "Dev",
      "decision": "APPROVE",
      "reason": null,
      "status": "ACTIVE",
      "createdAt": "2026-11-21T04:12:00.000Z"
    }
  ],
  "candidates": [ "..." ],
  "auditTrail": [
    {
      "action": "BATCH_SUBMITTED",
      "actorRole": "TRAINING_CENTRE",
      "correlationId": "c8d9e0f1-...",
      "createdAt": "2026-11-21T04:00:00.000Z"
    }
  ]
}
```

---

## 4. Officer Decision Endpoint (Moments #2 & #3)

### 4.1 Record Approval, Rejection, or Send-Back
`POST /api/v1/batches/:batchId/decisions`
* **RBAC & Stage Guard:**
  * `DISTRICT_OFFICER` $\rightarrow$ allowed only if `batch.status === 'PENDING_DISTRICT'` and `batch.districtId === user.districtId`
  * `QUALITY_TEAM` $\rightarrow$ allowed only if `batch.status === 'PENDING_QUALITY'`
  * `STATE_OFFICE` $\rightarrow$ allowed only if `batch.status === 'PENDING_STATE'`
  * Any mismatch returns `403 Forbidden`.

**Request Body:**
```json
{
  "decision": "APPROVE",
  "reason": null
}
```
*(Note: `decision` is `"APPROVE" | "REJECT" | "SEND_BACK"`. `reason` is required with min length 5 chars whenever `decision` is `"REJECT"` or `"SEND_BACK"`.)*

**Response `200 OK` (District 2nd Approval advancing a 60-candidate batch):**
```json
{
  "batchId": "44444444-4444-4444-4444-444444444402",
  "previousStatus": "PENDING_DISTRICT",
  "newStatus": "PENDING_QUALITY",
  "submissionVersion": 1,
  "stageApprovalsCount": 2,
  "stageApprovalsRequired": 2
}
```

**Response `200 OK` (State Office Final Approval triggering async issuance):**
```json
{
  "batchId": "44444444-4444-4444-4444-444444444402",
  "previousStatus": "PENDING_STATE",
  "newStatus": "APPROVED_ISSUING",
  "certificatesQueued": 60
}
```

**Response `409 Conflict` (Duplicate officer approval or concurrent race lost):**
```json
{
  "error": {
    "code": "DUPLICATE_OR_STALE_DECISION",
    "message": "You have already recorded a decision for this batch version or the batch has moved stages.",
    "correlationId": "f1e2d3c4-..."
  }
}
```

---

## 5. Certificate Management & Revocation (Moment #4)

### 5.1 List Certificates in a Batch
`GET /api/v1/batches/:batchId/certificates`
* **RBAC:** `STATE_OFFICE`, `QUALITY_TEAM`, scoped `DISTRICT_OFFICER`, or owning `TRAINING_CENTRE`.

**Response `200 OK`:**
```json
{
  "certificates": [
    {
      "id": "88888888-8888-8888-8888-888888888801",
      "certificateNumber": "PSM-2026-HYD-100001",
      "candidateName": "Aarav Reddy",
      "status": "DELIVERED",
      "deliveryAttempts": 1,
      "issuedAt": "2026-11-21T04:30:00.000Z",
      "revokedAt": null,
      "revocationReason": null
    }
  ]
}
```

### 5.2 Revoke an Issued Certificate (Moment #4)
`POST /api/v1/certificates/:certificateId/revoke`
* **RBAC:** `STATE_OFFICE` (`Farah`) only. Returns `403 Forbidden` for all other roles.

**Request Body:**
```json
{
  "reason": "Fraudulent assessment score reported by district audit"
}
```

**Response `200 OK`:**
```json
{
  "id": "88888888-8888-8888-8888-888888888801",
  "certificateNumber": "PSM-2026-HYD-100001",
  "status": "REVOKED",
  "revokedAt": "2026-11-21T04:45:12.000Z",
  "revokedBy": "Farah",
  "revocationReason": "Fraudulent assessment score reported by district audit"
}
```

---

## 6. Public Verification & Candidate Download Endpoints (Unauthenticated)

### 6.1 Public Certificate Verification (Zero-Login, Privacy-Safe)
`GET /api/v1/public/verify/:certificateNumber`
* **Authentication:** None required.
* **Privacy Guarantee:** Never exposes candidate phone number, government ID, assessment score, or PDF download link.

**Response `200 OK` (Valid Certificate):**
```json
{
  "found": true,
  "certificateNumber": "PSM-2026-HYD-100001",
  "status": "VALID",
  "candidateMaskedName": "A**** R****",
  "courseName": "Solar PV Technician",
  "trainingCentreName": "Nirmaan Skill Academy",
  "districtName": "Hyderabad Metro",
  "issuedAt": "2026-11-21T04:30:00.000Z",
  "revokedAt": null,
  "revocationReason": null
}
```

**Response `200 OK` (Revoked Certificate):**
```json
{
  "found": true,
  "certificateNumber": "PSM-2026-HYD-100001",
  "status": "REVOKED",
  "candidateMaskedName": "A**** R****",
  "courseName": "Solar PV Technician",
  "trainingCentreName": "Nirmaan Skill Academy",
  "districtName": "Hyderabad Metro",
  "issuedAt": "2026-11-21T04:30:00.000Z",
  "revokedAt": "2026-11-21T04:45:12.000Z",
  "revocationReason": "Fraudulent assessment score reported by district audit"
}
```

**Response `404 Not Found` (Non-existent / Forged Certificate Number):**
```json
{
  "error": {
    "code": "CERTIFICATE_NOT_FOUND",
    "message": "No certificate matches the provided number.",
    "correlationId": "b2c3d4e5-..."
  }
}
```

### 6.2 Secure Candidate Certificate Download
`GET /api/v1/public/certificates/download?token=<secret_download_token>`
* **Authentication:** Cryptographic 256-bit random token sent exclusively to the candidate's WhatsApp.
* **Behavior:**
  * Hashes `token` with SHA-256 and matches `certificates.download_token_hash`.
  * If invalid/missing $\rightarrow$ `401 Unauthorized`.
  * If `certificate.status === 'REVOKED'` $\rightarrow$ `403 Forbidden` (`CERTIFICATE_REVOKED`).
  * Streams the PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="PSM-2026-HYD-100001.pdf"`).

---

## 7. Real-Time Server-Sent Events (SSE) Stream

### 7.1 Subscribe to Live Platform Events
`GET /api/v1/events/stream?token=<JWT>`
* **Content-Type:** `text/event-stream`
* **Heartbeat:** Sends `: ping\n\n` every `15s` to keep proxies/ALB alive.
* **Filtering:** Server filters outbound Redis Pub/Sub events per connected user's role and district/centre scope so sensitive batch notifications are never leaked across districts.

**Event Payloads Pushed Over Stream:**
```text
event: BATCH_UPDATED
data: {"batchId":"44444444-...","batchCode":"BCH-2026-DEMO-02","status":"PENDING_QUALITY","submissionVersion":1,"timestamp":"2026-11-21T04:15:00.000Z"}

event: BATCH_ESCALATED
data: {"batchId":"44444444-...","batchCode":"BCH-2026-DEMO-02","status":"PENDING_DISTRICT","escalatedAt":"2026-11-21T04:20:00.000Z"}

event: CERTIFICATE_DELIVERED
data: {"batchId":"44444444-...","certificateNumber":"PSM-2026-HYD-100001","deliveredCount":42,"totalCount":60}

event: CERTIFICATE_REVOKED
data: {"certificateNumber":"PSM-2026-HYD-100001","revokedAt":"2026-11-21T04:45:12.000Z"}
```

---

## 8. Stand-In WhatsApp Provider Contract (`whatsapp-mock` Service)

* **Endpoint:** `POST http://whatsapp-mock:4001/api/messages`
* **Headers:** `X-Idempotency-Key: <certificate_id>`
* **Request Body:**
  ```json
  {
    "to": "+919876543210",
    "candidateName": "Aarav Reddy",
    "certificateNumber": "PSM-2026-HYD-100001",
    "courseName": "Solar PV Technician",
    "downloadUrl": "http://localhost:4000/api/v1/public/certificates/download?token=..."
  }
  ```
* **Chaos Controls (for testing Moment #3):** `POST http://whatsapp-mock:4001/api/chaos` with `{ "failureRate": 0.4, "timeoutRate": 0.2 }` dynamically adjusts simulated network failures while preserving idempotency guarantees.
* **Reviewer Inbox UI:** `GET http://localhost:4001/inbox` renders a live phone-inbox view of all delivered WhatsApp messages and clickable PDF download buttons.