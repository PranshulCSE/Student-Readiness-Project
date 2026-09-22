import React from 'react';
import { Readiness } from '@student-readiness/shared';
import { AlertTriangle, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export function ReadinessBadge({
  readiness,
  score,
}: {
  readiness: Readiness;
  score?: number | null;
}) {
  const configs: Record<Readiness, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    READY: {
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      text: 'text-emerald-700',
      label: 'Ready',
      icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />,
    },
    NEARLY_READY: {
      bg: 'bg-sky-100 text-sky-800 border-sky-200',
      text: 'text-sky-700',
      label: 'Nearly Ready',
      icon: <Clock className="w-3.5 h-3.5 mr-1 text-sky-600" />,
    },
    DEVELOPING: {
      bg: 'bg-amber-100 text-amber-800 border-amber-200',
      text: 'text-amber-700',
      label: 'Developing',
      icon: <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />,
    },
    NEEDS_PREPARATION: {
      bg: 'bg-rose-100 text-rose-800 border-rose-200',
      text: 'text-rose-700',
      label: 'Needs Preparation',
      icon: <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />,
    },
    INCOMPLETE: {
      bg: 'bg-slate-100 text-slate-700 border-slate-300',
      text: 'text-slate-600',
      label: 'Incomplete',
      icon: <AlertTriangle className="w-3.5 h-3.5 mr-1 text-slate-500" />,
    },
  };

  const c = configs[readiness] || configs.INCOMPLETE;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg}`}>
      {c.icon}
      {c.label}
      {score != null ? ` (${score.toFixed(1)}%)` : ''}
    </span>
  );
}

export function LoadingView({ message = 'Loading student readiness records...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function EmptyView({
  title = 'No students found',
  description = 'Try adjusting your filters or search terms.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <AlertCircle className="w-12 h-12 text-slate-300 mb-3" />
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-sm text-center">{description}</p>
    </div>
  );
}

export function ErrorView({
  message = 'An unexpected error occurred.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 my-4">
      <div className="flex items-start">
        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-800">Operation Failed</h3>
          <p className="text-sm text-red-700 mt-1">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center px-3 py-1.5 border border-red-300 rounded text-xs font-medium text-red-800 bg-white hover:bg-red-50 focus:outline-none"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConflictDialog({
  isOpen,
  currentVersion,
  onReload,
  onCancel,
}: {
  isOpen: boolean;
  currentVersion?: number;
  onReload: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center text-amber-600 mb-3">
          <AlertTriangle className="w-6 h-6 mr-2" />
          <h3 className="text-lg font-bold text-slate-900">Conflict Detected</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Someone else has updated this student record in the meantime
          {currentVersion ? ` (current version is ${currentVersion})` : ''}.
          To prevent overwriting changes, please reload the latest data.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onReload}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Reload Latest Data
          </button>
        </div>
      </div>
    </div>
  );
}
