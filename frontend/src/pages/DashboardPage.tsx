import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  AlertTriangle,
  Award,
  Send,
  Eye,
  ShieldCheck,
  AlertOctagon,
  Download,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { BatchStatus, UserRole } from '@certiflow/shared';
import { DemoUser } from '../hooks/useAuth';
import { apiRequest } from '../api/client';
import { getStatusBadge, formatDate } from '../utils/formatters';
import { UploadModal } from '../components/UploadModal';
import { DecisionModal } from '../components/DecisionModal';
import { BatchDetailModal } from '../components/BatchDetailModal';
import { RevokeModal } from '../components/RevokeModal';

interface DashboardPageProps {
  currentUser: DemoUser | null;
  onSelectEscalatedBatch?: (batchId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ currentUser }) => {
  const [batches, setBatches] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [inspectBatchId, setInspectBatchId] = useState<string | null>(null);
  const [decisionBatch, setDecisionBatch] = useState<any | null>(null);
  const [revokeCert, setRevokeCert] = useState<any | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setIsLoading(true);
      const batchRes = await apiRequest<any>('/batches');
      const batchList = batchRes.batches || batchRes.data || (Array.isArray(batchRes) ? batchRes : []);
      setBatches(batchList);

      // If State Office, also load certificates for revocation oversight
      if (currentUser.role === UserRole.STATE_OFFICE) {
        const certRes = await apiRequest<any>('/certificates').catch(() => ({ certificates: [] }));
        const certList = certRes.certificates || certRes.data || (Array.isArray(certRes) ? certRes : []);
        setCertificates(certList);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle batch submit (TC submitting DRAFT or CHANGES_REQUESTED batch)
  const handleSubmitBatch = async (batchId: string) => {
    try {
      await apiRequest(`/batches/${batchId}/submit`, { method: 'POST' });
      await fetchDashboardData();
    } catch (err: any) {
      alert(`Submission failed: ${err.message}`);
    }
  };

  // Filter batches
  const filteredBatches = batches.filter((b) => {
    if (filterStatus !== 'ALL' && b.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const codeMatch = b.batchCode.toLowerCase().includes(q);
      const courseMatch = b.courseName.toLowerCase().includes(q);
      return codeMatch || courseMatch;
    }
    return true;
  });

  // Calculate metrics
  const totalBatches = batches.length;
  const pendingApprovals = batches.filter((b) =>
    [BatchStatus.PENDING_DISTRICT, BatchStatus.PENDING_QUALITY, BatchStatus.PENDING_STATE].includes(b.status)
  ).length;
  const issuedBatches = batches.filter((b) => b.status === BatchStatus.ISSUED).length;
  const slaBreachedCount = batches.filter((b) => b.slaBreached).length;

  return (
    <div className="space-y-6">
      {/* Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Batches</span>
            <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{totalBatches}</p>
          <span className="text-[11px] text-slate-400">Ingested in Pragati Mission</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Under Review</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">{pendingApprovals}</p>
          <span className="text-[11px] text-slate-400">District / Quality / State</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Issued Batches</span>
            <Award className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{issuedBatches}</p>
          <span className="text-[11px] text-slate-400">Delivered via WhatsApp</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SLA Breaches</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">{slaBreachedCount}</p>
          <span className="text-[11px] text-slate-400">&gt;30s Inactivity Window</span>
        </div>
      </div>

      {/* Main Batch Management Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Action Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Candidate Batches Registry
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage candidate batches, track multi-officer consensus, and oversee certificate generation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {currentUser?.role === UserRole.TRAINING_CENTRE && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Ingest Spreadsheet (Moment #1)</span>
              </button>
            )}

            <button
              onClick={() => fetchDashboardData()}
              disabled={isLoading}
              className="p-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters Strip */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value={BatchStatus.DRAFT}>Draft</option>
              <option value={BatchStatus.PENDING_DISTRICT}>Pending District</option>
              <option value={BatchStatus.PENDING_QUALITY}>Pending Quality (&gt;50)</option>
              <option value={BatchStatus.PENDING_STATE}>Pending State</option>
              <option value={BatchStatus.ISSUED}>Issued</option>
              <option value={BatchStatus.CHANGES_REQUESTED}>Changes Requested</option>
            </select>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search batch code or course..."
              className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </div>
        </div>

        {/* Batch Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
              <tr>
                <th className="p-3.5">Batch Code</th>
                <th className="p-3.5">Course / Training Centre</th>
                <th className="p-3.5 text-center">Candidates</th>
                <th className="p-3.5 text-center">Version</th>
                <th className="p-3.5">Workflow / Quorum</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    {isLoading ? 'Loading batches...' : 'No batches match the selected criteria.'}
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const badge = getStatusBadge(batch.status);
                  const quorumCount = batch.districtApprovalsCount ?? batch.approvals?.length ?? 0;
                  const userHasApproved = (batch.approvals || []).some(
                    (a: any) => a.actorId === currentUser?.id && (a.submissionVersion === undefined || a.submissionVersion === batch.submissionVersion)
                  );

                  // Role check for reviewing
                  const canDecide =
                    (currentUser?.role === UserRole.DISTRICT_OFFICER && batch.status === BatchStatus.PENDING_DISTRICT && !userHasApproved) ||
                    (currentUser?.role === UserRole.QUALITY_TEAM && batch.status === BatchStatus.PENDING_QUALITY && !userHasApproved) ||
                    (currentUser?.role === UserRole.STATE_OFFICE && batch.status === BatchStatus.PENDING_STATE && !userHasApproved);

                  const canSubmit =
                    currentUser?.role === UserRole.TRAINING_CENTRE &&
                    (batch.status === BatchStatus.DRAFT || batch.status === BatchStatus.CHANGES_REQUESTED);

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{batch.batchCode}</span>
                          {batch.slaBreached && (
                            <span className="p-1 bg-rose-100 text-rose-700 rounded-full" title="SLA Breached (>30s)">
                              <AlertTriangle className="w-3 h-3 animate-pulse" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{batch.courseName}</div>
                        <div className="text-[11px] text-slate-400">{batch.trainingCentre?.name || 'Hyderabad Centre'}</div>
                      </td>
                      <td className="p-3.5 text-center font-bold text-slate-900 dark:text-white">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono">
                          {batch.candidateCount}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-bold rounded text-[11px]">
                          v{batch.submissionVersion}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {batch.status === BatchStatus.PENDING_DISTRICT ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-semibold ${quorumCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-700 dark:text-amber-400'}`}>
                              Quorum: {quorumCount}/2
                            </span>
                            <span className="text-[10px] text-slate-400">(Moment #2)</span>
                          </div>
                        ) : batch.status === BatchStatus.PENDING_QUALITY ? (
                          <span className="text-purple-700 dark:text-purple-400 font-medium">Quality Review (&gt;50)</span>
                        ) : batch.status === BatchStatus.PENDING_STATE ? (
                          <span className="text-blue-700 dark:text-blue-400 font-medium">State Final Sign-Off</span>
                        ) : batch.status === BatchStatus.ISSUED ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Delivered via WhatsApp
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canSubmit && (
                            <button
                              onClick={() => handleSubmitBatch(batch.id)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-xs flex items-center gap-1 transition-colors"
                              title="Submit batch for District Review"
                            >
                              <Send className="w-3 h-3" />
                              <span>Submit</span>
                            </button>
                          )}

                          {canDecide && (
                            <button
                              onClick={() => setDecisionBatch(batch)}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-xs flex items-center gap-1 transition-colors"
                              title="Review and submit approval decision"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>Decide</span>
                            </button>
                          )}

                          {userHasApproved && batch.status === BatchStatus.PENDING_DISTRICT && (
                            <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded text-[11px] font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              <span>You Approved (1/2)</span>
                            </span>
                          )}

                          <button
                            onClick={() => setInspectBatchId(batch.id)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded transition-colors"
                            title="Inspect Batch Details, Approvals & Audit Trail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* State Directorate Issued Certificates Registry (Moment #4 Instant Revocation) */}
      {currentUser?.role === UserRole.STATE_OFFICE && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  State Issued Certificates Registry
                </h3>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-200">
                  Moment #4 Authority Oversight
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official state registry with direct revocation powers. Instant cache invalidation on revocation.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-3.5">Certificate Number</th>
                  <th className="p-3.5">Candidate Name</th>
                  <th className="p-3.5">Batch</th>
                  <th className="p-3.5">Issue Date</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {certificates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                      No issued certificates recorded yet. Approve a batch to trigger automated issuance.
                    </td>
                  </tr>
                ) : (
                  certificates.map((cert) => (
                    <tr key={cert.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {cert.certificateNumber}
                      </td>
                      <td className="p-3.5 font-medium text-slate-900 dark:text-white">
                        {cert.candidate?.fullName || 'Candidate'}
                      </td>
                      <td className="p-3.5 font-mono text-slate-500">{cert.batch?.batchCode || '—'}</td>
                      <td className="p-3.5 text-slate-500">{formatDate(cert.issuedAt)}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            cert.status === 'ISSUED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {cert.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        {cert.status === 'ISSUED' && (
                          <button
                            onClick={() =>
                              setRevokeCert({
                                id: cert.id,
                                certificateNumber: cert.certificateNumber,
                                candidateName: cert.candidate?.fullName || 'Candidate'
                              })
                            }
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium flex items-center gap-1 ml-auto transition-colors"
                          >
                            <AlertOctagon className="w-3.5 h-3.5" />
                            <span>Revoke</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={fetchDashboardData}
        trainingCentreId={currentUser?.trainingCentreId}
      />

      {/* Decision Modal */}
      <DecisionModal
        isOpen={!!decisionBatch}
        onClose={() => setDecisionBatch(null)}
        onSuccess={fetchDashboardData}
        batch={decisionBatch}
        userRole={currentUser?.role || ''}
      />

      {/* Batch Detail Inspector Modal */}
      <BatchDetailModal
        isOpen={!!inspectBatchId}
        onClose={() => setInspectBatchId(null)}
        batchId={inspectBatchId}
        onRefresh={fetchDashboardData}
      />

      {/* Revocation Modal */}
      <RevokeModal
        isOpen={!!revokeCert}
        onClose={() => setRevokeCert(null)}
        onSuccess={fetchDashboardData}
        certificate={revokeCert}
      />
    </div>
  );
};
