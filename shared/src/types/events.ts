import { BatchStatus } from './enums.js';

export interface SSEBaseEvent<T = unknown> {
  type: string;
  timestamp: string;
  data: T;
}

export interface BatchUpdatedEventPayload {
  batchId: string;
  batchCode: string;
  status: BatchStatus;
  submissionVersion: number;
  timestamp: string;
}

export interface BatchEscalatedEventPayload {
  batchId: string;
  batchCode: string;
  status: BatchStatus;
  escalatedAt: string;
}

export interface CertificateDeliveredEventPayload {
  batchId: string;
  certificateNumber: string;
  candidateName: string;
  deliveredCount: number;
  totalCount: number;
}

export interface CertificateRevokedEventPayload {
  certificateNumber: string;
  revokedAt: string;
  reason: string;
}
