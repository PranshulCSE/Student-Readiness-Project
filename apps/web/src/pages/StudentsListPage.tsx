import React, { useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { useStudents } from '../features/students/useStudents.js';
import {
  StudentQuery,
  StudentSort,
  StudentFilterStatus,
  Readiness,
} from '@student-readiness/shared';
import {
  ReadinessBadge,
  LoadingView,
  EmptyView,
  ErrorView,
} from '../components/StateViews.js';
import { Search, ChevronRight, Filter } from 'lucide-react';

export function StudentsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  // Parse filters from URL
  const filters: StudentQuery = useMemo(() => {
    return {
      q: searchParams.get('q') || '',
      status: (searchParams.get('status') as StudentFilterStatus) || 'active',
      readiness: (searchParams.get('readiness') as Readiness) || undefined,
      sort: (searchParams.get('sort') as StudentSort) || 'name_asc',
      cursor: searchParams.get('cursor') || undefined,
      limit: 20,
    };
  }, [searchParams]);

  const updateParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (value && value.trim().length > 0 && value !== 'all') {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    // Always reset pagination cursor when filter changes
    if (key !== 'cursor') {
      next.delete('cursor');
    }
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading, isError, error, refetch, currentTenantId, isFetching } = useStudents(filters);

  // Render Guard (§8.3 & §10): Drop data if response belongs to a previous tenant
  const isDataFromDifferentTenant = Boolean(
    data && data.responseTenantId && data.responseTenantId !== auth.tenantId
  );
  const shouldShowLoading = isLoading || isDataFromDifferentTenant;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Heading */}
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Readiness Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitoring competency evaluation and readiness certification for <span className="font-semibold text-slate-800">{auth.tenantName}</span>.
          </p>
        </div>
        {isFetching && !isLoading && (
          <div className="mt-2 sm:mt-0 flex items-center text-xs text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 animate-pulse">
            Refreshing...
          </div>
        )}
      </div>

      {/* Filter Toolbar (URL Persisted) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search student or email..."
              value={filters.q || ''}
              onChange={(e) => updateParam('q', e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <select
              value={filters.status || 'active'}
              onChange={(e) => updateParam('status', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="active">Active Only</option>
              <option value="archived">Archived Only</option>
              <option value="all">All Statuses</option>
            </select>
          </div>

          {/* Readiness Level Filter */}
          <div>
            <select
              value={filters.readiness || ''}
              onChange={(e) => updateParam('readiness', e.target.value || undefined)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Readiness Levels</option>
              <option value="READY">Ready (&ge; 80%)</option>
              <option value="NEARLY_READY">Nearly Ready (65-79.9%)</option>
              <option value="DEVELOPING">Developing (50-64.9%)</option>
              <option value="NEEDS_PREPARATION">Needs Preparation (&lt; 50%)</option>
              <option value="INCOMPLETE">Incomplete (Missing Competencies)</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <select
              value={filters.sort || 'name_asc'}
              onChange={(e) => updateParam('sort', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="name_asc">Sort: Name (A-Z)</option>
              <option value="name_desc">Sort: Name (Z-A)</option>
              <option value="score_desc">Sort: Highest Score</option>
              <option value="score_asc">Sort: Lowest Score</option>
              <option value="updated_desc">Sort: Recently Updated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {shouldShowLoading ? (
        <LoadingView message="Loading student evaluations..." />
      ) : isError ? (
        <ErrorView
          message={(error as Error)?.message || 'Failed to load students.'}
          onRetry={() => refetch()}
        />
      ) : !data || data.data.length === 0 ? (
        <EmptyView />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5 text-left">Student</th>
                  <th className="px-6 py-3.5 text-left">Status</th>
                  <th className="px-6 py-3.5 text-left">Readiness Status</th>
                  <th className="px-6 py-3.5 text-left">Weighted Score</th>
                  <th className="px-6 py-3.5 text-left">Version</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
                {data.data.map((student) => (
                  <tr
                    key={student.id}
                    onClick={() => navigate(`/students/${student.id}`)}
                    className="hover:bg-slate-50/80 cursor-pointer transition"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{student.fullName}</div>
                      <div className="text-xs text-slate-500">{student.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          student.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ReadinessBadge readiness={student.readiness} />
                    </td>
                    <td className="px-6 py-4 font-mono font-medium">
                      {student.overallScore != null ? `${student.overallScore.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">v{student.version}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/students/${student.id}`);
                        }}
                        className="text-indigo-600 hover:text-indigo-900 font-medium inline-flex items-center text-xs"
                      >
                        View Details
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {data.data.length} records
            </div>
            {data.page.hasMore && data.page.nextCursor && (
              <button
                onClick={() => updateParam('cursor', data.page.nextCursor!)}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium border border-indigo-200"
              >
                Load Next Page
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
