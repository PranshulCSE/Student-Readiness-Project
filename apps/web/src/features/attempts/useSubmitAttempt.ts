import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.js';
import { apiClient, ApiResponse } from '../../api/client.js';
import {
  CreateAttempt,
  AttemptResponse,
  AttemptResponseSchema,
} from '@student-readiness/shared';

export function useSubmitAttempt(studentId: string, currentVersion?: number) {
  const { auth } = useAuth();
  const queryClient = useQueryClient();

  // Generate Idempotency-Key once per form intent; reuse on retry; regenerate on success
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  const mutation = useMutation<ApiResponse<AttemptResponse>, Error, CreateAttempt>({
    mutationFn: async (payload: CreateAttempt) => {
      const headers: Record<string, string> = {
        'Idempotency-Key': idempotencyKey,
      };
      if (currentVersion !== undefined) {
        headers['If-Match'] = String(currentVersion);
      }

      return apiClient(
        AttemptResponseSchema,
        `/students/${studentId}/attempts`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: () => {
      // Invalidate both detail and list for current tenant
      queryClient.invalidateQueries({ queryKey: ['student', auth.tenantId, studentId] });
      queryClient.invalidateQueries({ queryKey: ['students', auth.tenantId] });
      // Reset idempotency key for next submission intent
      setIdempotencyKey(crypto.randomUUID());
    },
  });

  const resetKey = useCallback(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  return {
    ...mutation,
    idempotencyKey,
    resetKey,
  };
}
