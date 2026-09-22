import { IDatabaseClient, getDbClient } from '../../db/client.js';
import { StudentsRepository } from './repository.js';
import { computeReadiness } from '../../domain/readiness.js';
import {
  StudentListItem,
  StudentListResponse,
  StudentDetail,
  StudentQuery,
  PatchStudent,
  COMPETENCIES_METADATA,
  CompetencyKey,
} from '@student-readiness/shared';
import { NotFoundError, ConflictVersionError } from '../../domain/errors.js';
import { encodeCursor, decodeCursor } from './cursor.js';

export class StudentsService {
  constructor(private db: IDatabaseClient = getDbClient()) {}

  async listStudents(
    tenantId: string,
    query: StudentQuery
  ): Promise<StudentListResponse> {
    const rawStudents = await StudentsRepository.findMany(
      tenantId,
      {
        q: query.q,
        status: query.status,
        sort: query.sort,
      },
      this.db
    );

    // Compute readiness for each student
    const evaluatedList: StudentListItem[] = await Promise.all(
      rawStudents.map(async (s) => {
        const attempts = await StudentsRepository.getLatestAttemptsForStudent(
          tenantId,
          s.id,
          this.db
        );

        const scoreMap: Partial<Record<CompetencyKey, number>> = {};
        for (const att of attempts) {
          scoreMap[att.competency_key] = Number(att.score);
        }

        const readinessResult = computeReadiness(scoreMap);

        return {
          id: s.id,
          fullName: s.full_name,
          email: s.email,
          status: s.status,
          overallScore: readinessResult.score,
          readiness: readinessResult.readiness,
          version: s.version,
          updatedAt: typeof s.updated_at === 'string' ? s.updated_at : new Date(s.updated_at).toISOString(),
        };
      })
    );

    // Apply readiness filter if requested
    let filtered = evaluatedList;
    if (query.readiness) {
      filtered = filtered.filter((s) => s.readiness === query.readiness);
    }

    // Apply post-score sorting if requested
    if (query.sort === 'score_desc') {
      filtered.sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1) || a.id.localeCompare(b.id));
    } else if (query.sort === 'score_asc') {
      filtered.sort((a, b) => (a.overallScore ?? 999) - (b.overallScore ?? 999) || a.id.localeCompare(b.id));
    }

    // Cursor pagination
    let startIndex = 0;
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      const foundIdx = filtered.findIndex((s) => s.id === decoded.id);
      if (foundIdx !== -1) {
        startIndex = foundIdx + 1;
      }
    }

    const limit = query.limit || 20;
    const pageItems = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      nextCursor = encodeCursor({
        id: lastItem.id,
        val: lastItem.fullName,
      });
    }

    return {
      data: pageItems,
      page: {
        nextCursor,
        hasMore,
        limit,
      },
    };
  }

  async getStudentDetail(
    tenantId: string,
    studentId: string
  ): Promise<StudentDetail> {
    const student = await StudentsRepository.findById(tenantId, studentId, this.db);
    if (!student) {
      // Non-disclosing 404
      throw new NotFoundError('Resource not found');
    }

    const latestAttempts = await StudentsRepository.getLatestAttemptsForStudent(
      tenantId,
      studentId,
      this.db
    );

    const attemptsMap = new Map<CompetencyKey, any>();
    const scoreMap: Partial<Record<CompetencyKey, number>> = {};

    for (const att of latestAttempts) {
      attemptsMap.set(att.competency_key, {
        id: att.id,
        score: Number(att.score),
        attemptedAt: typeof att.attempted_at === 'string' ? att.attempted_at : new Date(att.attempted_at).toISOString(),
        evaluatorId: att.evaluator_id,
      });
      scoreMap[att.competency_key] = Number(att.score);
    }

    const readinessResult = computeReadiness(scoreMap);

    const competencies = COMPETENCIES_METADATA.map((meta) => ({
      key: meta.key,
      label: meta.label,
      weight: meta.weight,
      latestAttempt: attemptsMap.get(meta.key) || null,
    }));

    return {
      id: student.id,
      fullName: student.full_name,
      email: student.email,
      status: student.status,
      version: student.version,
      overallScore: readinessResult.score,
      readiness: readinessResult.readiness,
      competencies,
      tenantId: student.tenant_id,
    };
  }

  async patchStudent(
    tenantId: string,
    studentId: string,
    ifMatchVersion: number,
    data: PatchStudent
  ): Promise<StudentDetail> {
    const existing = await StudentsRepository.findById(tenantId, studentId, this.db);
    if (!existing) {
      throw new NotFoundError('Resource not found');
    }

    if (existing.version !== ifMatchVersion) {
      throw new ConflictVersionError(existing.version);
    }

    const updated = await StudentsRepository.updateVersionGuarded(
      tenantId,
      studentId,
      ifMatchVersion,
      data,
      this.db
    );

    if (!updated) {
      // Re-fetch current version for conflict details
      const current = await StudentsRepository.findById(tenantId, studentId, this.db);
      throw new ConflictVersionError(current?.version ?? existing.version);
    }

    return this.getStudentDetail(tenantId, studentId);
  }
}
