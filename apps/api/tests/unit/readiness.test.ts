import { describe, it, expect } from 'vitest';
import { computeReadiness, round2 } from '../../src/domain/readiness.js';

describe('Domain: Readiness Calculation', () => {
  it('should return INCOMPLETE and null score if any competency is missing', () => {
    // Missing problem_solving
    const partialScores = {
      frontend: 100,
      backend: 100,
      databases: 100,
    };
    const result = computeReadiness(partialScores);
    expect(result.readiness).toBe('INCOMPLETE');
    expect(result.score).toBeNull();
  });

  it('should return INCOMPLETE and null score if all competencies are missing', () => {
    const result = computeReadiness({});
    expect(result.readiness).toBe('INCOMPLETE');
    expect(result.score).toBeNull();
  });

  it('should return INCOMPLETE if a score is undefined, null, or NaN', () => {
    expect(computeReadiness({
      frontend: 80,
      backend: 80,
      databases: 80,
      problem_solving: undefined,
    })).toEqual({ score: null, readiness: 'INCOMPLETE' });

    expect(computeReadiness({
      frontend: 80,
      backend: 80,
      databases: 80,
      problem_solving: null as any,
    })).toEqual({ score: null, readiness: 'INCOMPLETE' });

    expect(computeReadiness({
      frontend: 80,
      backend: 80,
      databases: 80,
      problem_solving: NaN,
    })).toEqual({ score: null, readiness: 'INCOMPLETE' });
  });

  it('should accurately compute weighted scores', () => {
    // 80*0.30 + 70*0.30 + 90*0.25 + 60*0.15 = 24 + 21 + 22.5 + 9 = 76.5
    const result = computeReadiness({
      frontend: 80,
      backend: 70,
      databases: 90,
      problem_solving: 60,
    });
    expect(result.score).toBe(76.5);
    expect(result.readiness).toBe('NEARLY_READY');
  });

  describe('Boundary Conditions (§9.1)', () => {
    it('79.99 -> NEARLY_READY', () => {
      // Create a set of scores that sum exactly to 79.99
      // frontend: 79.99 (0.3), backend: 79.99 (0.3), databases: 79.99 (0.25), problem_solving: 79.99 (0.15) -> 79.99
      const result = computeReadiness({
        frontend: 79.99,
        backend: 79.99,
        databases: 79.99,
        problem_solving: 79.99,
      });
      expect(result.score).toBe(79.99);
      expect(result.readiness).toBe('NEARLY_READY');
    });

    it('80.00 -> READY', () => {
      const result = computeReadiness({
        frontend: 80,
        backend: 80,
        databases: 80,
        problem_solving: 80,
      });
      expect(result.score).toBe(80);
      expect(result.readiness).toBe('READY');
    });

    it('100.00 -> READY', () => {
      const result = computeReadiness({
        frontend: 100,
        backend: 100,
        databases: 100,
        problem_solving: 100,
      });
      expect(result.score).toBe(100);
      expect(result.readiness).toBe('READY');
    });

    it('64.99 -> DEVELOPING', () => {
      const result = computeReadiness({
        frontend: 64.99,
        backend: 64.99,
        databases: 64.99,
        problem_solving: 64.99,
      });
      expect(result.score).toBe(64.99);
      expect(result.readiness).toBe('DEVELOPING');
    });

    it('65.00 -> NEARLY_READY', () => {
      const result = computeReadiness({
        frontend: 65,
        backend: 65,
        databases: 65,
        problem_solving: 65,
      });
      expect(result.score).toBe(65);
      expect(result.readiness).toBe('NEARLY_READY');
    });

    it('49.99 -> NEEDS_PREPARATION', () => {
      const result = computeReadiness({
        frontend: 49.99,
        backend: 49.99,
        databases: 49.99,
        problem_solving: 49.99,
      });
      expect(result.score).toBe(49.99);
      expect(result.readiness).toBe('NEEDS_PREPARATION');
    });

    it('50.00 -> DEVELOPING', () => {
      const result = computeReadiness({
        frontend: 50,
        backend: 50,
        databases: 50,
        problem_solving: 50,
      });
      expect(result.score).toBe(50);
      expect(result.readiness).toBe('DEVELOPING');
    });

    it('0.00 -> NEEDS_PREPARATION', () => {
      const result = computeReadiness({
        frontend: 0,
        backend: 0,
        databases: 0,
        problem_solving: 0,
      });
      expect(result.score).toBe(0);
      expect(result.readiness).toBe('NEEDS_PREPARATION');
    });
  });

  describe('Rounding helper (round2)', () => {
    it('properly rounds floating point numbers to 2 decimal places', () => {
      expect(round2(82.504)).toBe(82.5);
      expect(round2(82.505)).toBe(82.51);
      expect(round2(79.999)).toBe(80);
      expect(round2(0)).toBe(0);
    });
  });
});
