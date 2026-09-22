import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDatabaseClient } from '../../src/db/client.js';
import { StudentsRepository } from '../../src/modules/students/repository.js';
import { computeReadiness } from '../../src/domain/readiness.js';
import { CompetencyKey } from '@student-readiness/shared';

describe('Database: Latest Attempt & Tie-Break Logic (§9.2)', () => {
  let db: MemoryDatabaseClient;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const studentId = '22222222-2222-2222-2222-222222222222';
  const evaluatorId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    db = new MemoryDatabaseClient();
    // Seed student
    db.students.set(studentId, {
      id: studentId,
      tenant_id: tenantId,
      full_name: 'Test Student',
      email: 'test@example.com',
      status: 'active',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it('Tie-break rule: two attempts with same attempted_at -> higher id wins', async () => {
    const attemptedAt = '2025-01-01T12:00:00.000Z';

    // Insert first attempt with lower ID
    await db.query(
      `INSERT INTO attempts (id, tenant_id, student_id, competency_key, score, evaluator_id, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['attempt-001', tenantId, studentId, 'frontend', 70, evaluatorId, attemptedAt]
    );

    // Insert second attempt with higher ID but identical attempted_at
    await db.query(
      `INSERT INTO attempts (id, tenant_id, student_id, competency_key, score, evaluator_id, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['attempt-002', tenantId, studentId, 'frontend', 95, evaluatorId, attemptedAt]
    );

    const latest = await StudentsRepository.getLatestAttemptsForStudent(tenantId, studentId, db);
    expect(latest).toHaveLength(1);
    expect(latest[0].competency_key).toBe('frontend');
    expect(latest[0].id).toBe('attempt-002');
    expect(Number(latest[0].score)).toBe(95);
  });

  it('Voided attempt is ignored even if it is the latest attempted_at', async () => {
    // Valid older attempt
    await db.query(
      `INSERT INTO attempts (id, tenant_id, student_id, competency_key, score, evaluator_id, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['attempt-old', tenantId, studentId, 'backend', 85, evaluatorId, '2025-01-01T10:00:00.000Z']
    );

    // Voided newer attempt
    const voidedAttempt = {
      id: 'attempt-new-voided',
      tenant_id: tenantId,
      student_id: studentId,
      competency_key: 'backend',
      score: 40,
      evaluator_id: evaluatorId,
      attempted_at: '2025-01-02T10:00:00.000Z',
      voided_at: new Date().toISOString(),
      voided_by: evaluatorId,
      created_at: new Date().toISOString(),
    };
    db.attempts.set(voidedAttempt.id, voidedAttempt);

    const latest = await StudentsRepository.getLatestAttemptsForStudent(tenantId, studentId, db);
    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe('attempt-old');
    expect(Number(latest[0].score)).toBe(85);
  });

  it('Missing competency produces INCOMPLETE readiness and null score', async () => {
    // Provide attempts for only 3 competencies
    await db.query(
      `INSERT INTO attempts (id, tenant_id, student_id, competency_key, score, evaluator_id, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['att-fe', tenantId, studentId, 'frontend', 100, evaluatorId, '2025-01-01T00:00:00Z']
    );
    await db.query(
      `INSERT INTO attempts (id, tenant_id, student_id, competency_key, score, evaluator_id, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['att-be', tenantId, studentId, 'backend', 100, evaluatorId, '2025-01-01T00:00:00Z']
    );
    await db.query(
      `INSERT INTO attempts (id, tenant_id, student_id, competency_key, score, evaluator_id, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['att-db', tenantId, studentId, 'databases', 100, evaluatorId, '2025-01-01T00:00:00Z']
    );
    // problem_solving is missing

    const latest = await StudentsRepository.getLatestAttemptsForStudent(tenantId, studentId, db);
    const scoreMap: Partial<Record<CompetencyKey, number>> = {};
    for (const a of latest) {
      scoreMap[a.competency_key] = Number(a.score);
    }

    const readiness = computeReadiness(scoreMap);
    expect(readiness.readiness).toBe('INCOMPLETE');
    expect(readiness.score).toBeNull();
  });
});
