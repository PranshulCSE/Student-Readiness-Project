import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/server.js';
import { setDbClient, MemoryDatabaseClient } from '../../src/db/client.js';
import { signToken } from '../../src/auth/jwt.js';

describe('API: Students & Tenant Isolation (§9.3)', () => {
  let db: MemoryDatabaseClient;
  let app: any;
  let request: supertest.SuperTest<supertest.Test>;

  const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const userA_Admin = {
    id: '11111111-1111-1111-1111-111111111111',
    tenantId: tenantA,
    role: 'admin' as const,
    email: 'admin@tenant-a.com',
  };

  const userA_Viewer = {
    id: '22222222-2222-2222-2222-222222222222',
    tenantId: tenantA,
    role: 'viewer' as const,
    email: 'viewer@tenant-a.com',
  };

  const userB_Admin = {
    id: '33333333-3333-3333-3333-333333333333',
    tenantId: tenantB,
    role: 'admin' as const,
    email: 'admin@tenant-b.com',
  };

  const studentA_Id = '44444444-4444-4444-4444-444444444444';
  const studentB_Id = '55555555-5555-5555-5555-555555555555';

  let tokenA_Admin: string;
  let tokenA_Viewer: string;
  let tokenB_Admin: string;

  beforeEach(async () => {
    db = new MemoryDatabaseClient();
    setDbClient(db);

    // Seed students
    db.students.set(studentA_Id, {
      id: studentA_Id,
      tenant_id: tenantA,
      full_name: 'Student Tenant A',
      email: 'student.a@org.com',
      status: 'active',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.students.set(studentB_Id, {
      id: studentB_Id,
      tenant_id: tenantB,
      full_name: 'Student Tenant B',
      email: 'student.b@org.com',
      status: 'active',
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    tokenA_Admin = signToken({
      userId: userA_Admin.id,
      tenantId: userA_Admin.tenantId,
      role: userA_Admin.role,
      email: userA_Admin.email,
    });

    tokenA_Viewer = signToken({
      userId: userA_Viewer.id,
      tenantId: userA_Viewer.tenantId,
      role: userA_Viewer.role,
      email: userA_Viewer.email,
    });

    tokenB_Admin = signToken({
      userId: userB_Admin.id,
      tenantId: userB_Admin.tenantId,
      role: userB_Admin.role,
      email: userB_Admin.email,
    });

    app = buildApp();
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('Missing auth header returns 401 UNAUTHENTICATED', async () => {
    const res = await request.get('/api/students');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('GET /api/students returns only students belonging to the authenticated tenant', async () => {
    const res = await request
      .get('/api/students')
      .set('Authorization', `Bearer ${tokenA_Admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(studentA_Id);
    expect(res.body.data[0].fullName).toBe('Student Tenant A');
  });

  it('Cross-tenant isolation: Tenant A cannot fetch Tenant B student (returns 404 non-disclosing)', async () => {
    const res = await request
      .get(`/api/students/${studentB_Id}`)
      .set('Authorization', `Bearer ${tokenA_Admin}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Resource not found');
    expect(res.body.error.requestId).toBeDefined();
    // Non-disclosure: NEVER disclose tenant or that the ID exists
    expect(res.body.tenantId).toBeUndefined();
  });

  it('RBAC: Viewer role is forbidden from updating a student', async () => {
    const res = await request
      .patch(`/api/students/${studentA_Id}`)
      .set('Authorization', `Bearer ${tokenA_Viewer}`)
      .set('If-Match', '1')
      .send({ fullName: 'Malicious Update' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PATCH /api/students/:id requires If-Match header', async () => {
    const res = await request
      .patch(`/api/students/${studentA_Id}`)
      .set('Authorization', `Bearer ${tokenA_Admin}`)
      .send({ fullName: 'New Name' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fieldErrors).toBeDefined();
  });

  it('PATCH /api/students/:id succeeds with correct version and bumps version to version + 1', async () => {
    const res = await request
      .patch(`/api/students/${studentA_Id}`)
      .set('Authorization', `Bearer ${tokenA_Admin}`)
      .set('If-Match', '1')
      .send({ fullName: 'Updated Asha R.' });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Updated Asha R.');
    expect(res.body.version).toBe(2);
  });

  it('PATCH /api/students/:id with stale version returns 409 CONFLICT_VERSION with currentVersion', async () => {
    // Current version is 1, send If-Match: 99
    const res = await request
      .patch(`/api/students/${studentA_Id}`)
      .set('Authorization', `Bearer ${tokenA_Admin}`)
      .set('If-Match', '99')
      .send({ fullName: 'Conflict Attempt' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT_VERSION');
    expect(res.body.error.currentVersion).toBe(1);
  });

  it('PATCH /api/students/:id rejects unauthorized fields (version, tenantId, overallScore)', async () => {
    const res = await request
      .patch(`/api/students/${studentA_Id}`)
      .set('Authorization', `Bearer ${tokenA_Admin}`)
      .set('If-Match', '1')
      .send({
        fullName: 'Valid Name',
        tenantId: 'hacked-tenant',
        version: 999,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
