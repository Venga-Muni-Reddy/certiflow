import React from 'react';
import { ShieldCheck, Radio, ExternalLink, UserCheck, Award, CheckCircle2 } from 'lucide-react';
import { DemoUser } from '../hooks/useAuth';
import { getRoleBadge } from '../utils/formatters';

interface HeaderProps {
  currentUser: DemoUser | null;
  demoUsers: DemoUser[];
  onSwitchUser: (userId: string) => void;
  sseConnected: boolean;
  activeTab: 'dashboard' | 'verify';
  onSelectTab: (tab: 'dashboard' | 'verify') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  demoUsers,
  onSwitchUser,
  sseConnected,
  activeTab,
  onSelectTab
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-md">
      {/* Top Bar: Brand, SSE Indicator & Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white shadow">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">CertiFlow</span>
                <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full font-medium">
                  Pragati Mission
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Auditable Skilling Credential Issuance & Public Verification
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Operations Dashboard
            </button>
            <button
              onClick={() => onSelectTab('verify')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'verify'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Public Verification
            </button>
            <a
              href="http://localhost:4001/inbox"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-md text-sm font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 hover:bg-emerald-900/40 transition-colors flex items-center gap-1.5"
              title="Open WhatsApp Mock Candidate Inbox"
            >
              <span>WhatsApp Mock</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* SSE Real-time Indicator */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                sseConnected
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-800/80 text-amber-300'
              }`}
              title={sseConnected ? 'Connected to live event stream' : 'Reconnecting to event stream...'}
            >
              <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <Radio className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{sseConnected ? 'SSE Live' : 'Reconnecting'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Persona Switcher Strip */}
      <div className="bg-slate-950 border-t border-slate-800/80 px-4 py-2 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold tracking-wide uppercase">
            <UserCheck className="w-4 h-4 text-indigo-400" />
            <span>Interactive Demo Personas:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {demoUsers.map((user) => {
              const isSelected = currentUser?.id === user.id;
              const roleMeta = getRoleBadge(user.role);
              const scopeLabel = user.trainingCentre?.name || user.district?.name || 'All Districts';

              return (
                <button
                  key={user.id}
                  onClick={() => onSwitchUser(user.id)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-400 font-semibold shadow-sm ring-2 ring-indigo-400/30'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={`${user.name} (${roleMeta.label} - ${scopeLabel})`}
                >
                  <span className="font-medium">{user.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded border ${
                      isSelected
                        ? 'bg-indigo-700/60 text-indigo-100 border-indigo-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {user.role === 'TRAINING_CENTRE'
                      ? 'TC'
                      : user.role === 'DISTRICT_OFFICER'
                      ? 'DO'
                      : user.role === 'QUALITY_TEAM'
                      ? 'Quality'
                      : 'State'}
                  </span>
                  {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
};
