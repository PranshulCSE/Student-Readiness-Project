# Architecture Decisions & Trade-Offs (DECISIONS.md)

This document records the architectural decisions, structural trade-offs, and remediation strategies implemented in the Student Readiness Evaluation Platform.

---

## 1. Trade-Off 1: Dual Store (PostgreSQL for Truth + MongoDB for Events) vs. Single Store

### Context
The platform requires ACID relational guarantees for students, attempts, evaluations, and idempotency, alongside an immutable, high-throughput audit log of operational events subject to analytical aggregations (e.g. rejection rate analytics).

### Decision
Use **PostgreSQL 15** as the authoritative source of relational truth with strong transaction guarantees, foreign keys, and unique indexes, coupled with an asynchronous **Transactional Outbox Worker** that replicates committed events to **MongoDB 6**.

### Trade-Off Analysis
- **Benefits**:
  - Eliminates analytical load on the primary transactional database.
  - Relational consistency is preserved: MongoDB is never written to if the relational transaction rolls back.
  - MongoDB's document model and aggregation framework efficiently support arbitrary, non-PII operational event metadata.
- **Costs**:
  - Operational complexity: Requires managing two distinct database engines.
  - Eventual consistency: Events in MongoDB lag slightly behind relational commits (typically < 1000ms under normal worker polling).
  - Outbox poller requires at-least-once delivery guarantees and idempotent consumption via MongoDB's unique index on `eventId`.

---

## 2. Trade-Off 2: HMAC-Signed Cursor Pagination vs. Offset/Limit

### Context
The student directory is accessed by multiple concurrent evaluators and administrators who frequently insert new attempts and students.

### Decision
Implement **keyset/cursor pagination** where cursors encode the student ID and sort value, authenticated with an **HMAC-SHA256 signature** (`config.HMAC_CURSOR_SECRET`).

### Trade-Off Analysis
- **Benefits**:
  - **Stability under concurrent writes**: Avoids phantom skips or duplicate items when new students are inserted while a user navigates between pages.
  - **Performance**: Predictable `O(1)` query execution without expensive `OFFSET N` table scans.
  - **Tamper protection**: The HMAC signature prevents clients from forging cursors to probe arbitrary records.
- **Costs**:
  - Clients cannot jump directly to an arbitrary page number (e.g., "Page 14").
  - Sorting requires tie-breaking on unique columns (`id`) to preserve deterministic ordering.

---

## 3. Trade-Off 3: Optimistic Locking (`version` Column + `If-Match`) vs. Pessimistic Locking

### Context
Student profile updates (`PATCH /api/students/:id`) and attempt recording mutate student versions and timestamps.

### Decision
Adopt **Optimistic Concurrency Control (OCC)** using an integer `version` column in the `students` table, coupled with HTTP `If-Match: <version>` headers on mutation endpoints.

### Trade-Off Analysis
- **Benefits**:
  - Maximizes read scalability and eliminates database row locks during user deliberation.
  - Avoids deadlocks caused by long-running HTTP transactions.
  - Transparent error semantics: Version conflicts return `409 CONFLICT_VERSION` with the current database version, allowing the client to offer a clean resolution UI ("Someone else updated this student, reload?").
- **Costs**:
  - Under high-frequency concurrent edits on the same student record, mutations may fail and require client reload.

---

## 4. Deferred Improvement: Full OpenTelemetry Distributed Tracing & Dead-Letter Queue Alerting

### Context
The platform implements structured JSON logging via Pino with mandatory redaction of sensitive credentials, headers, and PII, alongside request correlation (`x-request-id`).

### Deferred Decision
Implementing full OpenTelemetry tracing collectors and an automated PagerDuty/Slack dead-letter alerting queue for outbox rows with `status = 'failed'` is deferred to post-MVP production deployment.

### Rationale
Current operational logging captures `requestId`, tenant IDs, and error envelopes without introducing additional sidecar infrastructure. The outbox schema includes `attempts` and `last_error` fields, and the `outbox_events` table maintains index `idx_outbox_pending` to support future transition to an external queue (e.g. BullMQ / Kafka) without schema refactoring.

---

## 5. Seeded Defect Remediation: Fast Tenant Switch Race Condition

### Symptom
When an administrator rapidly switches from Tenant A to Tenant B while a student list fetch for Tenant A is in-flight, data belonging to Tenant A briefly rendered in the Tenant B interface.

### Root Cause Analysis
1. **Unscoped Cache Keys**: TanStack Query default queries omitted `tenantId` from query keys, allowing cached records to be reused across tenants.
2. **Missing Network Cancellation**: Switching tenants did not cancel active HTTP requests; when the delayed Tenant A response returned, React Query resolved the active observer with stale data.
3. **Absence of Client-Side Render Guard**: UI components rendered whatever data was returned by the query hook without validating that the payload matched the currently active tenant session.

### Multi-Boundary Fix
We resolved this defect across all architectural trust boundaries:
1. **Server Defense in Depth**: Every SQL query strictly filters by `tenant_id = $1` derived from the verified JWT. Cross-tenant access returns non-disclosing 404 responses.
2. **Client Query Key Scoping**: Query keys strictly include `tenantId`: `['students', tenantId, filters]`.
3. **Query Cancellation & Cache Clearance**: `switchTenant()` invokes `queryClient.cancelQueries()` and `queryClient.clear()`, immediately aborting active HTTP requests and purging cached data.
4. **Synchronous Token Rotation**: `localStorage.setItem('token', ...)` and `setAuthTokenGetter(...)` are updated synchronously so subsequent requests never use previous credentials.
5. **Client Render Guard**: The query hook tags `responseTenantId: tenantId`. The component checks `data.responseTenantId === auth.tenantId` before rendering; mismatched data is immediately dropped.

### Verification & Proof
- **Automated Test**: `apps/web/tests/tenant_switch_race.test.tsx` introduces a 150ms artificial network delay on Tenant A, immediately switches to Tenant B, and asserts that Tenant A's data never renders in the DOM.
- **Server Test**: `apps/api/tests/integration/api_students.test.ts` proves cross-tenant requests return 404 without leaking tenant presence.
