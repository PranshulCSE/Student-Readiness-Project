import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../api/client.js';
import { StudentDetail, StudentDetailSchema } from '@student-readiness/shared';

export function useStudentDetail(studentId: string | undefined) {
  const { auth } = useAuth();
  const { tenantId } = auth;

  const query = useQuery({
    queryKey: ['student', tenantId, studentId],
    queryFn: async ({ signal }): Promise<StudentDetail> => {
      if (!studentId) throw new Error('Student ID is required');

      const response = await apiClient(
        StudentDetailSchema,
        `/students/${studentId}`,
        { signal }
      );

      // Render guard: if tenantId in response does not match current authenticated tenant, drop!
      if (response.data.tenantId && response.data.tenantId !== tenantId) {
        // eslint-disable-next-line no-console
        console.warn('Dropped cross-tenant response mismatch:', response.data.tenantId, '!==', tenantId);
        throw new Error('Tenant mismatch in student response');
      }

      return response.data;
    },
    enabled: Boolean(studentId),
    staleTime: 10000,
  });

  return {
    ...query,
    currentTenantId: tenantId,
  };
}
