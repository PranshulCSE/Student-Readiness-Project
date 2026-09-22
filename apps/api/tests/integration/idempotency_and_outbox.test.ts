import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import crypto from 'node:crypto';
import { buildApp } from '../../src/server.js';
import { setDbClient, MemoryDatabaseClient } from '../../src/db/client.js';
import { setMongoClient, MemoryMongoClient } from '../../src/mongo/client.js';
import { outboxPublisher } from '../../src/outbox/publisher.js';
import { signToken } from '../../src/auth/jwt.js';

describe('API: Attempt Submission, Idempotency & Outbox (§9.3, §9.4, §9.6)', () => {
  let db: MemoryDatabaseClient;
  let mongo: MemoryMongoClient;
  let app: any;
  let request: supertest.SuperTest<supertest.Test>;

  const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const evaluatorId = '11111111-1111-1111-1111-111111111111';
  const studentId = '22222222-2222-2222-2222-222222222222';

  let tokenEvaluator: string;

  beforeEach(async () => {
    db = new MemoryDatabaseClient();
    mongo = new MemoryMongoClient();
    setDbClient(db);
    setMongoClient(mongo);

    // Seed student
    db.students.set(studentId, {
      id: studentId,
      tenant_id: tenantId,
      full_name: 'Test Student',
      email: 'student@example.com',
      status: 'active',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    tokenEvaluator = signToken({
      userId: evaluatorId,
      tenantId,
      role: 'evaluator',
      email: 'evaluator@example.com',
    });

    app = buildApp();
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('Validation error: score > 100 returns 400 with fieldErrors', async () => {
    const res = await request
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${tokenEvaluator}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        competencyKey: 'frontend',
        score: 105,
        attemptedAt: '2025-01-01T00:00:00Z',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fieldErrors).toBeDefined();
    expect(res.body.error.fieldErrors[0].field).toBe('score');
  });

  it('Happy path attempt creation: writes attempt, bumps version, creates outbox row', async () => {
    const key = crypto.randomUUID();
    const res = await request
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${tokenEvaluator}`)
      .set('Idempotency-Key', key)
      .send({
        competencyKey: 'frontend',
        score: 85,
        attemptedAt: '2025-01-01T00:00:00Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.competencyKey).toBe('frontend');
    expect(res.body.score).toBe(85);
    expect(res.body.studentVersion).toBe(2);
    expect(res.headers['idempotency-replayed']).toBeUndefined();

    // Verify row in attempts
    expect(db.attempts.size).toBe(1);

    // Verify student version bumped
    const student = db.students.get(studentId);
    expect(student.version).toBe(2);

    // Verify pending outbox row
    expect(db.outbox_events.size).toBe(1);
    const outboxRow = Array.from(db.outbox_events.values())[0];
    expect(outboxRow.status).toBe('pending');
    expect(outboxRow.event_type).toBe('attempt.succeeded');

    // Run publisher worker and verify delivery to Mongo
    const publisher = outboxPublisher;
    const publishedCount = await publisher.publishBatch();
    expect(publishedCount).toBe(1);

    // Check outbox row marked published
    expect(outboxRow.status).toBe('published');

    // Check MongoDB has event
    const eventsCol = mongo.getDb().collection('events') as any;
    expect(eventsCol.docs).toHaveLength(1);
    expect(eventsCol.docs[0].eventId).toBe(outboxRow.id);
  });

  it('Idempotency: Replaying exact same request returns stored response with Idempotency-Replayed header', async () => {
    const key = crypto.randomUUID();
    const payload = {
      competencyKey: 'backend',
      score: 90,
      attemptedAt: '2025-01-01T00:00:00Z',
    };

    // First request
    const firstRes = await request
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${tokenEvaluator}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(firstRes.status).toBe(201);
    expect(firstRes.headers['idempotency-replayed']).toBeUndefined();

    // Second request (replay)
    const secondRes = await request
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${tokenEvaluator}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(secondRes.status).toBe(201);
    expect(secondRes.headers['idempotency-replayed']).toBe('true');
    expect(secondRes.body).toEqual(firstRes.body);

    // Only 1 attempt row in DB
    expect(db.attempts.size).toBe(1);
  });

  it('Idempotency: Same key with different payload returns 409 CONFLICT_IDEMPOTENCY', async () => {
    const key = crypto.randomUUID();

    // First request
    await request
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${tokenEvaluator}`)
      .set('Idempotency-Key', key)
      .send({
        competencyKey: 'backend',
        score: 90,
        attemptedAt: '2025-01-01T00:00:00Z',
      });

    // Second request with different body
    const conflictRes = await request
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${tokenEvaluator}`)
      .set('Idempotency-Key', key)
      .send({
        competencyKey: 'backend',
        score: 50, // Different score!
        attemptedAt: '2025-01-01T00:00:00Z',
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe('CONFLICT_IDEMPOTENCY');
  });

  it('Parallel identical POSTs: exactly one attempt row, all return identical response', async () => {
    const key = crypto.randomUUID();
    const payload = {
      competencyKey: 'databases',
      score: 95,
      attemptedAt: '2025-01-01T00:00:00Z',
    };

    // Fire 5 identical requests
    const promises = Array.from({ length: 5 }, () =>
      request
        .post(`/api/students/${studentId}/attempts`)
        .set('Authorization', `Bearer ${tokenEvaluator}`)
        .set('Idempotency-Key', key)
        .send(payload)
    );

    const responses = await Promise.all(promises);

    for (const res of responses) {
      expect(res.status).toBe(201);
      expect(res.body.score).toBe(95);
      expect(res.body.competencyKey).toBe('databases');
    }

    // Exactly 1 attempt in DB
    expect(db.attempts.size).toBe(1);

    // At least 4 responses should have Idempotency-Replayed header (or all after the first)
    const replayed = responses.filter((r) => r.headers['idempotency-replayed'] === 'true');
    expect(replayed.length).toBeGreaterThanOrEqual(4);
  });

  it('Mongo duplicate key resilience: duplicate eventId insert handled safely without crashing', async () => {
    const eventsCol = mongo.getDb().collection('events');

    // Manually insert event into Mongo
    const duplicateEventId = crypto.randomUUID();
    await eventsCol.insertOne({
      eventId: duplicateEventId,
      type: 'attempt.succeeded',
      tenantId,
      studentId,
      attemptId: null,
      requestId: 'req_manual',
      occurredAt: new Date(),
      metadata: {},
    });

    // Create an outbox row with the same eventId
    await db.query(
      `INSERT INTO outbox_events (id, tenant_id, aggregate_id, event_type, payload, request_id, status, attempts, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, now())`,
      [duplicateEventId, tenantId, studentId, 'attempt.succeeded', JSON.stringify({}), 'req_outbox']
    );

    // Run publisher batch
    const publisher = outboxPublisher;
    const count = await publisher.publishBatch();
    expect(count).toBe(1);

    // Outbox row should be marked published
    const outboxRow = db.outbox_events.get(duplicateEventId);
    expect(outboxRow.status).toBe('published');
  });
});
