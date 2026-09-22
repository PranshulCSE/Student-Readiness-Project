import { getDbClient, IDatabaseClient } from '../db/client.js';
import { getEventsCollection } from '../mongo/collections.js';
import { config } from '../config/index.js';

export class OutboxPublisher {
  private db?: IDatabaseClient;
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(db?: IDatabaseClient) {
    this.db = db;
  }

  private getDb(): IDatabaseClient {
    return this.db || getDbClient();
  }

  private hasLoggedConnWarning = false;

  start(intervalMs?: number): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = intervalMs || config.OUTBOX_POLL_INTERVAL_MS;

    this.intervalTimer = setInterval(async () => {
      try {
        await this.publishBatch();
        this.hasLoggedConnWarning = false;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('ECONNREFUSED')) {
          if (!this.hasLoggedConnWarning) {
            // eslint-disable-next-line no-console
            console.warn('[OutboxPublisher] Database connection refused. Ensure PostgreSQL is running or set USE_MEMORY_DB=true.');
            this.hasLoggedConnWarning = true;
          }
        } else {
          // eslint-disable-next-line no-console
          console.error('Outbox publishing error:', msg);
        }
      }
    }, interval);
  }

  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
  }

  async publishBatch(batchSize: number = config.OUTBOX_BATCH_SIZE): Promise<number> {
    const db = this.getDb();
    const eventsCol = getEventsCollection();

    // Query pending events with SKIP LOCKED
    const res = await db.query(
      `SELECT id, tenant_id, aggregate_id, event_type, payload, request_id, attempts, created_at
       FROM outbox_events
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    if (res.rows.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const row of res.rows) {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

      try {
        // Publish to MongoDB
        await eventsCol.insertOne({
          eventId: row.id,
          type: row.event_type,
          tenantId: row.tenant_id,
          studentId: row.aggregate_id,
          attemptId: payload.attemptId || null,
          requestId: row.request_id,
          occurredAt: new Date(row.created_at),
          metadata: {
            competencyKey: payload.competencyKey,
            score: payload.score,
            reason: payload.reason,
            evaluatorId: payload.evaluatorId,
          },
        });

        // Mark published in PostgreSQL
        await db.query(
          `UPDATE outbox_events SET status = 'published', published_at = now() WHERE id = $1`,
          [row.id]
        );
        publishedCount++;
      } catch (err: any) {
        // Deduplication: MongoDB code 11000 duplicate key error means event was already delivered
        if (err.code === 11000 || (err.message && err.message.includes('duplicate key'))) {
          await db.query(
            `UPDATE outbox_events SET status = 'published', published_at = now() WHERE id = $1`,
            [row.id]
          );
          publishedCount++;
          continue;
        }

        // On genuine transient failure, record error and backoff
        const attempts = (row.attempts || 0) + 1;
        const status = attempts >= config.OUTBOX_MAX_RETRIES ? 'failed' : 'pending';
        const errorMessage = String(err?.message || err).substring(0, 500);

        await db.query(
          `UPDATE outbox_events
           SET attempts = attempts + 1, last_error = $1, status = $2
           WHERE id = $3`,
          [errorMessage, status, row.id]
        );
      }
    }

    return publishedCount;
  }
}

export const outboxPublisher = new OutboxPublisher();
