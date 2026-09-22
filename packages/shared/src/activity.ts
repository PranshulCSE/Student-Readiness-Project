import { z } from 'zod';
import { PaginationMetadataSchema } from './students.js';

export const EventTypeSchema = z.enum([
  'attempt.succeeded',
  'attempt.rejected',
  'attempt.voided',
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const ActivityMetadataSchema = z.object({
  competencyKey: z.string().optional(),
  score: z.number().optional(),
  reason: z.string().optional(),
  evaluatorId: z.string().uuid().optional(),
}).passthrough();

export type ActivityMetadata = z.infer<typeof ActivityMetadataSchema>;

export const ActivityItemSchema = z.object({
  eventId: z.string().uuid(),
  type: z.string(),
  occurredAt: z.string(),
  metadata: ActivityMetadataSchema,
});

export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
  cursor: z.string().optional(),
});

export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;

export const ActivityResponseSchema = z.object({
  data: z.array(ActivityItemSchema),
  page: PaginationMetadataSchema,
});

export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;

export const DuplicateStatsItemSchema = z.object({
  tenantId: z.string(),
  duplicateSuccessEvents: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  rejectionRate: z.number().nonnegative(),
});

export type DuplicateStatsItem = z.infer<typeof DuplicateStatsItemSchema>;
