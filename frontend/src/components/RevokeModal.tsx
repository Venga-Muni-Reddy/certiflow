import React, { useState } from 'react';
import { AlertOctagon, X, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../api/client';

interface RevokeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  certificate: {
    id: string;
    certificateNumber: string;
    candidateName: string;
  } | null;
}

export const RevokeModal: React.FC<RevokeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  certificate
}) => {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !certificate) return null;

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();

    if (reason.trim().length < 5) {
      setError('Please provide a descriptive reason for revocation (at least 5 characters).');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await apiRequest(`/certificates/${certificate.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke certificate.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full shadow-2xl border border-rose-200 dark:border-rose-900/50 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-rose-100 dark:border-rose-950/60 flex items-center justify-between bg-rose-50/50 dark:bg-rose-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 rounded-lg">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-rose-900 dark:text-rose-200">
                Revoke Certificate (Moment #4)
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-400 font-mono">
                {certificate.certificateNumber}
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
        <form onSubmit={handleRevoke} className="p-6 space-y-4">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs text-rose-800 dark:text-rose-300 space-y-1">
            <span className="font-semibold block flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              State Authority Action Warning:
            </span>
            <p>
              Revoking this credential will immediately mark it REVOKED in the database and flush the Redis public cache. Any QR scan or public lookup will instantly flag it as revoked.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Candidate Name
            </label>
            <input
              type="text"
              readOnly
              value={certificate.candidateName}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Mandatory Revocation Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Assessment malpractice confirmed during district audit..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
              className="px-5 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Revoking...</span>
                </>
              ) : (
                <span>Confirm Revocation</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
