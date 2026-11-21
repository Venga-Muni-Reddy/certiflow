import { Award, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">CertiFlow</h1>
            <p className="text-xs text-slate-500 font-medium">Pragati Skills Mission • Digital Certificate Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Phase 1 Initialized
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-8">
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
            <h2 className="text-2xl font-bold text-slate-800">Phase 1 Monorepo Workspace Ready</h2>
          </div>
          <p className="text-slate-600 mb-6">
            Scaffolding for <code>shared</code>, <code>backend</code>, <code>frontend</code>, and <code>whatsapp-mock</code> is configured with npm workspaces and domain types.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700 block">@certiflow/shared</span>
              <span className="text-xs text-slate-500">Domain models, enums & Zod validation schemas</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700 block">@certiflow/backend</span>
              <span className="text-xs text-slate-500">Express REST API + BullMQ workers</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700 block">@certiflow/whatsapp-mock</span>
              <span className="text-xs text-slate-500">Stand-in provider with chaos & inbox UI</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
