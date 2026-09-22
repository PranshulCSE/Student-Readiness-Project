import { z } from 'zod';
import { ReadinessSchema } from './readiness.js';
import { CompetencyKeySchema } from './competencies.js';

export const StudentStatusSchema = z.enum(['active', 'archived']);
export type StudentStatus = z.infer<typeof StudentStatusSchema>;

export const StudentFilterStatusSchema = z.enum(['active', 'archived', 'all']);
export type StudentFilterStatus = z.infer<typeof StudentFilterStatusSchema>;

export const StudentSortSchema = z.enum([
  'name_asc',
  'name_desc',
  'score_desc',
  'score_asc',
  'updated_desc',
]);
export type StudentSort = z.infer<typeof StudentSortSchema>;

export const StudentQuerySchema = z.object({
  q: z.string().max(100).default('').optional(),
  status: StudentFilterStatusSchema.default('active').optional(),
  readiness: ReadinessSchema.optional(),
  sort: StudentSortSchema.default('name_asc').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  cursor: z.string().optional(),
});

export type StudentQuery = z.infer<typeof StudentQuerySchema>;

export const StudentListItemSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  status: StudentStatusSchema,
  overallScore: z.number().nullable(),
  readiness: ReadinessSchema,
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }).or(z.string()),
});

export type StudentListItem = z.infer<typeof StudentListItemSchema>;

export const PaginationMetadataSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  limit: z.number().int(),
});

export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>;

export const StudentListResponseSchema = z.object({
  data: z.array(StudentListItemSchema),
  page: PaginationMetadataSchema,
});

export type StudentListResponse = z.infer<typeof StudentListResponseSchema>;

export const LatestAttemptSummarySchema = z.object({
  id: z.string().uuid(),
  score: z.number().min(0).max(100),
  attemptedAt: z.string(),
  evaluatorId: z.string().uuid(),
});

export type LatestAttemptSummary = z.infer<typeof LatestAttemptSummarySchema>;

export const StudentCompetencyDetailSchema = z.object({
  key: CompetencyKeySchema,
  label: z.string(),
  weight: z.number().positive().max(1),
  latestAttempt: LatestAttemptSummarySchema.nullable(),
});

export type StudentCompetencyDetail = z.infer<typeof StudentCompetencyDetailSchema>;

export const StudentDetailSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  status: StudentStatusSchema,
  version: z.number().int().positive(),
  overallScore: z.number().nullable(),
  readiness: ReadinessSchema,
  competencies: z.array(StudentCompetencyDetailSchema),
  tenantId: z.string().uuid().optional(), // For internal/testing or defensive check
});

export type StudentDetail = z.infer<typeof StudentDetailSchema>;

export const CreateStudentSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  status: StudentStatusSchema.default('active'),
}).strict();

export type CreateStudent = z.infer<typeof CreateStudentSchema>;

export const PatchStudentSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  status: StudentStatusSchema.optional(),
}).strict();

export type PatchStudent = z.infer<typeof PatchStudentSchema>;
