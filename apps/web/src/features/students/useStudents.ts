import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../api/client.js';
import {
  StudentListResponse,
  StudentListResponseSchema,
  StudentQuery,
} from '@student-readiness/shared';

export interface EnrichedStudentListResponse extends StudentListResponse {
  responseTenantId: string;
}

export function useStudents(filters: StudentQuery) {
  const { auth } = useAuth();
  const { tenantId } = auth;

  // Cache key MUST include tenantId from auth context (§8.3 Fix)
  const queryKey = ['students', tenantId, filters];

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<EnrichedStudentListResponse> => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.readiness) params.set('readiness', filters.readiness);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.cursor) params.set('cursor', filters.cursor);

      const qs = params.toString();
      const path = `/students${qs ? `?${qs}` : ''}`;

      // Pass AbortSignal for immediate network cancellation on tenant switch
      const response = await apiClient(StudentListResponseSchema, path, { signal });

      return {
        ...response.data,
        responseTenantId: tenantId,
      };
    },
    staleTime: 30000,
  });

  return {
    ...query,
    currentTenantId: tenantId,
  };
}
