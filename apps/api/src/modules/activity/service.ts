import { getEventsCollection } from '../../mongo/collections.js';
import {
  ActivityResponse,
  ActivityItem,
  DuplicateStatsItem,
} from '@student-readiness/shared';
import { encodeCursor, decodeCursor } from '../students/cursor.js';

export class ActivityService {
  async listStudentActivity(
    tenantId: string,
    studentId: string,
    query: { limit?: number; cursor?: string }
  ): Promise<ActivityResponse> {
    const limit = query.limit || 20;
    const eventsCol = getEventsCollection();

    let occurredAtFilter: any = {};
    if (query.cursor) {
      try {
        const decoded = decodeCursor(query.cursor);
        occurredAtFilter = { $lt: new Date(decoded.val) };
      } catch {
        // Fallback to start
      }
    }

    const filter: any = {
      tenantId,
      studentId,
    };
    if (Object.keys(occurredAtFilter).length > 0) {
      filter.occurredAt = occurredAtFilter;
    }

    const docs = await eventsCol.find(filter).sort({ occurredAt: -1 }).limit(limit + 1);

    const hasMore = docs.length > limit;
    const pageDocs = docs.slice(0, limit);

    const items: ActivityItem[] = pageDocs.map((doc) => ({
      eventId: doc.eventId,
      type: doc.type,
      occurredAt: doc.occurredAt instanceof Date ? doc.occurredAt.toISOString() : new Date(doc.occurredAt).toISOString(),
      metadata: {
        competencyKey: doc.metadata?.competencyKey,
        score: doc.metadata?.score,
        reason: doc.metadata?.reason,
        evaluatorId: doc.metadata?.evaluatorId,
      },
    }));

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeCursor({
        id: last.eventId,
        val: last.occurredAt,
      });
    }

    return {
      data: items,
      page: {
        nextCursor,
        hasMore,
        limit,
      },
    };
  }

  async getDuplicateEventsAggregation(): Promise<DuplicateStatsItem[]> {
    const eventsCol = getEventsCollection();
    const pipeline = [
      {
        $group: {
          _id: { tenantId: '$tenantId', eventId: '$eventId' },
          count: { $sum: 1 },
          type: { $first: '$type' },
        },
      },
    ];

    const results = await eventsCol.aggregate(pipeline).toArray();

    // Map by tenant
    const tenantMap = new Map<string, {
      duplicateSuccessEvents: number;
      succeeded: number;
      rejected: number;
    }>();

    for (const item of results) {
      const tenantId = item.tenantId || (item._id && item._id.tenantId);
      if (!tenantId) continue;

      if (!tenantMap.has(tenantId)) {
        tenantMap.set(tenantId, {
          duplicateSuccessEvents: item.duplicateSuccessEvents || 0,
          succeeded: item.succeeded || 0,
          rejected: item.rejected || 0,
        });
      } else {
        const current = tenantMap.get(tenantId)!;
        if (item.count > 1) {
          current.duplicateSuccessEvents++;
        }
        if (item.type === 'attempt.succeeded') {
          current.succeeded++;
        } else if (item.type === 'attempt.rejected') {
          current.rejected++;
        }
      }
    }

    return Array.from(tenantMap.entries()).map(([tenantId, stats]) => {
      const total = stats.succeeded + stats.rejected;
      const rejectionRate = total > 0 ? Math.round((stats.rejected / total) * 1000) / 1000 : 0;
      return {
        tenantId,
        duplicateSuccessEvents: stats.duplicateSuccessEvents,
        rejected: stats.rejected,
        succeeded: stats.succeeded,
        rejectionRate,
      };
    });
  }
}
