import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT_VERSION',
  'CONFLICT_IDEMPOTENCY',
  'IDEMPOTENCY_REPLAY',
  'RATE_LIMITED',
  'INTERNAL',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const FieldErrorSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});

export type FieldError = z.infer<typeof FieldErrorSchema>;

export const ErrorDetailSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  requestId: z.string(),
  fieldErrors: z.array(FieldErrorSchema).optional(),
  currentVersion: z.number().int().optional(),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: ErrorDetailSchema,
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
