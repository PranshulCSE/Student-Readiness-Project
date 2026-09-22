import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.js';
import { apiClient } from '../api/client.js';
import { DuplicateStatsItemSchema, DuplicateStatsItem } from '@student-readiness/shared';
import { z } from 'zod';
import { LoadingView, ErrorView } from '../components/StateViews.js';
import { BarChart3, AlertOctagon, CheckCircle2, ShieldAlert } from 'lucide-react';

const DuplicatesListSchema = z.array(DuplicateStatsItemSchema);

export function AdminEventsPage() {
  const { auth } = useAuth();

  const { data, isLoading, isError, error, refetch } = useQuery<DuplicateStatsItem[]>({
    queryKey: ['admin-duplicates', auth.tenantId],
    queryFn: async () => {
      const res = await apiClient(DuplicatesListSchema, '/admin/events/duplicates');
      return res.data;
    },
    enabled: auth.role === 'admin',
  });

  if (auth.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Restricted Access</h2>
        <p className="text-sm text-slate-500 mt-1">
          This audit and aggregation dashboard is restricted to administrator accounts.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingView message="Loading event aggregation & deduplication audit..." />;
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <ErrorView
          message={(error as Error)?.message || 'Failed to fetch event statistics'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900">MongoDB Event Store Health</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time MongoDB aggregation of operational events, outbox deduplication stats, and rejection rates per tenant.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="mt-3 sm:mt-0 px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition"
        >
          Refresh Audit Metrics
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Tenants Audited</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {data?.length || 0}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Duplicate Event Violations</span>
            <AlertOctagon className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-2 font-mono">
            {data?.reduce((acc, curr) => acc + curr.duplicateSuccessEvents, 0) || 0}
          </div>
          <span className="text-[11px] text-slate-400">Guarded by unique index on eventId</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Succeeded Events</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-indigo-600 mt-2 font-mono">
            {data?.reduce((acc, curr) => acc + curr.succeeded, 0) || 0}
          </div>
        </div>
      </div>

      {/* Aggregate Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3.5 text-left">Tenant ID</th>
              <th className="px-6 py-3.5 text-right">Duplicate Success</th>
              <th className="px-6 py-3.5 text-right">Succeeded</th>
              <th className="px-6 py-3.5 text-right">Rejected</th>
              <th className="px-6 py-3.5 text-right">Rejection Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
            {(!data || data.length === 0) ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-xs text-slate-400 italic">
                  No tenant events recorded in MongoDB yet.
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={item.tenantId} className="hover:bg-slate-50/80">
                  <td className="px-6 py-4 font-mono text-xs text-slate-800">
                    {item.tenantId}
                    {item.tenantId === auth.tenantId && (
                      <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-sans font-semibold">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs">
                    {item.duplicateSuccessEvents}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs text-emerald-600 font-semibold">
                    {item.succeeded}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs text-rose-600 font-semibold">
                    {item.rejected}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs font-bold">
                    {(item.rejectionRate * 100).toFixed(1)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
