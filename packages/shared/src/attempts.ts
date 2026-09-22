import { z } from 'zod';
import { CompetencyKeySchema } from './competencies.js';
import { ReadinessSchema } from './readiness.js';

export const CreateAttemptSchema = z.object({
  competencyKey: CompetencyKeySchema,
  score: z.number().min(0, { message: 'score must be between 0 and 100' }).max(100, { message: 'score must be between 0 and 100' }),
  attemptedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
}).strict();

export type CreateAttempt = z.infer<typeof CreateAttemptSchema>;

export const AttemptResponseSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  competencyKey: CompetencyKeySchema,
  score: z.number().min(0).max(100),
  attemptedAt: z.string(),
  evaluatorId: z.string().uuid(),
  studentVersion: z.number().int().positive(),
  readiness: ReadinessSchema,
  overallScore: z.number().nullable(),
});

export type AttemptResponse = z.infer<typeof AttemptResponseSchema>;
