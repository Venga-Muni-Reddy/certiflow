import { BatchStatus, UserRole } from '@certiflow/shared';

export function getStatusBadge(status: BatchStatus): { label: string; bg: string; text: string; border: string } {
  switch (status) {
    case BatchStatus.DRAFT:
      return { label: 'Draft', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };
    case BatchStatus.PENDING_DISTRICT:
      return { label: 'District Review', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' };
    case BatchStatus.PENDING_QUALITY:
      return { label: 'Quality Review (>50)', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' };
    case BatchStatus.PENDING_STATE:
      return { label: 'State Final Review', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' };
    case BatchStatus.APPROVED_ISSUING:
      return { label: 'Issuing Certificates', bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-300' };
    case BatchStatus.ISSUED:
      return { label: 'Issued & Delivered', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' };
    case BatchStatus.CHANGES_REQUESTED:
      return { label: 'Changes Requested', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-300' };
    case BatchStatus.REJECTED:
      return { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300' };
    default:
      return { label: status, bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };
  }
}

export function getRoleBadge(role: UserRole): { label: string; color: string } {
  switch (role) {
    case UserRole.TRAINING_CENTRE:
      return { label: 'Training Centre', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    case UserRole.DISTRICT_OFFICER:
      return { label: 'District Officer', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    case UserRole.QUALITY_TEAM:
      return { label: 'Quality Team', color: 'bg-purple-100 text-purple-800 border-purple-200' };
    case UserRole.STATE_OFFICE:
      return { label: 'State Directorate', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
}

export function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

export const SAMPLE_VALID_CSV = `full_name,phone_number,candidate_gov_id,assessment_score,completion_date
Rohan Kulkarni,+919876543210,GOV-HYD-9001,84.5,2026-11-15
Priya Sharma,+919876543211,GOV-HYD-9002,91.0,2026-11-15
Aarav Reddy,+919876543212,GOV-HYD-9003,79.5,2026-11-15
Deepa Nair,+919876543213,GOV-HYD-9004,88.0,2026-11-15
Suresh Verma,+919876543214,GOV-HYD-9005,95.5,2026-11-15`;

export const SAMPLE_INVALID_CSV = `full_name,phone_number,candidate_gov_id,assessment_score,completion_date
Rohan Kulkarni,+919876543210,GOV-HYD-9001,84.5,2026-11-15
Priya Sharma,12345,GOV-HYD-9002,91.0,2026-11-15
Aarav Reddy,+919876543212,GOV-HYD-9001,105.0,2026-11-15`;

export function downloadSampleCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
