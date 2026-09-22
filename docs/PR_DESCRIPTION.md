# Pull Request: Student Readiness Multi-Tenant Evaluation Platform

## Summary
Implements a production-grade multi-tenant Student Readiness platform for tracking competency evaluations, calculating weighted readiness status, ensuring strict tenant data isolation, and streaming operational audit events via a transactional outbox worker into MongoDB.

---

## Architectural Highlights

1. **Strict Multi-Tenancy & Non-Disclosing Isolation**:
   - Tenant context is strictly extracted from verified JWT tokens (`req.user.tenantId`).
   - Every database query mandates `tenant_id` filtering as its first parameter.
   - Cross-tenant lookups return uniform `404 NOT_FOUND` responses, ensuring zero leakage of resource existence across tenant boundaries.

2. **Transactional Outbox Pattern**:
   - Guarantees that MongoDB events are only published if the PostgreSQL transaction commits successfully.
   - A dedicated poller worker queries pending events with `FOR UPDATE SKIP LOCKED` and inserts them into MongoDB with `eventId` uniqueness deduplication.

3. **Idempotency & Concurrency Safeguards**:
   - `POST /api/students/:id/attempts` enforces `Idempotency-Key` headers with SHA-256 fingerprinting. Replay requests return cached payloads with `Idempotency-Replayed: true`.
   - Optimistic concurrency control via `If-Match: <version>` protects student profile updates and attempt evaluations against lost updates.

4. **Seeded Defect Remediation**:
   - Eliminates tenant switch race conditions using TanStack Query cache key scoping (`['students', tenantId, filters]`), network `AbortController` cancellation, synchronous token rotation, and client-side render guards.

---

## Risk Areas & Mitigations

| Risk Area | Potential Failure Mode | Implemented Mitigation |
|---|---|---|
| **Tenant Isolation** | Data bleeding across organizations via client spoofing | Tenant ID is never read from client body/headers; strictly derived from verified JWT. Cross-tenant GET returns 404 non-disclosing. |
| **Idempotency Race** | Concurrent duplicate requests creating multiple attempt rows | Atomic transaction writes `idempotency_records` in the same transaction. Parallel requests are either serialized or return stored replay. |
| **Outbox Lag** | MongoDB lagging behind PostgreSQL under high load | Poller processes batches of 100 rows with exponential backoff on transient errors and unique index deduplication on `eventId`. |
| **Cursor Invalidation** | Client modifying cursor to probe arbitrary student IDs | Pagination cursors are signed with HMAC-SHA256 (`HMAC_CURSOR_SECRET`); corrupted/tampered cursors return 400 validation error. |

---

## Migration Impact
- **Database**: Adds tables `tenants`, `users`, `students`, `competencies`, `attempts`, `idempotency_records`, `outbox_events`.
- **Seeds**: Pre-seeds 4 required competencies (`frontend` 0.30, `backend` 0.30, `databases` 0.25, `problem_solving` 0.15).
- **Data Backfill**: None required (greenfield).

---

## Observability & Security

- **Pino Structured Logging**: Automatic redaction of `authorization`, `cookie`, `password`, `token`, and `email` paths.
- **Request ID Tracking**: Uniform `x-request-id` header attached to every incoming request and logged across all database operations.
- **Uniform Error Envelope**: Stack traces and raw database errors are strictly suppressed from all API responses.
- **Rate Limiting**: Configured per tenant + user (100 req/min for reads, 20 req/min for mutations).

---

## Rollback Plan

1. **Application Rollback**: Revert deployment image to previous release tag.
2. **Database Rollback**: Execute reversible down migration (`DROP TABLE IF EXISTS outbox_events, idempotency_records, attempts, competencies, students, users, tenants CASCADE;`).
3. **MongoDB Rollback**: Collection `events` is append-only and backwards-compatible.

---

## Verification & Automated Test Results

- **Unit Test Suite**: `apps/api/tests/unit/readiness.test.ts` (13 passed, 100% branch coverage).
- **Database & Tie-Break Suite**: `apps/api/tests/integration/tie_break.test.ts` (3 passed).
- **Tenant Isolation & Security Suite**: `apps/api/tests/integration/api_students.test.ts` (8 passed).
- **Idempotency & Outbox Suite**: `apps/api/tests/integration/idempotency_and_outbox.test.ts` (6 passed).
- **Activity & Aggregation Suite**: `apps/api/tests/integration/activity_and_aggregation.test.ts` (3 passed).
- **Frontend Race Condition Suite**: `apps/web/tests/tenant_switch_race.test.tsx` (1 passed).
- **Frontend UI States Suite**: `apps/web/tests/conflict_ui.test.tsx` (2 passed).
- **Total Tests**: **36 passed out of 36**.
