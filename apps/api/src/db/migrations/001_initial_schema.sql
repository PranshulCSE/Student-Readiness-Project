-- Enable UUID and CITEXT extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============ TENANTS ============
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('active','suspended','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ USERS ============
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  email         CITEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','evaluator','viewer')),
  status        TEXT NOT NULL CHECK (status IN ('active','disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ============ STUDENTS ============
CREATE TABLE IF NOT EXISTS students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  full_name   TEXT NOT NULL,
  email       CITEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('active','archived')),
  version     INTEGER NOT NULL DEFAULT 1,     -- optimistic locking
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_students_tenant_status ON students(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_students_tenant_name   ON students(tenant_id, full_name);

-- ============ COMPETENCIES ============
CREATE TABLE IF NOT EXISTS competencies (
  key         TEXT PRIMARY KEY,     -- 'frontend','backend','databases','problem_solving'
  weight      NUMERIC(5,4) NOT NULL,
  required    BOOLEAN NOT NULL DEFAULT true,
  label       TEXT NOT NULL,
  CONSTRAINT weights_sum CHECK (weight > 0 AND weight <= 1)
);

-- Seed competencies
INSERT INTO competencies(key, weight, required, label) VALUES
  ('frontend',        0.30, true, 'Frontend'),
  ('backend',         0.30, true, 'Backend'),
  ('databases',       0.25, true, 'Databases'),
  ('problem_solving', 0.15, true, 'Problem Solving')
ON CONFLICT (key) DO UPDATE SET
  weight = EXCLUDED.weight,
  required = EXCLUDED.required,
  label = EXCLUDED.label;

-- ============ ATTEMPTS ============
CREATE TABLE IF NOT EXISTS attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  competency_key TEXT NOT NULL REFERENCES competencies(key),
  score          NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  evaluator_id   UUID NOT NULL REFERENCES users(id),
  attempted_at   TIMESTAMPTZ NOT NULL,
  voided_at      TIMESTAMPTZ,           -- NULL = active
  voided_by      UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforces "latest non-voided attempt, tie-break by attempt id"
CREATE INDEX IF NOT EXISTS idx_attempts_latest
  ON attempts(tenant_id, student_id, competency_key, attempted_at DESC, id DESC)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(tenant_id, student_id);

-- ============ IDEMPOTENCY ============
CREATE TABLE IF NOT EXISTS idempotency_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  idempotency_key     TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,         -- sha256(method+path+body)
  response_status     INT  NOT NULL,
  response_body       JSONB NOT NULL,
  resource_id         UUID,                  -- e.g. attempt id
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_idem_expiry ON idempotency_records(expires_at);

-- ============ OUTBOX (Relational → Mongo bridge) ============
CREATE TABLE IF NOT EXISTS outbox_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  aggregate_id  UUID NOT NULL,
  event_type    TEXT NOT NULL,               -- 'attempt.succeeded' etc
  payload       JSONB NOT NULL,
  request_id    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','published','failed')),
  attempts      INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at)
  WHERE status = 'pending';
