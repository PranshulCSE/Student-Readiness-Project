import crypto from 'node:crypto';
import { IDatabaseClient } from '../../db/client.js';
import { ConflictIdempotencyError } from '../../domain/errors.js';

export interface IdempotencyRecord {
  id: string;
  tenant_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  response_status: number;
  response_body: any;
  resource_id: string | null;
  expires_at: string;
}

export function computeRequestFingerprint(method: string, path: string, body: any): string {
  const serializedBody = body ? JSON.stringify(body) : '';
  const payload = `${method.toUpperCase()}:${path}:${serializedBody}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class IdempotencyService {
  /**
   * Check if a record exists for this (tenantId, idempotencyKey).
   * Throws ConflictIdempotencyError if fingerprint mismatches.
   * Returns existing record if it matches (replayed).
   * Returns null if no record exists (fresh request).
   */
  static async check(
    db: IDatabaseClient,
    tenantId: string,
    idempotencyKey: string,
    fingerprint: string
  ): Promise<IdempotencyRecord | null> {
    const res = await db.query<IdempotencyRecord>(
      `SELECT id, tenant_id, idempotency_key, request_fingerprint, response_status, response_body, resource_id, expires_at
       FROM idempotency_records
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantId, idempotencyKey]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const record = res.rows[0];

    // Verify fingerprint
    if (record.request_fingerprint !== fingerprint) {
      throw new ConflictIdempotencyError(
        'Idempotency key has already been used with different request parameters'
      );
    }

    return record;
  }

  /**
   * Record response for the idempotency key (called inside the relational transaction).
   */
  static async save(
    db: IDatabaseClient,
    params: {
      tenantId: string;
      idempotencyKey: string;
      fingerprint: string;
      responseStatus: number;
      responseBody: any;
      resourceId?: string | null;
      ttlHours?: number;
    }
  ): Promise<void> {
    const id = crypto.randomUUID();
    const ttlHours = params.ttlHours || 24;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

    await db.query(
      `INSERT INTO idempotency_records (
        id, tenant_id, idempotency_key, request_fingerprint,
        response_status, response_body, resource_id, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
      [
        id,
        params.tenantId,
        params.idempotencyKey,
        params.fingerprint,
        params.responseStatus,
        JSON.stringify(params.responseBody),
        params.resourceId || null,
        expiresAt,
      ]
    );
  }
}
