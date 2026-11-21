import { z } from 'zod';
import { ApprovalDecision } from '../types/enums.js';

// Regex for E.164 or 10-digit Indian Mobile Numbers
// Accepts "+919876543210", "919876543210", or "9876543210"
export const indianMobileRegex = /^(?:\+91|91)?[6-9]\d{9}$/;

export const CandidateRowSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must have at least 2 characters').max(160),
  phoneNumber: z.string().trim().regex(indianMobileRegex, 'Phone number must be a valid 10-digit Indian mobile number (e.g. +919876543210)'),
  candidateGovId: z.string().trim().min(3, 'Candidate Gov/Roll ID must be at least 3 characters').max(64),
  assessmentScore: z.number().min(0, 'Score must be at least 0').max(100, 'Score cannot exceed 100'),
  completionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Completion date must be YYYY-MM-DD format')
});

export type CandidateRowInput = z.infer<typeof CandidateRowSchema>;

export const CreateBatchSchema = z.object({
  courseName: z.string().trim().min(3, 'Course name must have at least 3 characters').max(160)
});

export type CreateBatchInput = z.infer<typeof CreateBatchSchema>;

export const DecisionSchema = z.object({
  decision: z.nativeEnum(ApprovalDecision),
  reason: z.string().trim().optional().nullable()
}).refine((data) => {
  if ((data.decision === ApprovalDecision.REJECT || data.decision === ApprovalDecision.SEND_BACK)) {
    return !!data.reason && data.reason.trim().length >= 5;
  }
  return true;
}, {
  message: 'A mandatory reason of at least 5 characters is required when rejecting or sending back a batch.',
  path: ['reason']
});

export type DecisionInput = z.infer<typeof DecisionSchema>;

export const RevokeCertificateSchema = z.object({
  reason: z.string().trim().min(5, 'Revocation reason must have at least 5 characters').max(500)
});

export type RevokeCertificateInput = z.infer<typeof RevokeCertificateSchema>;
