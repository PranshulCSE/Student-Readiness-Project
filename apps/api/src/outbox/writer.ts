import crypto from 'node:crypto';
import { IDatabaseClient } from '../db/client.js';

export interface WriteOutboxEventParams {
  tenantId: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  requestId: string;
  eventId?: string;
}

export async function writeOutboxEvent(
  db: IDatabaseClient,
  params: WriteOutboxEventParams
): Promise<string> {
  const eventId = params.eventId || crypto.randomUUID();

  await db.query(
    `INSERT INTO outbox_events (
      id, tenant_id, aggregate_id, event_type, payload, request_id, status, attempts, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, now())`,
    [
      eventId,
      params.tenantId,
      params.aggregateId,
      params.eventType,
      JSON.stringify(params.payload),
      params.requestId,
    ]
  );

  return eventId;
}
