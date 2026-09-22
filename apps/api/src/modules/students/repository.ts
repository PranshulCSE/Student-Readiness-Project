import { IDatabaseClient } from '../../db/client.js';
import { StudentRow } from '../../db/schema.js';
import type { CompetencyKey } from '@student-readiness/shared';

export interface LatestAttemptRow {
  id: string;
  competency_key: CompetencyKey;
  score: number;
  attempted_at: Date;
  evaluator_id: string;
}

export class StudentsRepository {
  /**
   * Find student by ID strictly scoped to tenant.
   * Takes tenantId as first argument.
   */
  static async findById(
    tenantId: string,
    studentId: string,
    db: IDatabaseClient
  ): Promise<StudentRow | null> {
    const res = await db.query<StudentRow>(
      `SELECT id, tenant_id, full_name, email, status, version, created_at, updated_at
       FROM students
       WHERE id = $1 AND tenant_id = $2`,
      [studentId, tenantId]
    );
    return res.rows[0] || null;
  }

  /**
   * List students with filters, strictly scoped to tenant.
   * Takes tenantId as first argument.
   */
  static async findMany(
    tenantId: string,
    params: {
      q?: string;
      status?: 'active' | 'archived' | 'all';
      sort?: string;
    },
    db: IDatabaseClient
  ): Promise<StudentRow[]> {
    let sql = `SELECT id, tenant_id, full_name, email, status, version, created_at, updated_at
               FROM students
               WHERE tenant_id = $1`;
    const queryParams: any[] = [tenantId];

    if (params.status && params.status !== 'all') {
      queryParams.push(params.status);
      sql += ` AND status = $${queryParams.length}`;
    }

    if (params.q && params.q.trim().length > 0) {
      queryParams.push(`%${params.q.trim()}%`);
      sql += ` AND (full_name ILIKE $${queryParams.length} OR email ILIKE $${queryParams.length})`;
    }

    if (params.sort === 'name_desc') {
      sql += ` ORDER BY full_name DESC, id DESC`;
    } else if (params.sort === 'updated_desc') {
      sql += ` ORDER BY updated_at DESC, id DESC`;
    } else {
      sql += ` ORDER BY full_name ASC, id ASC`;
    }

    const res = await db.query<StudentRow>(sql, queryParams);
    return res.rows;
  }

  /**
   * Fetch latest non-voided attempt per competency for a student.
   * Reference query from §3.1 with tie-breaker by (attempted_at DESC, id DESC).
   * Takes tenantId as first argument.
   */
  static async getLatestAttemptsForStudent(
    tenantId: string,
    studentId: string,
    db: IDatabaseClient
  ): Promise<LatestAttemptRow[]> {
    const res = await db.query<LatestAttemptRow>(
      `SELECT DISTINCT ON (a.competency_key)
         a.id, a.competency_key, a.score, a.attempted_at, a.evaluator_id
       FROM attempts a
       WHERE a.tenant_id = $1
         AND a.student_id = $2
         AND a.voided_at IS NULL
       ORDER BY a.competency_key, a.attempted_at DESC, a.id DESC`,
      [tenantId, studentId]
    );
    return res.rows;
  }

  /**
   * Optimistically locked student update.
   * If version mismatches or tenant/id mismatch, 0 rows affected.
   * Takes tenantId as first argument.
   */
  static async updateVersionGuarded(
    tenantId: string,
    studentId: string,
    expectedVersion: number,
    data: { fullName?: string; email?: string; status?: 'active' | 'archived' },
    db: IDatabaseClient
  ): Promise<StudentRow | null> {
    const existing = await this.findById(tenantId, studentId, db);
    if (!existing) return null;

    const fullName = data.fullName !== undefined ? data.fullName : existing.full_name;
    const email = data.email !== undefined ? data.email : existing.email;
    const status = data.status !== undefined ? data.status : existing.status;

    const res = await db.query<StudentRow>(
      `UPDATE students
       SET full_name = $1, email = $2, status = $3,
           version = version + 1, updated_at = now()
       WHERE id = $4 AND tenant_id = $5 AND version = $6
       RETURNING id, tenant_id, full_name, email, status, version, created_at, updated_at`,
      [fullName, email, status, studentId, tenantId, expectedVersion]
    );

    return res.rows[0] || null;
  }

  /**
   * Insert new student.
   * Takes tenantId as first argument.
   */
  static async create(
    tenantId: string,
    data: { id: string; fullName: string; email: string; status?: 'active' | 'archived' },
    db: IDatabaseClient
  ): Promise<StudentRow> {
    const res = await db.query<StudentRow>(
      `INSERT INTO students (id, tenant_id, full_name, email, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, now(), now())
       RETURNING id, tenant_id, full_name, email, status, version, created_at, updated_at`,
      [data.id, tenantId, data.fullName, data.email, data.status || 'active']
    );
    return res.rows[0];
  }
}
