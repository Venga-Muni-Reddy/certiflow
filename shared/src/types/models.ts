import {
  UserRole,
  BatchStatus,
  ApprovalStage,
  ApprovalDecision,
  ApprovalRecordStatus,
  CertificateStatus
} from './enums.js';

export interface DistrictModel {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}

export interface TrainingCentreModel {
  id: string;
  name: string;
  code: string;
  districtId: string;
  createdAt: string;
}

export interface UserModel {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  districtId?: string | null;
  trainingCentreId?: string | null;
  createdAt: string;
}

export interface BatchCandidateModel {
  id: string;
  batchId: string;
  rowNumber: number;
  fullName: string;
  phoneNumber: string;
  candidateGovId: string;
  assessmentScore: number;
  completionDate: string;
  createdAt: string;
}

export interface BatchModel {
  id: string;
  batchCode: string;
  trainingCentreId: string;
  districtId: string;
  courseName: string;
  status: BatchStatus;
  candidateCount: number;
  submissionVersion: number;
  version: number;
  stateEnteredAt: string;
  escalatedAt?: string | null;
  lastFeedback?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchApprovalModel {
  id: string;
  batchId: string;
  submissionVersion: number;
  stage: ApprovalStage;
  actorId: string;
  decision: ApprovalDecision;
  reason?: string | null;
  status: ApprovalRecordStatus;
  createdAt: string;
}

export interface CertificateModel {
  id: string;
  certificateNumber: string;
  batchId: string;
  candidateId: string;
  downloadTokenHash: string;
  s3ObjectKey?: string | null;
  status: CertificateStatus;
  deliveryAttempts: number;
  lastDeliveryError?: string | null;
  issuedAt: string;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
}

export interface AuditLogModel {
  id: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  actorRole: string;
  action: string;
  metadata: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}
