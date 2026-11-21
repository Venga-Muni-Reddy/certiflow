import React, { useState } from 'react';
import { Search, ShieldCheck, AlertOctagon, AlertCircle, Award, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { formatDate } from '../utils/formatters';

interface PublicVerificationData {
  certificateNumber: string;
  status: 'VALID' | 'ISSUED' | 'REVOKED';
  candidateMaskedName?: string;
  candidateNameMasked?: string;
  courseName: string;
  trainingCentreName: string;
  districtName: string;
  issuedAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export const VerifyPage: React.FC = () => {
  const [certNumber, setCertNumber] = useState('');
  const [result, setResult] = useState<PublicVerificationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerify = async (queryNumber?: string) => {
    const num = (queryNumber || certNumber).trim();
    if (!num) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setResult(null);
      setSearched(true);

      const res = await fetch(`/api/v1/public/verify/${encodeURIComponent(num)}`);
      const data = await res.json();

      if (res.status === 404) {
        setErrorMessage('No certificate found matching this identification number in the official registry.');
        return;
      }

      if (!res.ok) {
        setErrorMessage(data?.error?.message || 'Verification lookup failed.');
        return;
      }

      setResult(data.data || data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification network lookup failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const setAndSearch = (code: string) => {
    setCertNumber(code);
    handleVerify(code);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6">
      {/* Title & Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full text-xs font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>Zero-Login Public Credential Verification (Moment #4)</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Pragati Skills Mission Credential Registry
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
          Public verification portal for employers, institutions, and government departments to instantly verify the authenticity of skilling credentials.
        </p>
      </div>

      {/* Search Input Box */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerify();
          }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="Enter Certificate Number (e.g., PSM-2026-HYD-100001)"
              className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !certNumber.trim()}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Credential</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Shortcuts */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Quick Demo Lookups:</span>
          <button
            type="button"
            onClick={() => setAndSearch('PSM-2026-HYD-100001')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-mono font-medium transition-colors"
          >
            PSM-2026-HYD-100001 (Valid)
          </button>
          <button
            type="button"
            onClick={() => setAndSearch('PSM-2026-HYD-999999')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-mono font-medium transition-colors"
          >
            PSM-2026-HYD-999999 (Non-Existent)
          </button>
        </div>
      </div>

      {/* Verification Result Display */}
      {searched && (
        <div className="transition-all duration-300">
          {/* Case 1: Verified Active Certificate */}
          {result && (result.status === 'VALID' || result.status === 'ISSUED') && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-500 shadow-xl overflow-hidden">
              <div className="p-6 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500 text-white rounded-xl shadow">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-300">
                      Official Government Seal
                    </span>
                    <h2 className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                      AUTHENTIC CERTIFICATE VERIFIED
                    </h2>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <span className="font-mono text-sm font-bold text-emerald-800 dark:text-emerald-200">
                    {result.certificateNumber}
                  </span>
                  <span className="text-[11px] block text-emerald-700 dark:text-emerald-400">
                    Pragati Skills Mission
                  </span>
                </div>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider block">
                      Candidate Name (Masked for Privacy)
                    </span>
                    <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                      {result.candidateMaskedName || result.candidateNameMasked}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider block">
                      Course / Skill Trade
                    </span>
                    <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                      {result.courseName}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider block">
                      Accredited Training Centre
                    </span>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">
                      {result.trainingCentreName}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider block">
                      District Jurisdiction
                    </span>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">
                      {result.districtName}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider block">
                      Issuance Date
                    </span>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1">
                      {formatDate(result.issuedAt)}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider block">
                      Certificate Identifier
                    </span>
                    <div className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                      {result.certificateNumber}
                    </div>
                  </div>
                </div>

                {/* Privacy Guarantee Notice (PRD Enforced) */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      Strict Candidate Privacy Protection Enforced (Moment #4)
                    </span>
                    <p>
                      In adherence to government data privacy invariants, unmasked candidate names, phone numbers, Aadhaar/Government ID numbers, and direct PDF download links are strictly redacted from public verification.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Case 2: Revoked Certificate */}
          {result && result.status === 'REVOKED' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-rose-500 shadow-xl overflow-hidden">
              <div className="p-6 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-500 text-white rounded-xl shadow">
                    <AlertOctagon className="w-8 h-8" />
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-rose-800 dark:text-rose-300">
                      Security Alert &bull; State Revocation
                    </span>
                    <h2 className="text-2xl font-black text-rose-900 dark:text-rose-100">
                      CERTIFICATE HAS BEEN REVOKED
                    </h2>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <span className="font-mono text-sm font-bold text-rose-800 dark:text-rose-200">
                    {result.certificateNumber}
                  </span>
                </div>
              </div>

              <div className="p-6 sm:p-8 space-y-5">
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-bold text-sm">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                    <span>Official Revocation Statement</span>
                  </div>
                  <p className="text-xs text-rose-800 dark:text-rose-300">
                    This credential was formally annulled by the State Directorate of Pragati Skills Mission. It no longer holds any legal or accredited validity.
                  </p>
                  {result.revocationReason && (
                    <div className="mt-2 text-xs font-medium text-rose-900 dark:text-rose-100 bg-white/70 dark:bg-slate-900/70 p-3 rounded-lg border border-rose-200 dark:border-rose-800">
                      Reason: &ldquo;{result.revocationReason}&rdquo;
                    </div>
                  )}
                  {result.revokedAt && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 block pt-1">
                      Annulled on: {formatDate(result.revokedAt)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 uppercase font-semibold">Candidate</span>
                    <div className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                      {result.candidateMaskedName || result.candidateNameMasked}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase font-semibold">Course</span>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                      {result.courseName}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Case 3: Certificate Not Found */}
          {errorMessage && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/40 text-amber-500 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Certificate Not Found
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
