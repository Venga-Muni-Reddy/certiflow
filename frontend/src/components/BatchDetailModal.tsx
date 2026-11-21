import React, { useState, useEffect } from 'react';
import { X, Users, History, FileText, Download, CheckCircle2, RotateCcw, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../api/client';
import { getStatusBadge, formatDate } from '../utils/formatters';

interface BatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string | null;
  onRefresh?: () => void;
}

export const BatchDetailModal: React.FC<BatchDetailModalProps> = ({
  isOpen,
  onClose,
  batchId
}) => {
  const [batch, setBatch] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'candidates' | 'approvals' | 'audit'>('candidates');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !batchId) return;

    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await apiRequest<{ success: boolean; data: any }>(`/batches/${batchId}`);
        setBatch(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load batch details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [isOpen, batchId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                {batch?.batchCode || 'Loading Batch...'}
              </h3>
              {batch && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getStatusBadge(batch.status).bg} ${getStatusBadge(batch.status).text} ${getStatusBadge(batch.status).border}`}>
                  {getStatusBadge(batch.status).label}
                </span>
              )}
              {batch?.slaBreached && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  SLA Breached
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {batch?.courseName} &bull; {batch?.trainingCentre?.name} &bull; Version v{batch?.submissionVersion || 1}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-100/50 dark:bg-slate-800/20 text-sm">
          <button
            onClick={() => setActiveTab('candidates')}
            className={`py-3 px-4 font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'candidates'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Candidates ({batch?.candidates?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`py-3 px-4 font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'approvals'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Approvals History ({batch?.approvals?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 px-4 font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Immutable Audit Trail ({batch?.auditLogs?.length || 0})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-3" />
              <span>Loading batch data...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 text-rose-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          {!isLoading && batch && (
            <>
              {/* Candidates Tab */}
              {activeTab === 'candidates' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-2.5 font-semibold">#</th>
                        <th className="p-2.5 font-semibold">Candidate Name</th>
                        <th className="p-2.5 font-semibold">Phone Number</th>
                        <th className="p-2.5 font-semibold">Government ID</th>
                        <th className="p-2.5 font-semibold">Score</th>
                        <th className="p-2.5 font-semibold">Certificate Number</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {batch.candidates?.map((c: any, idx: number) => (
                        <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-medium text-slate-900 dark:text-white">{c.fullName}</td>
                          <td className="p-2.5 font-mono">{c.phoneNumber}</td>
                          <td className="p-2.5 font-mono">{c.candidateGovId}</td>
                          <td className="p-2.5 font-semibold">{c.assessmentScore}%</td>
                          <td className="p-2.5">
                            {c.certificate ? (
                              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                                {c.certificate.certificateNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Not issued yet</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Approvals Tab */}
              {activeTab === 'approvals' && (
                <div className="space-y-4">
                  {batch.approvals?.length === 0 ? (
                    <p className="text-slate-500 text-xs italic">No approval decisions recorded yet.</p>
                  ) : (
                    batch.approvals?.map((app: any) => (
                      <div
                        key={app.id}
                        className={`p-4 rounded-xl border ${
                          app.isSuperseded
                            ? 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70'
                            : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {app.actor?.name || 'Officer'}
                            </span>
                            <span className="text-xs text-slate-400">
                              ({app.stage}) &bull; Submission v{app.submissionVersion}
                            </span>
                            {app.isSuperseded && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-300">
                                SUPERSEDED (Moment #6)
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-bold ${
                              app.decision === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : app.decision === 'CHANGES_REQUESTED'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {app.decision}
                          </span>
                        </div>
                        {app.comments && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                            &ldquo;{app.comments}&rdquo;
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 mt-2 block">
                          Recorded on {formatDate(app.decidedAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Immutable Audit Trail Tab */}
              {activeTab === 'audit' && (
                <div className="space-y-3">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-900 dark:text-indigo-200">
                    <span className="font-bold">Append-Only Immutability:</span> Enforced by PostgreSQL trigger <code className="bg-indigo-200/50 dark:bg-indigo-900/60 px-1 rounded">trg_audit_logs_immutable</code>.
                  </div>
                  <div className="space-y-2">
                    {batch.auditLogs?.map((log: any) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {log.action}
                            </span>
                            <span className="text-slate-400 font-mono text-[10px]">
                              Seq #{log.sequenceNumber}
                            </span>
                          </div>
                          {log.details && (
                            <pre className="text-[11px] text-slate-600 dark:text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">
                              {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
