# Student Readiness Evaluation Platform

A robust, multi-tenant evaluation and readiness certification platform engineered with Node.js 20, TypeScript, Fastify, PostgreSQL 15, MongoDB 6, and React 18.

---

## Architecture Overview

```
                      +-----------------------------+
                      |     React 18 + Vite (SPA)   |
                      |  - TanStack Query (Keyed)   |
                      |  - Render Guard on Tenant   |
                      |  - Idempotency-Key per Form |
                      +--------------+--------------+
                                     |
                          HTTPS / Authorization
                                     v
                      +-----------------------------+
                      |    Fastify API Gateway      |
                      |  - JWT Tenant Derivation    |
                      |  - Rate Limiting (Tenant/IP)|
                      |  - HMAC Signed Cursors      |
                      |  - Pino Log Redaction       |
                      +--------------+--------------+
                                     |
                 +-------------------+-------------------+
                 |                                       |
    Relational Writes (ACID)                 Read Operational Audit
                 v                                       v
+--------------------------------+       +--------------------------------+
|        PostgreSQL 15           |       |           MongoDB 6            |
|  - tenants                     |       |  - db.events (Append-only)     |
|  - users                       |       |  - Unique Index: { eventId: 1 }|
|  - students (version lock)     |       |  - Aggregation: duplicates &   |
|  - competencies (seeded)       |       |    rejection rates per tenant  |
|  - attempts (score & voiding)  |       +--------------------------------+
|  - idempotency_records         |                       ^
|  - outbox_events (Bridge)      |                       |
+--------------------------------+                       |
                 |                                       |
                 +-----------> Outbox Publisher ---------+
                               (SKIP LOCKED Poller)
```

---

## System Capabilities & Compliance

1. **Strict Tenant Isolation**: Tenant ID is derived exclusively from verified JWT session claims (`req.user.tenantId`). Clients cannot specify or override tenant identity. Cross-tenant access returns non-disclosing 404 responses (`{ "error": { "code": "NOT_FOUND", "message": "Resource not found" } }`).
2. **Transactional Outbox Pattern**: Relational commits and MongoDB operational event inserts never attempt two-phase commits. Mutations insert into PostgreSQL `outbox_events` within the relational transaction. The background worker polls with `FOR UPDATE SKIP LOCKED` and publishes to MongoDB with `eventId` deduplication.
3. **Idempotency & Concurrency Protection**:
   - `POST /api/students/:id/attempts` requires an `Idempotency-Key` header and calculates a SHA-256 fingerprint (`sha256(method:path:body)`).
   - Replayed requests return the saved response body and status code with `Idempotency-Replayed: true`.
   - Fingerprint mismatches return `409 CONFLICT_IDEMPOTENCY`.
   - Optimistic concurrency (`version` column and `If-Match` header) guards against concurrent overwrite with `409 CONFLICT_VERSION`.
4. **Pure Domain Logic**:
   - Evaluates weighted competencies: Frontend (30%), Backend (30%), Databases (25%), Problem Solving (15%).
   - Missing competencies immediately produce readiness `INCOMPLETE` with `overallScore: null`.
   - Threshold boundaries: `READY` (≥ 80%), `NEARLY_READY` (≥ 65%), `DEVELOPING` (≥ 50%), `NEEDS_PREPARATION` (< 50%).
5. **Seeded Defect Fixed at All Trust Boundaries**:
   - Fixed fast tenant-switching races via TanStack Query cache key scoping (`['students', tenantId, filters]`), request cancellation via `AbortController`, synchronous token rotation, and client-side render guards.

---

## Quickstart & Setup

### Prerequisites
- Node.js 20+ (Node v24 supported)
- npm 10+ or pnpm
- Docker & Docker Compose (optional for local DBs; automated test harnesses run offline)

### 1. Start Database Infrastructure (Optional)
```bash
docker compose up -d
```
Starts PostgreSQL 15 on port `5432` and MongoDB 6 on port `27017`.

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Install Dependencies & Build
```bash
npm install
npm run build
```

### 4. Run Test Suites
```bash
# Run all unit and integration tests across monorepo
npm test

# Run API test coverage (branch coverage 100% on domain logic)
npm run test:coverage --workspace=apps/api
```

### 5. Launch Development Servers
```bash
# Start backend API (Fastify) on http://localhost:3000
npm run dev:api

# Start frontend web app (Vite + React) on http://localhost:5173
npm run dev:web
```

---

## API Summary

| Method | Endpoint | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate user & issue tenant-scoped JWT |
| `GET` | `/api/students` | Authenticated | List students with filters, cursor pagination, and readiness |
| `GET` | `/api/students/:id` | Authenticated | Fetch student profile and latest attempt per competency |
| `PATCH` | `/api/students/:id` | Admin (`If-Match`) | Optimistically locked update of `fullName`, `email`, `status` |
| `POST` | `/api/students/:id/attempts` | Evaluator / Admin | Submit competency assessment with `Idempotency-Key` |
| `GET` | `/api/students/:id/activity` | Authenticated | Retrieve student audit trail from MongoDB event store |
| `GET` | `/api/admin/events/duplicates` | Admin | Aggregate duplicate event delivery and rejection rates |

For full request/response schemas, error envelopes, and examples, refer to [docs/API.md](file:///c:/Projects/Student-Readiness/docs/API.md).
