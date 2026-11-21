import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSSE, SSEEventData } from './hooks/useSSE';
import { Header } from './components/Header';
import { SLAAlertBanner } from './components/SLAAlertBanner';
import { DashboardPage } from './pages/DashboardPage';
import { VerifyPage } from './pages/VerifyPage';
import { apiRequest } from './api/client';
import { Bell, CheckCircle2, Shield, AlertTriangle } from 'lucide-react';

export default function App() {
  const { currentUser, demoUsers, switchUser, token, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'verify'>('dashboard');
  const [escalatedBatches, setEscalatedBatches] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Poll or fetch escalated batches
  const checkEscalatedBatches = useCallback(async () => {
    try {
      const res = await apiRequest<{ success: boolean; data: any[] }>('/batches');
      const breached = (res.data || []).filter((b) => b.slaBreached);
      setEscalatedBatches(breached);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkEscalatedBatches();
    const interval = setInterval(checkEscalatedBatches, 10000);
    return () => clearInterval(interval);
  }, [checkEscalatedBatches]);

  // Handle live Server-Sent Events (SSE)
  const handleSSEEvent = useCallback((event: SSEEventData) => {
    if (event.type === 'BATCH_ESCALATED') {
      setToastMessage(`SLA Escalation: Batch ${event.payload?.batchCode} exceeded approval window!`);
      checkEscalatedBatches();
    } else if (event.type === 'BATCH_UPDATED') {
      setToastMessage(`Update: Batch ${event.payload?.batchCode} status is now ${event.payload?.status}`);
      checkEscalatedBatches();
    } else if (event.type === 'CERTIFICATE_DELIVERED') {
      setToastMessage(`Certificate ${event.payload?.certificateNumber} delivered to candidate via WhatsApp!`);
    } else if (event.type === 'CERTIFICATE_REVOKED') {
      setToastMessage(`Alert: Certificate ${event.payload?.certificateNumber} was REVOKED by State Directorate.`);
    }

    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  }, [checkEscalatedBatches]);

  const { connected: sseConnected } = useSSE(token, handleSSEEvent);

  if (authLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Initializing CertiFlow Mission Environment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Toast Notification for Real-Time SSE Updates */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white border border-indigo-500/50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in max-w-md">
          <Bell className="w-5 h-5 text-indigo-400 flex-shrink-0 animate-bounce" />
          <span className="text-xs font-medium leading-relaxed">{toastMessage}</span>
        </div>
      )}

      {/* Main Header with Persona Switcher & Navigation */}
      <Header
        currentUser={currentUser}
        demoUsers={demoUsers}
        onSwitchUser={switchUser}
        sseConnected={sseConnected}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* High-Visibility SLA Escalation Alert Banner (Moment #5) */}
      <SLAAlertBanner
        escalatedBatches={escalatedBatches}
        onSelectBatch={() => setActiveTab('dashboard')}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' ? (
          <DashboardPage currentUser={currentUser} />
        ) : (
          <VerifyPage />
        )}
      </main>

      {/* Sub-Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">CertiFlow Pragati Skills Mission</span>
            <span>&bull;</span>
            <span>6 Critical Moments Enforced</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              #1 Atomic Ingestion
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              #2 Multi-Officer Quorum
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              #3 Idempotent Delivery
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              #4 Instant Revocation
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              #5 Automated SLA Escalation
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              #6 Resubmission Versioning
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
