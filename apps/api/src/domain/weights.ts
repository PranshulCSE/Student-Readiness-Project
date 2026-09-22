import type { CompetencyKey } from '@student-readiness/shared';

export const WEIGHTS: Record<CompetencyKey, number> = {
  frontend: 0.30,
  backend: 0.30,
  databases: 0.25,
  problem_solving: 0.15,
};

export const COMPETENCY_KEYS: CompetencyKey[] = [
  'frontend',
  'backend',
  'databases',
  'problem_solving',
];
