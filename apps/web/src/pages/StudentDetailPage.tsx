import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.js';
import { useStudentDetail } from '../features/students/useStudentDetail.js';
import { useSubmitAttempt } from '../features/attempts/useSubmitAttempt.js';
import { apiClient } from '../api/client.js';
import {
  ReadinessBadge,
  LoadingView,
  ErrorView,
  ConflictDialog,
} from '../components/StateViews.js';
import {
  CompetencyKey,
  ActivityResponseSchema,
  ActivityResponse,
  PatchStudentSchema,
  StudentDetailSchema,
} from '@student-readiness/shared';
import {
  ArrowLeft,
  Calendar,
  Award,
  CheckCircle,
  Clock,
  PlusCircle,
  Edit2,
  AlertTriangle,
} from 'lucide-react';

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { auth } = useAuth();

  const { data: student, isLoading, isError, error, refetch, currentTenantId } = useStudentDetail(id);

  // Activity Feed Query
  const { data: activity } = useQuery<ActivityResponse>({
    queryKey: ['activity', auth.tenantId, id],
    queryFn: async () => {
      const res = await apiClient(ActivityResponseSchema, `/students/${id}/activity?limit=10`);
      return res.data;
    },
    enabled: Boolean(id),
  });

  // Attempt Submission Modal State
  const [isAttemptModalOpen, setIsAttemptModalOpen] = useState(false);
  const [selectedCompetency, setSelectedCompetency] = useState<CompetencyKey>('frontend');
  const [attemptScore, setAttemptScore] = useState<number>(85);
  const [attemptDate, setAttemptDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [submissionFeedback, setSubmissionFeedback] = useState<{ message: string; isReplay: boolean } | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'archived'>('active');

  // Conflict state
  const [conflictVersion, setConflictVersion] = useState<number | undefined>(undefined);
  const [isConflictOpen, setIsConflictOpen] = useState(false);

  const {
    mutate: submitAttempt,
    isPending: isSubmittingAttempt,
    idempotencyKey,
  } = useSubmitAttempt(id || '', student?.version);

  if (isLoading || currentTenantId !== auth.tenantId) {
    return <LoadingView message="Loading student profile & evaluations..." />;
  }

  if (isError || !student) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <ErrorView
          message={(error as Error)?.message || 'Student not found or access denied'}
          onRetry={() => refetch()}
        />
        <button
          onClick={() => navigate('/')}
          className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Students
        </button>
      </div>
    );
  }

  const handleOpenAttemptModal = (compKey?: CompetencyKey) => {
    if (compKey) setSelectedCompetency(compKey);
    setAttemptScore(85);
    setAttemptDate(new Date().toISOString().slice(0, 16));
    setSubmissionFeedback(null);
    setIsAttemptModalOpen(true);
  };

  const handleAttemptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionFeedback(null);

    submitAttempt(
      {
        competencyKey: selectedCompetency,
        score: Number(attemptScore),
        attemptedAt: new Date(attemptDate).toISOString(),
      },
      {
        onSuccess: (res) => {
          setSubmissionFeedback({
            message: res.isReplayed
              ? 'Attempt recorded previously (idempotent replay)'
              : 'Evaluation score recorded successfully!',
            isReplay: res.isReplayed,
          });
          setTimeout(() => {
            setIsAttemptModalOpen(false);
            setSubmissionFeedback(null);
          }, 1200);
        },
        onError: (err: any) => {
          if (err.code === 'CONFLICT_VERSION') {
            setConflictVersion(err.currentVersion);
            setIsConflictOpen(true);
          } else {
            alert(err.message || 'Failed to submit attempt');
          }
        },
      }
    );
  };

  const handleOpenEdit = () => {
    setEditName(student.fullName);
    setEditEmail(student.email);
    setEditStatus(student.status);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient(StudentDetailSchema, `/students/${student.id}`, {
        method: 'PATCH',
        headers: {
          'If-Match': String(student.version),
        },
        body: JSON.stringify(
          PatchStudentSchema.parse({
            fullName: editName,
            email: editEmail,
            status: editStatus,
          })
        ),
      });

      queryClient.invalidateQueries({ queryKey: ['student', auth.tenantId, student.id] });
      queryClient.invalidateQueries({ queryKey: ['students', auth.tenantId] });
      setIsEditModalOpen(false);
    } catch (err: any) {
      if (err.code === 'CONFLICT_VERSION') {
        setConflictVersion(err.currentVersion);
        setIsConflictOpen(true);
      } else {
        alert(err.message || 'Failed to update student');
      }
    }
  };

  const hasMissingCompetencies = student.competencies.some((c) => c.latestAttempt === null);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to All Students
      </button>

      {/* Student Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-900">{student.fullName}</h1>
              <ReadinessBadge readiness={student.readiness} />
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                v{student.version}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">{student.email}</p>
          </div>

          <div className="flex items-center space-x-3">
            {auth.role === 'admin' && (
              <button
                onClick={handleOpenEdit}
                className="inline-flex items-center px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition"
              >
                <Edit2 className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Edit Profile
              </button>
            )}

            {(auth.role === 'evaluator' || auth.role === 'admin') && (
              <button
                onClick={() => handleOpenAttemptModal()}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 rounded-lg text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm transition"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" />
                Record Evaluation
              </button>
            )}
          </div>
        </div>

        {/* Readiness Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Weighted Readiness Score</span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {student.overallScore != null ? `${student.overallScore.toFixed(2)}%` : 'Incomplete'}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Completed Competencies</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {student.competencies.filter((c) => c.latestAttempt !== null).length} / {student.competencies.length}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Account Status</span>
            <div className="text-sm font-semibold text-slate-800 capitalize mt-2 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
              {student.status}
            </div>
          </div>
        </div>

        {/* Incomplete Warning Banner */}
        {hasMissingCompetencies && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <span className="font-bold">Evaluation Incomplete:</span> All 4 core competencies (Frontend, Backend, Databases, Problem Solving) must have at least one valid evaluation attempt before an overall readiness score can be awarded.
            </div>
          </div>
        )}
      </div>

      {/* Competencies Breakdown Grid */}
      <h2 className="text-lg font-bold text-slate-900 mb-4">Competency Assessments</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {student.competencies.map((comp) => {
          const attempt = comp.latestAttempt;
          return (
            <div
              key={comp.key}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Award className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-slate-900 text-base">{comp.label}</h3>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                    Weight: {(comp.weight * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="mt-4">
                  {attempt ? (
                    <div>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-3xl font-bold font-mono text-slate-900">
                          {attempt.score.toFixed(1)}
                        </span>
                        <span className="text-xs text-slate-400">/ 100</span>
                      </div>
                      <div className="mt-2 flex items-center text-xs text-slate-500 space-x-4">
                        <span className="flex items-center">
                          <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          {new Date(attempt.attemptedAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center">
                          <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                          Non-voided
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 text-slate-400 text-xs italic">
                      No evaluation attempts recorded yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                {(auth.role === 'evaluator' || auth.role === 'admin') && (
                  <button
                    onClick={() => handleOpenAttemptModal(comp.key)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    + Record Attempt
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity Log (Operational Events) */}
      <h2 className="text-lg font-bold text-slate-900 mb-4">Audit & Activity Log</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        {!activity || activity.data.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-4 text-center">
            No audit events recorded for this student yet.
          </div>
        ) : (
          <div className="space-y-4">
            {activity.data.map((item) => (
              <div
                key={item.eventId}
                className="flex items-start justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    {item.type}
                    {item.metadata.competencyKey && (
                      <span className="ml-2 font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {item.metadata.competencyKey}
                      </span>
                    )}
                  </div>
                  {item.metadata.score != null && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Score: {item.metadata.score} pts
                    </div>
                  )}
                </div>
                <div className="flex items-center text-xs text-slate-400">
                  <Clock className="w-3 h-3 mr-1" />
                  {new Date(item.occurredAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attempt Submission Modal */}
      {isAttemptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Record Assessment Score</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter competency evaluation score. Mutation is protected by Idempotency-Key.
            </p>

            {submissionFeedback && (
              <div
                className={`mb-4 p-3 rounded-lg text-xs font-medium ${
                  submissionFeedback.isReplay
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                {submissionFeedback.message}
              </div>
            )}

            <form onSubmit={handleAttemptSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Competency
                </label>
                <select
                  value={selectedCompetency}
                  onChange={(e) => setSelectedCompetency(e.target.value as CompetencyKey)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  {student.competencies.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label} ({(c.weight * 100).toFixed(0)}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Score (0 - 100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  required
                  value={attemptScore}
                  onChange={(e) => setAttemptScore(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Attempt Timestamp
                </label>
                <input
                  type="datetime-local"
                  required
                  value={attemptDate}
                  onChange={(e) => setAttemptDate(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 text-[10px] text-slate-400 font-mono">
                Idempotency-Key: {idempotencyKey.slice(0, 8)}...
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAttemptModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAttempt}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmittingAttempt ? 'Recording...' : 'Submit Evaluation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal (PATCH) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Edit Student Profile</h3>
            <p className="text-xs text-slate-500 mb-4">
              Protected with optimistic concurrency (If-Match: v{student.version}).
            </p>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 409 Conflict Dialog */}
      <ConflictDialog
        isOpen={isConflictOpen}
        currentVersion={conflictVersion}
        onReload={() => {
          setIsConflictOpen(false);
          refetch();
        }}
        onCancel={() => setIsConflictOpen(false)}
      />
    </div>
  );
}
