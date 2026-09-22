import crypto from 'node:crypto';
import { IDatabaseClient, getDbClient } from '../../db/client.js';
import { StudentsRepository } from '../students/repository.js';
import { writeOutboxEvent } from '../../outbox/writer.js';
import {
  IdempotencyService,
  computeRequestFingerprint,
} from '../idempotency/service.js';
import { computeReadiness } from '../../domain/readiness.js';
import type {
  CreateAttempt,
  AttemptResponse,
  CompetencyKey,
} from '@student-readiness/shared';
import {
  NotFoundError,
  ConflictVersionError,
} from '../../domain/errors.js';

export interface SubmitAttemptResult {
  statusCode: number;
  data: AttemptResponse;
  isReplayed: boolean;
}

export class AttemptsService {
  constructor(private db: IDatabaseClient = getDbClient()) {}

  async submitAttempt(params: {
    tenantId: string;
    studentId: string;
    evaluatorId: string;
    requestId: string;
    idempotencyKey: string;
    body: CreateAttempt;
    path: string;
    ifMatchVersion?: number;
  }): Promise<SubmitAttemptResult> {
    const {
      tenantId,
      studentId,
      evaluatorId,
      requestId,
      idempotencyKey,
      body,
      path,
      ifMatchVersion,
    } = params;

    const fingerprint = computeRequestFingerprint('POST', path, body);

    // 1. Check idempotency record
    const existingRecord = await IdempotencyService.check(
      this.db,
      tenantId,
      idempotencyKey,
      fingerprint
    );

    if (existingRecord) {
      return {
        statusCode: existingRecord.response_status,
        data: existingRecord.response_body,
        isReplayed: true,
      };
    }

    // 2. Verify student exists in tenant (404 non-disclosing)
    const student = await StudentsRepository.findById(tenantId, studentId, this.db);
    if (!student) {
      throw new NotFoundError('Resource not found');
    }

    // 3. Optional If-Match check
    if (ifMatchVersion !== undefined && student.version !== ifMatchVersion) {
      throw new ConflictVersionError(student.version);
    }

    // 4. Open transaction for atomic relational writes
    const attemptId = crypto.randomUUID();

    const result = await this.db.withTransaction<AttemptResponse>(async (tx) => {
      // 4a. Insert attempt
      await tx.query(
        `INSERT INTO attempts (
          id, tenant_id, student_id, competency_key, score, evaluator_id, attempted_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [
          attemptId,
          tenantId,
          studentId,
          body.competencyKey,
          body.score,
          evaluatorId,
          body.attemptedAt,
        ]
      );

      // 4b. Update student version & updated_at
      const updateRes = await tx.query(
        `UPDATE students
         SET version = version + 1, updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING version`,
        [studentId, tenantId]
      );
      const newVersion = updateRes.rows[0]?.version || student.version + 1;

      // 4c. Compute readiness inside tx (reading latest non-voided attempts)
      const latestAttempts = await StudentsRepository.getLatestAttemptsForStudent(
        tenantId,
        studentId,
        tx
      );

      const scoreMap: Partial<Record<CompetencyKey, number>> = {};
      for (const att of latestAttempts) {
        scoreMap[att.competency_key] = Number(att.score);
      }

      const readinessResult = computeReadiness(scoreMap);

      const responsePayload: AttemptResponse = {
        id: attemptId,
        studentId,
        competencyKey: body.competencyKey,
        score: body.score,
        attemptedAt: body.attemptedAt,
        evaluatorId,
        studentVersion: newVersion,
        readiness: readinessResult.readiness,
        overallScore: readinessResult.score,
      };

      // 4d. Insert outbox event (attempt.succeeded) inside same tx
      await writeOutboxEvent(tx, {
        tenantId,
        aggregateId: studentId,
        eventType: 'attempt.succeeded',
        requestId,
        payload: {
          attemptId,
          studentId,
          competencyKey: body.competencyKey,
          score: body.score,
          evaluatorId,
        },
      });

      // 4e. Insert idempotency record inside same tx
      await IdempotencyService.save(tx, {
        tenantId,
        idempotencyKey,
        fingerprint,
        responseStatus: 201,
        responseBody: responsePayload,
        resourceId: attemptId,
      });

      return responsePayload;
    });

    return {
      statusCode: 201,
      data: result,
      isReplayed: false,
    };
  }
}
