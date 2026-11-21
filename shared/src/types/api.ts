import {
  UserRole,
  BatchStatus,
  ApprovalStage,
  ApprovalDecision,
  ApprovalRecordStatus
} from './enums.js';

export interface DemoUserDTO {
  id: string;
  name: string;
  role: UserRole;
  scopeLabel: string;
  districtId?: string | null;
  trainingCentreId?: string | null;
}

export interface AuthResponseDTO {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    trainingCentreId?: string | null;
    districtId?: string | null;
  };
}

export interface SpreadsheetValidationErrorDTO {
  rowNumber: number;
  field: string;
  message: string;
}

export interface CandidateUploadResponseDTO {
  batchId: string;
  uploadedCount: number;
  requiresQualityReview: boolean;
  candidatesPreview: {
    rowNumber: number;
    fullName: string;
    phoneNumber: string;
    candidateGovId: string;
    assessmentScore: number;
    completionDate: string;
  }[];
}

export interface BatchSummaryDTO {
  id: string;
  batchCode: string;
  courseName: string;
  trainingCentreName: string;
  districtCode: string;
  districtName: string;
  status: BatchStatus;
  candidateCount: number;
  requiresQualityReview: boolean;
  submissionVersion: number;
  districtApprovalsCount: number;
  districtApprovalsRequired: number;
  stateEnteredAt: string;
  escalatedAt?: string | null;
  lastFeedback?: string | null;
}

export interface BatchDetailDTO {
  batch: BatchSummaryDTO;
  candidates: {
    id: string;
    rowNumber: number;
    fullName: string;
    phoneNumber: string;
    candidateGovId: string;
    assessmentScore: number;
    completionDate: string;
  }[];
  approvals: {
    id: string;
    submissionVersion: number;
    stage: ApprovalStage;
    actorName: string;
    actorRole: UserRole;
    decision: ApprovalDecision;
    reason?: string | null;
    status: ApprovalRecordStatus;
    createdAt: string;
  }[];
  auditTrail: {
    id: string;
    action: string;
    actorRole: string;
    metadata: Record<string, unknown>;
    correlationId: string;
    createdAt: string;
  }[];
}

export interface DecisionRequestDTO {
  decision: ApprovalDecision;
  reason?: string | null;
}

export interface DecisionResponseDTO {
  batchId: string;
  previousStatus: BatchStatus;
  newStatus: BatchStatus;
  submissionVersion: number;
  stageApprovalsCount: number;
  stageApprovalsRequired: number;
  certificatesQueued?: number;
}

export interface RevokeCertificateRequestDTO {
  reason: string;
}

export interface PublicVerificationResponseDTO {
  found: boolean;
  certificateNumber: string;
  status: 'VALID' | 'REVOKED';
  candidateMaskedName: string;
  courseName: string;
  trainingCentreName: string;
  districtName: string;
  issuedAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface StandardErrorEnvelope {
  error: {
    code: string;
    message: string;
    correlationId?: string;
    details?: SpreadsheetValidationErrorDTO[];
  };
}
