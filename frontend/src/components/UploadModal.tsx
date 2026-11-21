import React, { useState } from 'react';
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle2, Download, AlertTriangle } from 'lucide-react';
import { apiRequest, ApiError } from '../api/client';
import { SAMPLE_VALID_CSV, SAMPLE_INVALID_CSV, downloadSampleCsv } from '../utils/formatters';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  trainingCentreId?: string | null;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  trainingCentreId
}) => {
  const [courseName, setCourseName] = useState('Full Stack Web Development');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<any[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorDetails(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage('Please select a spreadsheet file (.csv or .xlsx)');
      return;
    }

    try {
      setIsLoading(true);
      setErrorDetails(null);
      setErrorMessage(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('courseName', courseName);
      if (trainingCentreId) {
        formData.append('trainingCentreId', trainingCentreId);
      }

      const res = await apiRequest<{
        success: boolean;
        data: {
          batch: any;
          candidateCount: number;
        };
      }>('/batches/ingest', {
        method: 'POST',
        body: formData
      });

      setSuccessMessage(`Successfully ingested ${res.data.candidateCount} candidates into ${res.data.batch.batchCode}!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 422) {
        setErrorMessage(err.message);
        setErrorDetails(err.details || []);
      } else {
        setErrorMessage(err.message || 'An unexpected error occurred during ingestion.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Ingest Candidate Batch (Moment #1)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Atomic 2-pass ingestion. Any malformed row will abort the entire batch.
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Sample CSV Download Shortcuts */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Quick Test Templates:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadSampleCsv(SAMPLE_VALID_CSV, 'valid_candidates_sample.csv')}
                className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded font-medium flex items-center gap-1 hover:bg-emerald-100"
              >
                <Download className="w-3 h-3" />
                Valid CSV (Pass)
              </button>
              <button
                type="button"
                onClick={() => downloadSampleCsv(SAMPLE_INVALID_CSV, 'invalid_candidates_sample.csv')}
                className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded font-medium flex items-center gap-1 hover:bg-rose-100"
              >
                <Download className="w-3 h-3" />
                Invalid CSV (Fail HTTP 422)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Course / Trade Name
            </label>
            <input
              type="text"
              required
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="e.g. Data Analytics Specialist"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Candidate Spreadsheet (.csv, .xlsx)
            </label>
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
              <input
                type="file"
                id="batch-file-upload"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="batch-file-upload" className="cursor-pointer flex flex-col items-center">
                <FileSpreadsheet className="w-10 h-10 text-indigo-500 mb-2" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {file ? file.name : 'Click to select or drag candidate list here'}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  Required columns: full_name, phone_number, candidate_gov_id, assessment_score, completion_date
                </span>
              </label>
            </div>
          </div>

          {/* Atomic Ingestion Error Report (Moment #1) */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-semibold text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>Ingestion Rejected: 0 Candidates Saved (Atomic Rollback)</span>
              </div>
              <p className="text-xs text-rose-700 dark:text-rose-400">
                {errorMessage}
              </p>

              {errorDetails && errorDetails.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900 text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-rose-100/50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 sticky top-0">
                      <tr>
                        <th className="p-2 border-b border-rose-200 dark:border-rose-900 font-medium">Row</th>
                        <th className="p-2 border-b border-rose-200 dark:border-rose-900 font-medium">Field</th>
                        <th className="p-2 border-b border-rose-200 dark:border-rose-900 font-medium">Error Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100 dark:divide-rose-950/40 text-slate-700 dark:text-slate-300">
                      {errorDetails.map((err, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/50 dark:hover:bg-rose-950/20">
                          <td className="p-2 font-mono text-rose-600 dark:text-rose-400 font-bold">
                            Line {err.row}
                          </td>
                          <td className="p-2 font-mono">{err.field}</td>
                          <td className="p-2">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Success banner */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Footer actions */}
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
              disabled={isLoading || !file}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Validating Atomically...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Ingest Batch</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
