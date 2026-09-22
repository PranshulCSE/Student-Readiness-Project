import { z } from 'zod';

export const CompetencyKeySchema = z.enum([
  'frontend',
  'backend',
  'databases',
  'problem_solving',
]);

export type CompetencyKey = z.infer<typeof CompetencyKeySchema>;

export const COMPETENCY_KEYS: CompetencyKey[] = [
  'frontend',
  'backend',
  'databases',
  'problem_solving',
];

export const WEIGHTS: Record<CompetencyKey, number> = {
  frontend: 0.30,
  backend: 0.30,
  databases: 0.25,
  problem_solving: 0.15,
};

export interface CompetencyMetadata {
  key: CompetencyKey;
  label: string;
  weight: number;
  required: boolean;
}

export const COMPETENCIES_METADATA: CompetencyMetadata[] = [
  { key: 'frontend', label: 'Frontend', weight: 0.30, required: true },
  { key: 'backend', label: 'Backend', weight: 0.30, required: true },
  { key: 'databases', label: 'Databases', weight: 0.25, required: true },
  { key: 'problem_solving', label: 'Problem Solving', weight: 0.15, required: true },
];
