import { z } from 'zod';
import { CompetencyKey, COMPETENCY_KEYS, WEIGHTS } from './competencies.js';

export const ReadinessSchema = z.enum([
  'INCOMPLETE',
  'READY',
  'NEARLY_READY',
  'DEVELOPING',
  'NEEDS_PREPARATION',
]);

export type Readiness = z.infer<typeof ReadinessSchema>;

export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export interface ReadinessResult {
  score: number | null;
  readiness: Readiness;
}

export function computeReadiness(
  latest: Partial<Record<CompetencyKey, number>>
): ReadinessResult {
  for (const k of COMPETENCY_KEYS) {
    const val = latest[k];
    if (val === undefined || val === null || isNaN(val)) {
      return { score: null, readiness: 'INCOMPLETE' };
    }
  }

  const rawScore = COMPETENCY_KEYS.reduce((sum, k) => {
    return sum + WEIGHTS[k] * (latest[k] as number);
  }, 0);

  const score = round2(rawScore);

  let readiness: Readiness;
  if (score >= 80) {
    readiness = 'READY';
  } else if (score >= 65) {
    readiness = 'NEARLY_READY';
  } else if (score >= 50) {
    readiness = 'DEVELOPING';
  } else {
    readiness = 'NEEDS_PREPARATION';
  }

  return { score, readiness };
}
