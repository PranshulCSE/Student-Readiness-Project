import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import crypto from 'node:crypto';
import { buildApp } from '../../src/server.js';
import { setDbClient, MemoryDatabaseClient } from '../../src/db/client.js';
import { setMongoClient, MemoryMongoClient } from '../../src/mongo/client.js';
import { signToken } from '../../src/auth/jwt.js';

describe('API: Activity & Admin Aggregation (§9.6)', () => {
  let db: MemoryDatabaseClient;
  let mongo: MemoryMongoClient;
  let app: any;
  let request: supertest.SuperTest<supertest.Test>;

  const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const studentId = '22222222-2222-2222-2222-222222222222';
  const adminId = '11111111-1111-1111-1111-111111111111';
  const viewerId = '33333333-3333-3333-3333-333333333333';

  let tokenAdmin: string;
  let tokenViewer: string;

  beforeEach(async () => {
    db = new MemoryDatabaseClient();
    mongo = new MemoryMongoClient();
    setDbClient(db);
    setMongoClient(mongo);

    tokenAdmin = signToken({
      userId: adminId,
      tenantId,
      role: 'admin',
      email: 'admin@org.com',
    });

    tokenViewer = signToken({
      userId: viewerId,
      tenantId,
      role: 'viewer',
      email: 'viewer@org.com',
    });

    app = buildApp();
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/students/:id/activity returns events scoped to tenant and student', async () => {
    const eventsCol = mongo.getDb().collection('events');

    // Insert 2 events for student
    await eventsCol.insertOne({
      eventId: crypto.randomUUID(),
      type: 'attempt.succeeded',
      tenantId,
      studentId,
      attemptId: crypto.randomUUID(),
      requestId: 'req_1',
      occurredAt: new Date(Date.now() - 10000),
      metadata: { competencyKey: 'frontend', score: 85 },
    });

    await eventsCol.insertOne({
      eventId: crypto.randomUUID(),
      type: 'attempt.succeeded',
      tenantId,
      studentId,
      attemptId: crypto.randomUUID(),
      requestId: 'req_2',
      occurredAt: new Date(),
      metadata: { competencyKey: 'backend', score: 90 },
    });

    // Insert 1 event for a different student
    await eventsCol.insertOne({
      eventId: crypto.randomUUID(),
      type: 'attempt.succeeded',
      tenantId,
      studentId: 'other-student',
      attemptId: crypto.randomUUID(),
      requestId: 'req_3',
      occurredAt: new Date(),
      metadata: { competencyKey: 'databases', score: 70 },
    });

    const res = await request
      .get(`/api/students/${studentId}/activity`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].metadata.competencyKey).toBe('backend');
    expect(res.body.page.limit).toBe(20);
  });

  it('GET /api/admin/events/duplicates requires admin role', async () => {
    const res = await request
      .get('/api/admin/events/duplicates')
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/admin/events/duplicates returns duplicate and rejection statistics', async () => {
    const eventsCol = mongo.getDb().collection('events');

    // Add 10 succeeded events and 1 rejected event
    for (let i = 0; i < 9; i++) {
      await eventsCol.insertOne({
        eventId: crypto.randomUUID(),
        type: 'attempt.succeeded',
        tenantId,
        studentId,
        attemptId: null,
        requestId: `req_s_${i}`,
        occurredAt: new Date(),
        metadata: {},
      });
    }

    await eventsCol.insertOne({
      eventId: crypto.randomUUID(),
      type: 'attempt.rejected',
      tenantId,
      studentId,
      attemptId: null,
      requestId: 'req_rejected',
      occurredAt: new Date(),
      metadata: { reason: 'Invalid signature' },
    });

    const res = await request
      .get('/api/admin/events/duplicates')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const tenantStat = res.body.find((s: any) => s.tenantId === tenantId);
    expect(tenantStat).toBeDefined();
    expect(tenantStat.succeeded).toBe(9);
    expect(tenantStat.rejected).toBe(1);
    expect(tenantStat.rejectionRate).toBe(0.1);
  });
});
