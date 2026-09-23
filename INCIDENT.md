# Production Incident Report — 2026-09-22 10:12 UTC

| Field              | Value                                                                  |
|--------------------|------------------------------------------------------------------------|
| Severity           | **SEV-1** — data integrity violation + cross-tenant data leak          |
| Status             | Active — containment in progress                                       |
| Trigger            | Deployment completed at **10:05 UTC**                                  |
| First alert        | Tenant `t-blue` reported duplicate attempt at **10:12 UTC**            |
| Incident Commander | *(to be assigned)*                                                     |
| Related Deployment | 10:05 UTC release (cache key format change)                            |

---

## 1. Observed Symptoms

| # | Symptom                                                    | Reporter     |
|---|------------------------------------------------------------|--------------|
| S1 | A single click created **two** attempt records (id 991, 992) | Tenant `t-blue` |
| S2 | Dashboard score changed 78 → 84, then settled at 81 after refresh | Tenant `t-blue` |
| S3 | A student name from **another tenant** appeared briefly      | Tenant `t-green` |

---

## 2. Facts (Evidence from Logs, Schema, and Source Code)

### F1 — Duplicate Request Admission (Idempotency Failure)

| Fact | Evidence |
|------|----------|
| Two requests carried the **same** idempotency key `k-778` for the same student `s44` | Log lines: `req=a91 … key=k-778` and `req=b03 … key=k-778`, both at 10:12:01 |
| Both requests were admitted and **both committed** to the `attempts` table | `req=a91 sql attempt.insert id=991 committed` (10:12:01.182) and `req=b03 sql attempt.insert id=992 committed` (10:12:01.190) |
| The idempotency check (`IdempotencyService.check`) is a `SELECT … WHERE tenant_id = $1 AND idempotency_key = $2` **without** `SELECT … FOR UPDATE` and the table has **no unique constraint** on `(tenant_id, idempotency_key)` | [service.ts L35-40](file:///c:/Projects/Student-Readiness/apps/api/src/modules/idempotency/service.ts#L35-L40) — plain `SELECT`; schema fact states "no unique constraint" |
| The idempotency record is saved via a plain `INSERT` inside the same transaction **after** the attempt insert | [service.ts L77-92](file:///c:/Projects/Student-Readiness/apps/api/src/modules/idempotency/service.ts#L77-L92) |
| **Root cause**: With no unique constraint and no `FOR UPDATE` / advisory lock, two near-simultaneous requests both see zero rows from `check()`, both proceed to insert an attempt, and both insert separate idempotency records. This is a classic TOCTOU (time-of-check-time-of-use) race condition. | Timing gap between the two requests is only **17 ms** (10:12:01.102 → 10:12:01.119), well within the window for both `SELECT`s to complete before either `INSERT` commits. |

### F2 — Score Fluctuation (Phantom Readiness Calculation)

| Fact | Evidence |
|------|----------|
| Readiness is computed **inside the attempt-submission transaction** by reading all latest non-voided attempts | [attempts/service.ts L110-121](file:///c:/Projects/Student-Readiness/apps/api/src/modules/attempts/service.ts#L110-L121) |
| Each of the two concurrent transactions reads **different attempt sets**: `req=a91` sees one set; `req=b03` sees another (possibly including `a91`'s uncommitted row under `READ COMMITTED`, or not, depending on timing) | Explains the 78 → 84 → 81 oscillation; one response computes the score with the duplicate included, the other without |
| On refresh the dashboard recalculates from the now-committed state which includes the duplicate attempt, yielding **81** — a value different from both the original (78) and the transient (84) | Readiness computation uses `DISTINCT ON (competency_key)` with tie-break `(attempted_at DESC, id DESC)` — a duplicate attempt for the same competency may produce a different "latest" attempt winner depending on `id` ordering ([repository.ts L82-89](file:///c:/Projects/Student-Readiness/apps/api/src/modules/students/repository.ts#L82-L89)) |
| The `attempts` table only has an index on `student_id` — **not** `(tenant_id, student_id, competency_key)` — meaning the `DISTINCT ON` query also lacks an optimal index for correctness/performance | Schema fact: "attempts has an index on student_id only" |

### F3 — Cross-Tenant Data Leak (Cache Key Collision)

| Fact | Evidence |
|------|----------|
| The deployment at 10:05 UTC **shortened the cache key** from `tenantId:status:page` → `status` only | Schema/deployment fact: "The new cache key was shortened from tenantId:status:page to status" |
| A `GET /students?status=READY` by tenant `t-green` hit the cache (`cache=hit cacheKey=students:READY`) | Log: `req=c10 tenant=t-green GET /students?status=READY cache=hit cacheKey=students:READY` |
| The response **must have been cached by a prior request from a different tenant** (e.g., `t-blue`), because `t-green` saw a student name that was not theirs | With key `students:READY`, every tenant reading `status=READY` shares the same cache slot |
| **Root cause**: Removing `tenantId` from the cache key collapsed all tenants' data into a single cache entry. This is a **cross-tenant information disclosure** — a security incident. | The `studentsRoutes` handler passes `tenantId` to the service layer, but the cache sits upstream and does not incorporate it into the key |

### F4 — Silent MongoDB Event Loss

| Fact | Evidence |
|------|----------|
| `req=b03`'s MongoDB write **timed out** | Log: `req=b03 mongo event.insert eventId=e-992 timeout` |
| The request still returned **201** despite the MongoDB failure | Log: `req=b03 response=201 attemptId=992` |
| The code awaits the MongoDB write but **catches and logs** the error, swallowing it | Deployment fact: "The MongoDB write is awaited, but its error is caught and only logged" |
| The application uses a **transactional outbox** pattern: events are written to `outbox_events` inside the SQL transaction and later published to MongoDB by `OutboxPublisher` | [writer.ts](file:///c:/Projects/Student-Readiness/apps/api/src/outbox/writer.ts), [publisher.ts](file:///c:/Projects/Student-Readiness/apps/api/src/outbox/publisher.ts) |
| However, the **direct** MongoDB write in the attempt-submission path (the one that timed out) appears to be a **separate, non-outbox write** — meaning `e-992` may now be permanently missing from MongoDB unless the outbox publisher separately re-delivers it | The log shows `mongo event.insert` as a distinct step from the SQL outbox insert, and the publisher uses `eventId: row.id` (the outbox event's UUID), not the same `e-992` event ID |

---

## 3. Independent Failure Root Causes

### RC1 — Idempotency Race Condition
The `idempotency_records` table lacks a `UNIQUE` constraint on `(tenant_id, idempotency_key)`. The `check()` method performs a plain `SELECT` (no locking) before the `save()` `INSERT`. Under concurrent requests with the same key, both selects return empty, and both inserts succeed.

**Maps to symptoms**: S1 (duplicate attempt), S2 (score fluctuation due to phantom data).

### RC2 — Cache Key Missing Tenant Scope
The 10:05 deployment changed cache keys from `tenantId:status:page` → `status`, eliminating tenant isolation at the cache layer.

**Maps to symptom**: S3 (cross-tenant data leak).

### RC3 — Swallowed MongoDB Error
The direct MongoDB event insert error is caught and only logged, allowing the request to succeed (201) even when the event was not persisted. This means the activity feed and any downstream consumers miss the event.

**Maps to symptom**: S1 (event `e-992` may be lost); also a latent reliability issue for all events.

---

## 4. Immediate Containment (First 15 Minutes)

Execute these actions **in the order listed**. Safest-to-most-impactful ordering ensures we stop bleeding before touching data.

### Minute 0–3: Stop the cross-tenant leak (S3 — highest severity)

1. **Flush the entire cache** (Redis/in-memory) immediately:
   ```bash
   # If Redis:
   redis-cli FLUSHDB
   # Or invalidate all keys matching students:*
   redis-cli --scan --pattern "students:*" | xargs redis-cli DEL
   ```
2. **Rollback the cache key change** — redeploy the previous version's cache key format (`tenantId:status:page`) or hotfix the cache key construction to re-include `tenantId`. If a config flag exists, toggle it. Otherwise, **disable caching entirely** as a stopgap.
3. **Notify affected tenants** — begin drafting a security disclosure for `t-green` (and any other tenants who may have received cross-tenant data). Engage the security/privacy team.

### Minute 3–8: Stop duplicate creation (S1)

4. **Add the unique constraint on `idempotency_records`** (non-blocking in PostgreSQL):
   ```sql
   -- This will fail any in-flight duplicates immediately
   ALTER TABLE idempotency_records
     ADD CONSTRAINT uq_idempotency_tenant_key
     UNIQUE (tenant_id, idempotency_key);
   ```
   > **Note**: If duplicate rows already exist, this `ALTER` will fail. In that case, first deduplicate (see Section 6), then apply the constraint.

5. If the constraint cannot be applied immediately due to existing duplicates, **enable a feature flag to serialize attempt submissions** (e.g., add an advisory lock on `(tenant_id, idempotency_key)` hash) or **rate-limit POST /students/:id/attempts to 1 concurrent request per student per tenant**.

### Minute 8–12: Assess data damage scope

6. **Run duplicate detection queries** (read-only, see Section 6) to quantify how many duplicate attempts were created since 10:05.
7. **Check for orphaned MongoDB events**:
   ```sql
   SELECT id, tenant_id, status, last_error
   FROM outbox_events
   WHERE status IN ('pending', 'failed')
   ORDER BY created_at DESC
   LIMIT 100;
   ```

### Minute 12–15: Communicate and stabilize

8. **Post incident status** to internal channels with:
   - Scope: cache leak neutralized, duplicate creation blocked.
   - Impact: N tenants potentially affected by cross-tenant data, M duplicate attempts identified.
   - ETA for durable fix: outline the plan from Section 5.
9. **Verify containment**: confirm no new duplicates are being created (monitor the idempotency constraint for violation errors) and no cache entries exist without tenant scoping.

---

## 5. Durable Corrections

### 5.1 Idempotency — Atomic Duplicate Prevention

**Problem**: TOCTOU race in `IdempotencyService.check()` → `IdempotencyService.save()`.

**Fix (two layers)**:

1. **Database constraint** (defense-in-depth):
   ```sql
   ALTER TABLE idempotency_records
     ADD CONSTRAINT uq_idempotency_tenant_key
     UNIQUE (tenant_id, idempotency_key);
   ```

2. **Application-level: move to INSERT … ON CONFLICT** in [`attempts/service.ts`](file:///c:/Projects/Student-Readiness/apps/api/src/modules/attempts/service.ts):

   Replace the current check-then-insert pattern with an atomic approach:
   ```typescript
   // Inside the transaction, BEFORE inserting the attempt:
   const lockResult = await tx.query(
     `INSERT INTO idempotency_records (id, tenant_id, idempotency_key, request_fingerprint,
        response_status, response_body, resource_id, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      ON CONFLICT (tenant_id, idempotency_key)
      DO NOTHING
      RETURNING id`,
     [id, tenantId, idempotencyKey, fingerprint, null, null, null, expiresAt]
   );
   if (lockResult.rows.length === 0) {
     // Key already exists — fetch and replay
     const existing = await IdempotencyService.check(tx, tenantId, idempotencyKey, fingerprint);
     return { statusCode: existing!.response_status, data: existing!.response_body, isReplayed: true };
   }
   // Proceed with attempt insert, then UPDATE the idempotency record with the real response
   ```

   This makes the idempotency claim atomic: the first transaction to insert wins; the second gets `DO NOTHING` and replays.

3. **Add a composite index** on `attempts` to support efficient duplicate detection and the `DISTINCT ON` query:
   ```sql
   CREATE INDEX idx_attempts_tenant_student_comp
     ON attempts (tenant_id, student_id, competency_key, attempted_at DESC, id DESC);
   ```

### 5.2 Cache Isolation — Tenant-Scoped Keys

**Problem**: Cache key `status` is shared across all tenants.

**Fix**:

1. **Restore tenant-scoped cache keys**: Every cache key **must** include `tenantId` as the first segment:
   ```
   cache key format: {tenantId}:{entity}:{status}:{page}
   example:          t-blue:students:READY:1
   ```

2. **Add a code review rule / lint check**: cache key construction must use a helper function that requires `tenantId`:
   ```typescript
   function cacheKey(tenantId: string, ...segments: string[]): string {
     if (!tenantId) throw new Error('tenantId is required for cache keys');
     return [tenantId, ...segments].join(':');
   }
   ```

3. **Add an integration test** that asserts two different tenants with the same query parameters receive different cache keys and different data.

### 5.3 Score Recomputation — Eliminate Phantom Scores

**Problem**: Duplicate attempts cause incorrect readiness scores.

**Fix**:

1. After deduplication (Section 6), **recompute all affected students' scores**:
   ```sql
   -- Identify students with duplicate attempts
   SELECT DISTINCT student_id, tenant_id
   FROM attempts
   WHERE id IN (
     SELECT id FROM (
       SELECT id, tenant_id, student_id, competency_key, score, attempted_at,
             ROW_NUMBER() OVER (
               PARTITION BY tenant_id, student_id, competency_key, score, attempted_at
               ORDER BY id
             ) AS rn
       FROM attempts
       WHERE created_at >= '2026-09-22T10:05:00Z'
     ) dupes WHERE rn > 1
   );
   ```

2. Readiness is already computed on-the-fly from attempts (not stored as a materialized column), so once duplicates are voided (Section 6), scores will self-correct on next request. **No separate recomputation step is needed** beyond voiding duplicates — the [`computeReadiness()`](file:///c:/Projects/Student-Readiness/apps/api/src/domain/readiness.ts#L16-L44) function always reads from the latest non-voided attempts via [`getLatestAttemptsForStudent()`](file:///c:/Projects/Student-Readiness/apps/api/src/modules/students/repository.ts#L77-L93).

3. **Invalidate all cache entries for affected tenants** after voiding duplicates, so cached stale scores are evicted.

### 5.4 Event Reliability — Eliminate Silent Loss

**Problem**: The direct MongoDB write error is swallowed; event `e-992` may be permanently lost.

**Fix**:

1. **Remove the direct MongoDB write from the request path**. The application already has a transactional outbox (`outbox_events` → `OutboxPublisher`). The direct Mongo insert is redundant and dangerous — it creates a dual-write that can diverge. All event delivery should go through the outbox exclusively.

2. If the direct Mongo write must remain (e.g., for latency on the activity feed), **change error handling to fail the request** (return 500 or 503) when the Mongo write fails, or at minimum enqueue a compensating outbox event:
   ```typescript
   try {
     await eventsCol.insertOne({ ... });
   } catch (err) {
     // Ensure the outbox will re-deliver this event
     logger.error('Direct Mongo write failed, relying on outbox', { eventId, err });
     // The outbox event was already written in the SQL transaction — no action needed
     // but we must NOT swallow this silently
     metrics.increment('mongo.direct_write.failure');
   }
   ```

3. **Add a MongoDB write-concern and timeout configuration** that prevents indefinite hangs:
   ```typescript
   await eventsCol.insertOne(doc, {
     writeConcern: { w: 'majority', wtimeout: 2000 },
   });
   ```

4. **Add an outbox lag alert**: if `outbox_events` with `status = 'pending'` and `created_at < NOW() - INTERVAL '5 minutes'` exceeds a threshold, fire an alert.

---

## 6. Safe Data-Repair Approach

> **Principle**: Identify and **void** duplicates; never delete rows. This preserves the audit trail and avoids losing valid attempts.

### Step 1: Identify Duplicate Attempts (Read-Only)

```sql
-- Find attempts that share (tenant_id, student_id, competency_key, score, attempted_at)
-- created since the deployment, which indicates a duplicate from the idempotency bug
SELECT
  a.id AS attempt_id,
  a.tenant_id,
  a.student_id,
  a.competency_key,
  a.score,
  a.attempted_at,
  a.created_at,
  ir.idempotency_key,
  ROW_NUMBER() OVER (
    PARTITION BY a.tenant_id, a.student_id, a.competency_key, a.score, a.attempted_at
    ORDER BY a.id ASC   -- keep the first, void the rest
  ) AS rn
FROM attempts a
LEFT JOIN idempotency_records ir
  ON ir.tenant_id = a.tenant_id
  AND ir.resource_id = a.id
WHERE a.created_at >= '2026-09-22T10:05:00Z'
  AND a.voided_at IS NULL
ORDER BY a.tenant_id, a.student_id, a.competency_key, a.attempted_at;
```

Review the output. Rows with `rn > 1` are candidate duplicates.

### Step 2: Cross-Validate with Idempotency Records

```sql
-- Confirm that multiple idempotency records exist for the same key
SELECT tenant_id, idempotency_key, COUNT(*) AS cnt, ARRAY_AGG(resource_id) AS attempt_ids
FROM idempotency_records
WHERE created_at >= '2026-09-22T10:05:00Z'
GROUP BY tenant_id, idempotency_key
HAVING COUNT(*) > 1;
```

Only void attempts that appear in **both** queries (duplicate attempt rows AND duplicate idempotency records for the same key).

### Step 3: Void Duplicates (Keep First, Void Rest)

```sql
-- Dry run: preview what will be voided
SELECT id, tenant_id, student_id, competency_key, score
FROM attempts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, student_id, competency_key, score, attempted_at
             ORDER BY id ASC
           ) AS rn
    FROM attempts
    WHERE created_at >= '2026-09-22T10:05:00Z'
      AND voided_at IS NULL
  ) ranked WHERE rn > 1
);

-- Execute void (soft-delete)
UPDATE attempts
SET voided_at = NOW(),
    voided_by = 'incident-2026-09-22-repair'
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, student_id, competency_key, score, attempted_at
             ORDER BY id ASC
           ) AS rn
    FROM attempts
    WHERE created_at >= '2026-09-22T10:05:00Z'
      AND voided_at IS NULL
  ) ranked WHERE rn > 1
);
```

### Step 4: Clean Up Duplicate Idempotency Records

```sql
-- Remove the duplicate idempotency rows (keep the one with the lower id)
DELETE FROM idempotency_records
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, idempotency_key
             ORDER BY created_at ASC
           ) AS rn
    FROM idempotency_records
    WHERE created_at >= '2026-09-22T10:05:00Z'
  ) ranked WHERE rn > 1
);
```

### Step 5: Reconcile MongoDB Events

```sql
-- Find outbox events for voided attempts that may have been published to Mongo
SELECT oe.id AS outbox_id, oe.tenant_id, oe.aggregate_id AS student_id,
       oe.payload, oe.status
FROM outbox_events oe
JOIN attempts a ON a.id = (oe.payload::json->>'attemptId')::text
WHERE a.voided_at IS NOT NULL
  AND a.voided_by = 'incident-2026-09-22-repair';
```

For any corresponding MongoDB events, insert a compensating `attempt.voided` event via the outbox rather than directly modifying MongoDB.

### Step 6: Invalidate Cache

```bash
# Flush all cache entries for affected tenants
redis-cli --scan --pattern "*" | xargs redis-cli DEL
```

---

## 7. Verification — Tests, Queries, Dashboards, and Alerts

### 7.1 Automated Tests

| Test | Description | Implementation |
|------|-------------|----------------|
| **Idempotency race test** | Send 10 concurrent POST requests with the same `Idempotency-Key`; assert exactly 1 attempt is created | Integration test: use `Promise.all()` to fire concurrent requests in [idempotency_and_outbox.test.ts](file:///c:/Projects/Student-Readiness/apps/api/tests/integration/idempotency_and_outbox.test.ts) |
| **Cache tenant isolation test** | Two tenants query `?status=READY`; assert each sees only their own students | Integration test in [api_students.test.ts](file:///c:/Projects/Student-Readiness/apps/api/tests/integration/api_students.test.ts) |
| **Score stability test** | Submit duplicate attempts concurrently; assert readiness score is deterministic on refresh | Integration test in [activity_and_aggregation.test.ts](file:///c:/Projects/Student-Readiness/apps/api/tests/integration/activity_and_aggregation.test.ts) |
| **MongoDB failure resilience test** | Simulate MongoDB timeout during attempt submission; assert the outbox event exists for later delivery | Unit/integration test with mocked Mongo client |

### 7.2 Verification Queries (Run Post-Repair)

```sql
-- 1. Confirm no duplicate active attempts exist
SELECT tenant_id, student_id, competency_key, score, attempted_at, COUNT(*) AS cnt
FROM attempts
WHERE voided_at IS NULL
  AND created_at >= '2026-09-22T10:05:00Z'
GROUP BY tenant_id, student_id, competency_key, score, attempted_at
HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- 2. Confirm unique constraint is active
SELECT conname FROM pg_constraint
WHERE conrelid = 'idempotency_records'::regclass AND contype = 'u';
-- Expected: uq_idempotency_tenant_key

-- 3. Confirm no pending outbox events older than 5 minutes
SELECT COUNT(*) FROM outbox_events
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '5 minutes';
-- Expected: 0

-- 4. Confirm voided duplicates are marked correctly
SELECT COUNT(*) FROM attempts
WHERE voided_by = 'incident-2026-09-22-repair';
-- Expected: matches the count from Step 3 dry-run
```

### 7.3 Dashboards

| Dashboard | Metric | Purpose |
|-----------|--------|---------|
| **Idempotency Health** | Count of unique-constraint violations per minute on `idempotency_records` | Proves the constraint is catching races; should spike briefly during high concurrency then flatten |
| **Attempt Duplicates** | `SELECT COUNT(*) FROM attempts WHERE voided_by LIKE 'incident%'` trended over time | Shows historical duplicate incidents and confirms they stop after the fix |
| **Cache Key Audit** | Log-based: count of `cache=hit` events grouped by `cacheKey` pattern; alert if any key lacks a tenant prefix | Detects future cache key regressions |
| **Outbox Lag** | Age of oldest `pending` outbox event | Monitors event delivery health |
| **MongoDB Write Errors** | Count of Mongo write timeouts/errors per minute | Early warning for event delivery degradation |

### 7.4 Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `idempotency_duplicate_blocked` | Unique constraint violation rate on `idempotency_records` > 5/min | P3 (info) |
| `cache_key_missing_tenant` | Any cache key set/get without a `tenantId` prefix | **P1 (critical)** — immediate page |
| `outbox_event_lag_critical` | Any `pending` outbox event older than 10 minutes | P2 (high) |
| `outbox_event_failed` | `outbox_events` with `status = 'failed'` count > 0 | P2 (high) |
| `mongo_write_timeout` | MongoDB write timeout rate > 1% of writes in 5-min window | P2 (high) |
| `duplicate_attempt_detected` | Query for `COUNT(*) > 1` on `(tenant_id, student_id, competency_key, score, attempted_at)` in un-voided attempts | **P1 (critical)** |

---

## 8. Missing Evidence and How to Obtain It

| # | Missing Evidence | Why It Matters | How to Obtain |
|---|------------------|----------------|---------------|
| 1 | **Full request logs from 10:05–10:12** for all tenants | Need to quantify total number of duplicate attempts and cross-tenant cache hits since the deployment | Query the centralized log system (e.g., CloudWatch, Datadog, ELK) for `POST /students/*/attempts` with grouped `Idempotency-Key` headers and `cache=hit` events |
| 2 | **The deployment diff / changelog** for the 10:05 release | Confirms whether the cache key change was the only change; may reveal other regressions | Pull the Git diff between the previous and deployed commit hashes |
| 3 | **Cache backend type and configuration** (Redis, in-memory, CDN) | Determines the exact flush/invalidation strategy and whether TTL-based expiry is already in play | Check config files, environment variables, or infrastructure-as-code |
| 4 | **Where the direct MongoDB write occurs** in the request path | The logs show a direct `mongo event.insert` that is separate from the outbox. Need to identify the exact code path that performs this write and why it exists alongside the outbox | Search the codebase for direct `eventsCol.insertOne` or similar calls outside of `OutboxPublisher` |
| 5 | **MongoDB write-concern configuration** | Determines whether the timeout was a connection-level timeout or a write-concern timeout, and whether unacknowledged writes could silently lose data | Check MongoDB connection string parameters and client options |
| 6 | **Tenant `t-green`'s full request/response payload** for the leaked request | Needed for the security incident report to determine exactly what PII was exposed | Pull from access logs with `req=c10` correlation |
| 7 | **Load balancer / API gateway retry behavior** | If the LB retried `req=a91` automatically (creating `req=b03`), the root cause may partly be infrastructure-level, not just client-side | Check LB/gateway access logs for retry headers (`X-Retry-Count`, etc.) |
| 8 | **Whether event `e-992` was eventually delivered by the outbox publisher** | Determines whether there is actual data loss in MongoDB or just a transient direct-write failure | Query: `SELECT * FROM outbox_events WHERE payload::text LIKE '%992%'` and check MongoDB for `eventId` matching the outbox event's UUID |
| 9 | **Client-side code for attempt submission** | Determine whether the client sends duplicate requests on timeout (double-click, retry logic) | Review the frontend code in [apps/web](file:///c:/Projects/Student-Readiness/apps/web) |

---

## 9. Timeline

```
10:05:00  Deployment completed (cache key shortened, other changes TBD)
10:12:01.102  req=a91  POST /students/s44/attempts key=k-778  → admitted
10:12:01.119  req=b03  POST /students/s44/attempts key=k-778  → admitted (RACE)
10:12:01.182  req=a91  attempt.insert id=991 committed
10:12:01.190  req=b03  attempt.insert id=992 committed
10:12:01.207  req=a91  mongo event e-991 → success
10:12:01.211  req=b03  mongo event e-992 → TIMEOUT (event potentially lost)
10:12:01.244  req=b03  response=201 (despite Mongo failure)
10:12:01.249  req=a91  response=201
10:12:04.331  req=c10  t-green GET /students?status=READY → cache=hit (CROSS-TENANT LEAK)
               ↑ Cache contained t-blue's data due to key collision
```

---

## 10. Summary of Required Changes

| Priority | Change | Files Affected | Risk |
|----------|--------|----------------|------|
| **P0** | Flush cache + restore tenant-scoped cache keys | Cache config/middleware | Low — read path only |
| **P0** | Add `UNIQUE (tenant_id, idempotency_key)` constraint | DB migration | Low if deduped first |
| **P1** | Replace check-then-insert with `INSERT ON CONFLICT` | [idempotency/service.ts](file:///c:/Projects/Student-Readiness/apps/api/src/modules/idempotency/service.ts), [attempts/service.ts](file:///c:/Projects/Student-Readiness/apps/api/src/modules/attempts/service.ts) | Medium — changes transactional flow |
| **P1** | Remove direct Mongo write; rely on outbox only | Attempt submission path | Medium — verify outbox latency is acceptable |
| **P1** | Void duplicate attempts (data repair) | DB one-time script | Low — soft-delete only |
| **P2** | Add composite index on `attempts` | DB migration | Low — `CREATE INDEX CONCURRENTLY` |
| **P2** | Add cache-key helper with mandatory `tenantId` | Cache utility module | Low |
| **P2** | Add monitoring dashboards and alerts | Observability config | Low |
| **P3** | Add concurrency integration tests | Test suite | Low |
