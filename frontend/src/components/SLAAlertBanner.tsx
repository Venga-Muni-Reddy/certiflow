import React from 'react';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';

interface SLAAlertBannerProps {
  escalatedBatches: Array<{
    id: string;
    batchCode: string;
    courseName: string;
    trainingCentre?: { name: string };
    createdAt: string;
  }>;
  onSelectBatch: (batchId: string) => void;
}

export const SLAAlertBanner: React.FC<SLAAlertBannerProps> = ({
  escalatedBatches,
  onSelectBatch
}) => {
  if (escalatedBatches.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 text-amber-500 rounded-lg">
            <AlertTriangle className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                SLA Escalation Alert: {escalatedBatches.length} {escalatedBatches.length === 1 ? 'Batch' : 'Batches'} Exceeded Approval Window
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-500/30">
                CRITICAL MOMENT #5
              </span>
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Batches pending district review over 30s have been auto-escalated to State Directorate for intervention.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {escalatedBatches.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBatch(b.id)}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{b.batchCode}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
