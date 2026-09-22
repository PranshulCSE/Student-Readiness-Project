import pg from 'pg';
import { config } from '../config/index.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface IDatabaseClient {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  withTransaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class PgDatabaseClient implements IDatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    this.pool = new pg.Pool({
      connectionString: connectionString || config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.pool.query(text, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length,
    };
  }

  async withTransaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txWrapper: IDatabaseClient = {
        query: async <R = any>(text: string, params?: any[]): Promise<QueryResult<R>> => {
          const res = await client.query(text, params);
          return {
            rows: res.rows as R[],
            rowCount: res.rowCount ?? res.rows.length,
          };
        },
        withTransaction: async <R>(nestedCb: (c: IDatabaseClient) => Promise<R>): Promise<R> => {
          return nestedCb(txWrapper);
        },
        close: async () => {},
      };

      const result = await callback(txWrapper);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * In-memory transactional relational mock client for high-speed, deterministic
 * integration tests and environments without active local PostgreSQL daemons.
 */
export class MemoryDatabaseClient implements IDatabaseClient {
  public tenants: Map<string, any> = new Map();
  public users: Map<string, any> = new Map();
  public students: Map<string, any> = new Map();
  public competencies: Map<string, any> = new Map();
  public attempts: Map<string, any> = new Map();
  public idempotency_records: Map<string, any> = new Map();
  public outbox_events: Map<string, any> = new Map();

  constructor(seedDev: boolean = false) {
    this.seedCompetencies();
    if (seedDev) {
      this.seedDevData();
    }
  }

  private seedDevData() {
    const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    this.tenants.set(tenantA, {
      id: tenantA,
      name: 'Acme Institute of Tech',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.tenants.set(tenantB, {
      id: tenantB,
      name: 'Nexus University',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const passwordHash = '$2a$10$wT38xX0U.K7.8hVq5F13Z.Yp2v7m4HkX6W9.rXw3G1Y5R6sX/5mOm';
    this.users.set('11111111-1111-1111-1111-111111111111', {
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: tenantA,
      email: 'admin@acme.edu',
      password_hash: passwordHash,
      role: 'admin',
      status: 'active',
      created_at: new Date().toISOString(),
    });

    this.users.set('33333333-3333-3333-3333-333333333333', {
      id: '33333333-3333-3333-3333-333333333333',
      tenant_id: tenantB,
      email: 'evaluator@nexus.edu',
      password_hash: passwordHash,
      role: 'evaluator',
      status: 'active',
      created_at: new Date().toISOString(),
    });

    const studentsA = [
      { id: '10000000-0000-0000-0000-000000000001', name: 'John Doe', email: 'john.doe@acme.edu', status: 'active', version: 1 },
      { id: '10000000-0000-0000-0000-000000000002', name: 'Jane Smith', email: 'jane.smith@acme.edu', status: 'active', version: 1 },
      { id: '10000000-0000-0000-0000-000000000003', name: 'Alex Johnson', email: 'alex.j@acme.edu', status: 'active', version: 1 },
      { id: '10000000-0000-0000-0000-000000000004', name: 'Sam Taylor', email: 'sam.t@acme.edu', status: 'inactive', version: 1 },
    ];

    for (const s of studentsA) {
      this.students.set(s.id, {
        id: s.id,
        tenant_id: tenantA,
        full_name: s.name,
        email: s.email,
        status: s.status,
        version: s.version,
        created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      });
    }

    const atts1 = [
      { id: 'att_01', comp: 'frontend', score: 85 },
      { id: 'att_02', comp: 'backend', score: 80 },
      { id: 'att_03', comp: 'databases', score: 75 },
      { id: 'att_04', comp: 'problem_solving', score: 90 },
    ];
    for (const a of atts1) {
      this.attempts.set(a.id, {
        id: a.id,
        tenant_id: tenantA,
        student_id: studentsA[0].id,
        competency_key: a.comp,
        score: a.score,
        attempted_at: new Date().toISOString(),
        evaluator_id: '11111111-1111-1111-1111-111111111111',
        voided_at: null,
      });
    }

    const atts2 = [
      { id: 'att_05', comp: 'frontend', score: 90 },
      { id: 'att_06', comp: 'backend', score: 85 },
      { id: 'att_07', comp: 'databases', score: 80 },
    ];
    for (const a of atts2) {
      this.attempts.set(a.id, {
        id: a.id,
        tenant_id: tenantA,
        student_id: studentsA[1].id,
        competency_key: a.comp,
        score: a.score,
        attempted_at: new Date().toISOString(),
        evaluator_id: '11111111-1111-1111-1111-111111111111',
        voided_at: null,
      });
    }

    const atts3 = [
      { id: 'att_08', comp: 'frontend', score: 75 },
      { id: 'att_09', comp: 'backend', score: 72 },
      { id: 'att_10', comp: 'databases', score: 55 },
      { id: 'att_11', comp: 'problem_solving', score: 70 },
    ];
    for (const a of atts3) {
      this.attempts.set(a.id, {
        id: a.id,
        tenant_id: tenantA,
        student_id: studentsA[2].id,
        competency_key: a.comp,
        score: a.score,
        attempted_at: new Date().toISOString(),
        evaluator_id: '11111111-1111-1111-1111-111111111111',
        voided_at: null,
      });
    }

    const studentsB = [
      { id: '20000000-0000-0000-0000-000000000001', name: 'Maria Garcia', email: 'maria.g@nexus.edu', status: 'active', version: 1 },
      { id: '20000000-0000-0000-0000-000000000002', name: 'Robert Chen', email: 'robert.c@nexus.edu', status: 'active', version: 1 },
    ];

    for (const s of studentsB) {
      this.students.set(s.id, {
        id: s.id,
        tenant_id: tenantB,
        full_name: s.name,
        email: s.email,
        status: s.status,
        version: s.version,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  private seedCompetencies() {
    this.competencies.set('frontend', {
      key: 'frontend',
      weight: 0.30,
      required: true,
      label: 'Frontend',
    });
    this.competencies.set('backend', {
      key: 'backend',
      weight: 0.30,
      required: true,
      label: 'Backend',
    });
    this.competencies.set('databases', {
      key: 'databases',
      weight: 0.25,
      required: true,
      label: 'Databases',
    });
    this.competencies.set('problem_solving', {
      key: 'problem_solving',
      weight: 0.15,
      required: true,
      label: 'Problem Solving',
    });
  }

  // Clone state for transactions
  private cloneState() {
    return {
      tenants: new Map(Array.from(this.tenants.entries()).map(([k, v]) => [k, { ...v }])),
      users: new Map(Array.from(this.users.entries()).map(([k, v]) => [k, { ...v }])),
      students: new Map(Array.from(this.students.entries()).map(([k, v]) => [k, { ...v }])),
      competencies: new Map(Array.from(this.competencies.entries()).map(([k, v]) => [k, { ...v }])),
      attempts: new Map(Array.from(this.attempts.entries()).map(([k, v]) => [k, { ...v }])),
      idempotency_records: new Map(Array.from(this.idempotency_records.entries()).map(([k, v]) => [k, { ...v }])),
      outbox_events: new Map(Array.from(this.outbox_events.entries()).map(([k, v]) => [k, { ...v }])),
    };
  }

  private restoreState(state: any) {
    this.tenants = state.tenants;
    this.users = state.users;
    this.students = state.students;
    this.competencies = state.competencies;
    this.attempts = state.attempts;
    this.idempotency_records = state.idempotency_records;
    this.outbox_events = state.outbox_events;
  }

  async withTransaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    const snapshot = this.cloneState();
    try {
      const result = await callback(this);
      return result;
    } catch (err) {
      this.restoreState(snapshot);
      throw err;
    }
  }

  async query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    const normalized = text.trim().replace(/\s+/g, ' ');

    // 1. SELECT DISTINCT ON (a.competency_key) latest attempt per competency
    if (normalized.includes('SELECT DISTINCT ON (a.competency_key)')) {
      const tenantId = params[0];
      const studentId = params[1];

      const studentAttempts = Array.from(this.attempts.values())
        .filter((a) => a.tenant_id === tenantId && a.student_id === studentId && a.voided_at === null);

      // Sort by attempted_at DESC, then id DESC (tie break by id)
      studentAttempts.sort((a, b) => {
        const timeDiff = new Date(b.attempted_at).getTime() - new Date(a.attempted_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

      const map = new Map<string, any>();
      for (const att of studentAttempts) {
        if (!map.has(att.competency_key)) {
          map.set(att.competency_key, {
            id: att.id,
            competency_key: att.competency_key,
            score: Number(att.score),
            attempted_at: att.attempted_at,
            evaluator_id: att.evaluator_id,
          });
        }
      }

      const rows = Array.from(map.values()) as T[];
      return { rows, rowCount: rows.length };
    }

    // 2. SELECT FROM students WHERE id = $1 AND tenant_id = $2
    if (normalized.includes('FROM students') && normalized.includes('WHERE id = $1 AND tenant_id = $2')) {
      const id = params[0];
      const tenantId = params[1];
      const s = this.students.get(id);
      if (s && s.tenant_id === tenantId) {
        return { rows: [{ ...s }] as T[], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 3. SELECT FROM students WHERE tenant_id = $1 (list students)
    if (normalized.includes('FROM students') && normalized.includes('WHERE tenant_id = $1')) {
      const tenantId = params[0];
      let list = Array.from(this.students.values()).filter((s) => s.tenant_id === tenantId);

      // Status filter
      if (normalized.includes('status = $')) {
        const statusVal = params[1];
        if (statusVal && statusVal !== 'all') {
          list = list.filter((s) => s.status === statusVal);
        }
      }

      // Query (search) filter
      const qParam = params.find((p, idx) => idx > 0 && typeof p === 'string' && p.startsWith('%') && p.endsWith('%'));
      if (qParam) {
        const term = qParam.slice(1, -1).toLowerCase();
        list = list.filter((s) => s.full_name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term));
      }

      // Sort
      if (normalized.includes('ORDER BY full_name ASC')) {
        list.sort((a, b) => a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id));
      } else if (normalized.includes('ORDER BY full_name DESC')) {
        list.sort((a, b) => b.full_name.localeCompare(a.full_name) || b.id.localeCompare(a.id));
      } else if (normalized.includes('ORDER BY updated_at DESC')) {
        list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() || b.id.localeCompare(a.id));
      }

      const rows = list.map((s) => ({ ...s })) as T[];
      return { rows, rowCount: rows.length };
    }

    // 4. UPDATE students SET full_name = $1, email = $2, status = $3, version = version + 1
    if (normalized.includes('UPDATE students SET') && normalized.includes('WHERE id = $4 AND tenant_id = $5 AND version = $6')) {
      const [fullName, email, status, id, tenantId, version] = params;
      const existing = this.students.get(id);
      if (existing && existing.tenant_id === tenantId && existing.version === version) {
        existing.full_name = fullName ?? existing.full_name;
        existing.email = email ?? existing.email;
        existing.status = status ?? existing.status;
        existing.version = existing.version + 1;
        existing.updated_at = new Date().toISOString();
        return { rows: [{ ...existing }] as T[], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 5. UPDATE students SET version = version + 1, updated_at = now() WHERE id = $1 AND tenant_id = $2
    if (normalized.includes('UPDATE students SET version = version + 1') && normalized.includes('WHERE id = $1 AND tenant_id = $2')) {
      const [id, tenantId] = params;
      const existing = this.students.get(id);
      if (existing && existing.tenant_id === tenantId) {
        existing.version = existing.version + 1;
        existing.updated_at = new Date().toISOString();
        return { rows: [{ ...existing }] as T[], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 6. INSERT INTO students
    if (normalized.startsWith('INSERT INTO students')) {
      const student = {
        id: params[0],
        tenant_id: params[1],
        full_name: params[2],
        email: params[3],
        status: params[4] || 'active',
        version: params[5] || 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.students.set(student.id, student);
      return { rows: [student] as T[], rowCount: 1 };
    }

    // 7. INSERT INTO attempts
    if (normalized.startsWith('INSERT INTO attempts')) {
      const attempt = {
        id: params[0],
        tenant_id: params[1],
        student_id: params[2],
        competency_key: params[3],
        score: Number(params[4]),
        evaluator_id: params[5],
        attempted_at: params[6],
        voided_at: null,
        voided_by: null,
        created_at: new Date().toISOString(),
      };
      this.attempts.set(attempt.id, attempt);
      return { rows: [attempt] as T[], rowCount: 1 };
    }

    // 8. SELECT FROM idempotency_records WHERE tenant_id = $1 AND idempotency_key = $2
    if (normalized.includes('FROM idempotency_records') && normalized.includes('WHERE tenant_id = $1 AND idempotency_key = $2')) {
      const [tenantId, key] = params;
      const keyStr = `${tenantId}:${key}`;
      const rec = this.idempotency_records.get(keyStr);
      if (rec) {
        // Check expiry
        if (new Date(rec.expires_at).getTime() < Date.now()) {
          this.idempotency_records.delete(keyStr);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ ...rec }] as T[], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 9. INSERT INTO idempotency_records
    if (normalized.startsWith('INSERT INTO idempotency_records')) {
      const rec = {
        id: params[0],
        tenant_id: params[1],
        idempotency_key: params[2],
        request_fingerprint: params[3],
        response_status: params[4],
        response_body: typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5],
        resource_id: params[6],
        expires_at: params[7],
        created_at: new Date().toISOString(),
      };
      const keyStr = `${rec.tenant_id}:${rec.idempotency_key}`;
      this.idempotency_records.set(keyStr, rec);
      return { rows: [rec] as T[], rowCount: 1 };
    }

    // 10. INSERT INTO outbox_events
    if (normalized.startsWith('INSERT INTO outbox_events')) {
      const evt = {
        id: params[0],
        tenant_id: params[1],
        aggregate_id: params[2],
        event_type: params[3],
        payload: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
        request_id: params[5],
        status: 'pending',
        attempts: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        published_at: null,
      };
      this.outbox_events.set(evt.id, evt);
      return { rows: [evt] as T[], rowCount: 1 };
    }

    // 11. SELECT FROM outbox_events WHERE status = 'pending' ORDER BY created_at LIMIT ... FOR UPDATE SKIP LOCKED
    if (normalized.includes('FROM outbox_events') && normalized.includes("status = 'pending'")) {
      const pending = Array.from(this.outbox_events.values())
        .filter((e) => e.status === 'pending')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const limit = params[0] || 100;
      const selected = pending.slice(0, limit);
      return { rows: selected.map((s) => ({ ...s })) as T[], rowCount: selected.length };
    }

    // 12. UPDATE outbox_events SET status = 'published'
    if (normalized.includes("UPDATE outbox_events SET status = 'published'")) {
      const id = params[0];
      const evt = this.outbox_events.get(id);
      if (evt) {
        evt.status = 'published';
        evt.published_at = new Date().toISOString();
        return { rows: [evt] as T[], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 13. UPDATE outbox_events SET attempts = attempts + 1, last_error = ...
    if (normalized.includes('UPDATE outbox_events SET attempts = attempts + 1')) {
      const [lastError, status, id] = params;
      const evt = this.outbox_events.get(id);
      if (evt) {
        evt.attempts += 1;
        evt.last_error = lastError;
        evt.status = status;
        return { rows: [evt] as T[], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 14. SELECT FROM competencies
    if (normalized.includes('FROM competencies')) {
      const rows = Array.from(this.competencies.values()) as T[];
      return { rows, rowCount: rows.length };
    }

    // 15. SELECT FROM users WHERE tenant_id = $1 AND email = $2
    if (normalized.includes('FROM users') && normalized.includes('WHERE tenant_id = $1 AND email = $2')) {
      const [tenantId, email] = params;
      const u = Array.from(this.users.values()).find(
        (user) => user.tenant_id === tenantId && user.email.toLowerCase() === email.toLowerCase()
      );
      return { rows: u ? [{ ...u }] as T[] : [], rowCount: u ? 1 : 0 };
    }

    // 16. SELECT FROM users WHERE email = $1 (global lookup)
    if (normalized.includes('FROM users') && normalized.includes('WHERE email = $1')) {
      const [email] = params;
      const u = Array.from(this.users.values()).find(
        (user) => user.email.toLowerCase() === email.toLowerCase()
      );
      return { rows: u ? [{ ...u }] as T[] : [], rowCount: u ? 1 : 0 };
    }

    // 17. INSERT INTO users
    if (normalized.startsWith('INSERT INTO users')) {
      const user = {
        id: params[0],
        tenant_id: params[1],
        email: params[2],
        password_hash: params[3],
        role: params[4],
        status: params[5] || 'active',
        created_at: new Date().toISOString(),
      };
      this.users.set(user.id, user);
      return { rows: [user] as T[], rowCount: 1 };
    }

    // 18. INSERT INTO tenants
    if (normalized.startsWith('INSERT INTO tenants')) {
      const tenant = {
        id: params[0],
        name: params[1],
        status: params[2] || 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.tenants.set(tenant.id, tenant);
      return { rows: [tenant] as T[], rowCount: 1 };
    }

    // 19. SELECT FROM tenants WHERE id = $1
    if (normalized.includes('FROM tenants') && normalized.includes('WHERE id = $1')) {
      const id = params[0];
      const t = this.tenants.get(id);
      return { rows: t ? [{ ...t }] as T[] : [], rowCount: t ? 1 : 0 };
    }

    // Fallback
    return { rows: [], rowCount: 0 };
  }

  async close(): Promise<void> {}
}

let activeClient: IDatabaseClient | null = null;

export function getDbClient(): IDatabaseClient {
  if (!activeClient) {
    if (config.USE_MEMORY_DB || process.env.USE_MEMORY_DB === 'true' || process.env.NODE_ENV === 'test') {
      const isDev = process.env.NODE_ENV !== 'test';
      activeClient = new MemoryDatabaseClient(isDev);
    } else {
      activeClient = new PgDatabaseClient();
    }
  }
  return activeClient;
}

export function setDbClient(client: IDatabaseClient): void {
  activeClient = client;
}
