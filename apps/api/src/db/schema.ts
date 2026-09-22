import type { CompetencyKey, Readiness, StudentStatus, UserRole } from '@student-readiness/shared';

export interface TenantRow {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  created_at: Date;
  updated_at: Date;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: 'active' | 'disabled';
  created_at: Date;
}

export interface StudentRow {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  status: StudentStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface CompetencyRow {
  key: CompetencyKey;
  weight: number;
  required: boolean;
  label: string;
}

export interface AttemptRow {
  id: string;
  tenant_id: string;
  student_id: string;
  competency_key: CompetencyKey;
  score: number;
  evaluator_id: string;
  attempted_at: Date;
  voided_at: Date | null;
  voided_by: string | null;
  created_at: Date;
}

export interface IdempotencyRecordRow {
  id: string;
  tenant_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  response_status: number;
  response_body: any;
  resource_id: string | null;
  created_at: Date;
  expires_at: Date;
}

export interface OutboxEventRow {
  id: string;
  tenant_id: string;
  aggregate_id: string;
  event_type: string;
  payload: any;
  request_id: string;
  status: 'pending' | 'published' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: Date;
  published_at: Date | null;
}
