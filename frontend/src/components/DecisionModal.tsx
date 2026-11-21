import React, { useState } from 'react';
import { CheckCircle2, RotateCcw, XCircle, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ApprovalDecision } from '@certiflow/shared';
import { apiRequest } from '../api/client';

interface DecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  batch: {
    id: string;
    batchCode: string;
    courseName: string;
    candidateCount: number;
    submissionVersion: number;
    status: string;
    approvals?: any[];
  } | null;
  userRole: string;
}

export const DecisionModal: React.FC<DecisionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  batch,
  userRole
}) => {
  const [decision, setDecision] = useState<ApprovalDecision>(ApprovalDecision.APPROVE);
  const [comments, setComments] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Comments mandatory for SEND_BACK and REJECT
    if ((decision === ApprovalDecision.SEND_BACK || decision === ApprovalDecision.REJECT) && comments.trim().length < 5) {
      setError('Comments must be at least 5 characters explaining the reason.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await apiRequest(`/batches/${batch.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          comments: comments.trim() || undefined
        })
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit decision.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Review & Approval Decision
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Batch {batch.batchCode} &bull; {batch.courseName} &bull; v{batch.submissionVersion}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Batch Summary Info */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="text-slate-400 block">Candidates</span>
              <span className="text-slate-900 dark:text-white font-bold text-sm">{batch.candidateCount}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Version</span>
              <span className="text-slate-900 dark:text-white font-bold text-sm">v{batch.submissionVersion}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Current Status</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{batch.status}</span>
            </div>
          </div>

          {/* Decision Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Select Decision
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setDecision(ApprovalDecision.APPROVE)}
                className={`p-3 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                  decision === ApprovalDecision.APPROVE
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-400/30'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>Approve</span>
              </button>

              <button
                type="button"
                onClick={() => setDecision(ApprovalDecision.SEND_BACK)}
                className={`p-3 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                  decision === ApprovalDecision.SEND_BACK
                    ? 'bg-orange-50 dark:bg-orange-950/60 border-orange-500 text-orange-800 dark:text-orange-200 ring-2 ring-orange-400/30'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <RotateCcw className="w-5 h-5 text-orange-500" />
                <span>Send Back (v{batch.submissionVersion} &rarr; v{batch.submissionVersion + 1})</span>
              </button>

              <button
                type="button"
                onClick={() => setDecision(ApprovalDecision.REJECT)}
                className={`p-3 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                  decision === ApprovalDecision.REJECT
                    ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200 ring-2 ring-rose-400/30'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <XCircle className="w-5 h-5 text-rose-500" />
                <span>Reject</span>
              </button>
            </div>
          </div>

          {/* Informational Alerts */}
          {decision === ApprovalDecision.APPROVE && userRole === 'DISTRICT_OFFICER' && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-lg text-xs text-indigo-900 dark:text-indigo-200">
              <span className="font-semibold">Moment #2 Concurrency Guard:</span> Requires 2 distinct district officer approvals. If you are the first, status remains PENDING_DISTRICT. If second, it routes forward automatically.
            </div>
          )}

          {decision === ApprovalDecision.SEND_BACK && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-lg text-xs text-orange-900 dark:text-orange-200">
              <span className="font-semibold">Moment #6 Resubmission Invariant:</span> Sending back will mark all current approvals as <code className="bg-orange-200/50 dark:bg-orange-900/60 px-1 rounded">SUPERSEDED</code>, bump the submission version to v{batch.submissionVersion + 1}, and return the batch to the Training Centre for revision.
            </div>
          )}

          {/* Comments Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Review Comments / Justification {(decision !== ApprovalDecision.APPROVE) && <span className="text-rose-500">*</span>}
            </label>
            <textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={decision === ApprovalDecision.APPROVE ? 'Optional approval remarks...' : 'Reason for requesting changes or rejection (minimum 5 characters)...'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting Decision...</span>
                </>
              ) : (
                <span>Confirm Decision</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
