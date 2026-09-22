# AI_LOG

This document records all AI-assisted engineering actions, prompts, accepted designs, rejected alternatives, and verification steps for defense auditability.

---

## Entry 001 — 2026-09-22
- **Tool:** Antigravity (Gemini 3.8 Flash)
- **Material prompt (verbatim or summarized):** "0. Ground Rules for the Implementing LLM... 14. What the Implementing LLM Must Ask Before Starting"
- **Accepted output:**
  - Monorepo structure using `npm` workspaces (`apps/*`, `packages/*`).
  - Base TypeScript configurations (`tsconfig.base.json`, project-specific `tsconfig.json`).
  - `.env.example` with complete configuration keys.
  - `docker-compose.yml` defining PostgreSQL 15 and MongoDB 6 with health checks.
  - Section 14 pre-implementation questions presented to the human for approval.
- **Rejected output:**
  - Rejected monolithic layout without workspaces.
  - Rejected heavy ORMs (Prisma, TypeORM) in favor of parameterized SQL client abstractions.
- **Verification performed:**
  - Validated Node.js v24 and npm v11 execution in Windows environment.
  - Initialized git repository.
- **Files affected:**
  - `package.json`
  - `tsconfig.base.json`
  - `.gitignore`
  - `.env.example`
  - `docker-compose.yml`
  - `docs/AI_LOG.md`

---

## Entry 002 — 2026-09-22
- **Tool:** Antigravity (Gemini 3.8 Flash)
- **Material prompt (verbatim or summarized):** "The fields you marked as Recommended just use them & Proceed"
- **Accepted output:**
  - Shared package `@student-readiness/shared` defining Zod schemas for competencies, weights, readiness, students, attempts, activity, and error envelopes.
  - Pure domain readiness logic in `apps/api/src/domain/readiness.ts`.
  - Exact boundary thresholds (79.99 vs 80.00, 64.99 vs 65.00, 49.99 vs 50.00) and strict `INCOMPLETE` rule for missing competencies.
  - Comprehensive unit test suite `apps/api/tests/unit/readiness.test.ts`.
- **Rejected output:**
  - Rejected floating-point rounding ambiguities in favor of `round2` with `Number.EPSILON`.
- **Verification performed:**
  - Ran Vitest unit tests: 13/13 passed.
  - Measured test coverage: 100% statements, 100% branches, 100% functions, 100% lines.
- **Files affected:**
  - `packages/shared/src/*`
  - `apps/api/src/domain/*`
  - `apps/api/tests/unit/readiness.test.ts`

---

## Entry 003 — 2026-09-22
- **Tool:** Antigravity (Gemini 3.8 Flash)
- **Material prompt (verbatim or summarized):** Implement PostgreSQL migrations, database client, outbox pattern, idempotency service, Fastify API routes, and integration tests.
- **Accepted output:**
  - DDL migration `001_initial_schema.sql` covering tenants, users, students, competencies, attempts, idempotency_records, and outbox_events.
  - Reference query with SQL tie-breaker: `(attempted_at DESC, id DESC) WHERE voided_at IS NULL`.
  - Transactional outbox writer inside relational transaction; background outbox publisher polling with `SKIP LOCKED` and inserting into MongoDB with `eventId` deduplication.
  - Idempotency service computing SHA-256 fingerprints, returning saved responses with `Idempotency-Replayed: true` or `409 CONFLICT_IDEMPOTENCY`.
  - Fastify server with Pino logging redaction, rate limiting, and standard error envelopes.
  - Integration test suites covering tie-breaks, student isolation (404 non-disclosing), optimistic concurrency (If-Match), idempotency parallel race safety, and MongoDB aggregation.
- **Rejected output:**
  - Rejected writing directly to MongoDB inside API mutation endpoints before PostgreSQL commit succeeded.
  - Rejected client-supplied tenant ID; strictly extracted tenant from verified JWT claims.
- **Verification performed:**
  - Executed Vitest integration suites: 33/33 tests passed across 5 test files.
- **Files affected:**
  - `apps/api/src/db/*`
  - `apps/api/src/mongo/*`
  - `apps/api/src/outbox/*`
  - `apps/api/src/auth/*`
  - `apps/api/src/modules/*`
  - `apps/api/src/middleware/*`
  - `apps/api/src/server.ts`
  - `apps/api/tests/integration/*`

---

## Entry 004 — 2026-09-22
- **Tool:** Antigravity (Gemini 3.8 Flash)
- **Material prompt (verbatim or summarized):** Implement React 18 web application, URL-persisted filter state, UI state views, and fix seeded tenant switch race condition defect.
- **Accepted output:**
  - Typed client `apiClient` strictly validating all API responses against shared Zod schemas at runtime.
  - React Router v6 pages (`StudentsListPage`, `StudentDetailPage`, `AdminEventsPage`).
  - URL-persisted query state via `useSearchParams`.
  - Remediation of seeded tenant switch defect across all boundaries:
    - TanStack Query cache key scoping (`['students', tenantId, filters]`).
    - Query cancellation via `AbortController` and cache clearing on tenant switch.
    - Synchronous token rotation in `switchTenant`.
    - Component render guard verifying `responseTenantId === auth.tenantId`.
  - Automated test `apps/web/tests/tenant_switch_race.test.tsx` simulating slow Tenant A response and proving Tenant A data never renders in Tenant B view.
- **Rejected output:**
  - Rejected untyped `any` casting on HTTP responses.
  - Rejected implicit tenant state without query cancellation.
- **Verification performed:**
  - Production build `tsc && vite build` succeeded (0 errors).
  - Frontend test suites `tenant_switch_race.test.tsx` and `conflict_ui.test.tsx` passed.
- **Files affected:**
  - `apps/web/src/api/client.ts`
  - `apps/web/src/context/AuthContext.tsx`
  - `apps/web/src/features/*`
  - `apps/web/src/components/*`
  - `apps/web/src/pages/*`
  - `apps/web/tests/*`

---

## Entry 005 — 2026-09-22
- **Tool:** Antigravity (Gemini 3.8 Flash)
- **Material prompt (verbatim or summarized):** Finalize documentation (README, DECISIONS, PR_DESCRIPTION, API) and run complete test verification.
- **Accepted output:**
  - Created `docs/README.md`, `docs/DECISIONS.md`, `docs/PR_DESCRIPTION.md`, `docs/API.md`, and updated `docs/AI_LOG.md`.
  - Full test run verified across all monorepo workspaces: 36 tests passed (100% success).
- **Rejected output:**
  - None.
- **Verification performed:**
  - Full suite run: `npm test` exited with code 0.
- **Files affected:**
  - `docs/*`

---

## Entry 006 — 2026-09-22
- **Tool:** Antigravity (Gemini 3.8 Flash)
- **Material prompt (verbatim or summarized):** Fix Node.js 24 ESM runtime SyntaxError on `npm run dev:api` where type-only exports like `CompetencyKey` caused module instantiation failures.
- **Accepted output:**
  - Converted all pure TypeScript type and interface imports across `apps/api` to `import type` and `export type` syntax.
  - Enabled Fastify listener auto-start in `apps/api/src/server.ts` when running in non-test mode (`process.env.NODE_ENV !== 'test'`).
  - Rebuilt all workspaces (`npm run build`) and verified API server boots up cleanly.
- **Rejected output:**
  - Rejected emitting dummy runtime JavaScript objects for TypeScript types in `@student-readiness/shared`; maintained clean type erasure with standard `import type` semantics.
- **Verification performed:**
  - Verified `node -e "import('./apps/api/dist/server.js')"` starts and logs successfully.
  - Executed full test suite `npm test`: all 36 tests passed.
- **Files affected:**
  - `apps/api/src/auth/jwt.ts`
  - `apps/api/src/auth/rbac.ts`
  - `apps/api/src/auth/tenant.ts`
  - `apps/api/src/db/schema.ts`
  - `apps/api/src/domain/errors.ts`
  - `apps/api/src/domain/readiness.ts`
  - `apps/api/src/domain/weights.ts`
  - `apps/api/src/middleware/errorHandler.ts`
  - `apps/api/src/modules/activity/service.ts`
  - `apps/api/src/modules/attempts/service.ts`
  - `apps/api/src/modules/students/repository.ts`
  - `apps/api/src/modules/students/service.ts`
  - `apps/api/src/mongo/collections.ts`
  - `apps/api/src/server.ts`
  - `docs/AI_LOG.md`

