import { MongoClient, Db, Collection } from 'mongodb';
import { config } from '../config/index.js';

export interface MongoEventDoc {
  _id?: any;
  eventId: string;
  type: 'attempt.succeeded' | 'attempt.rejected' | 'attempt.voided' | string;
  tenantId: string;
  studentId: string | null;
  attemptId: string | null;
  requestId: string;
  occurredAt: Date;
  metadata: {
    competencyKey?: string;
    score?: number;
    reason?: string;
    evaluatorId?: string;
    [key: string]: any;
  };
}

export interface IMongoClient {
  getDb(): IMongoDb;
  close(): Promise<void>;
}

export interface IMongoDb {
  collection(name: string): IMongoCollection;
}

export interface IMongoCollection {
  createIndex(spec: any, options?: any): Promise<string>;
  insertOne(doc: MongoEventDoc): Promise<{ insertedId: any }>;
  find(filter?: any): {
    sort(spec: any): {
      limit(n: number): Promise<MongoEventDoc[]>;
    };
    toArray(): Promise<MongoEventDoc[]>;
  };
  aggregate(pipeline: any[]): {
    toArray(): Promise<any[]>;
  };
}

export class RealMongoClient implements IMongoClient {
  private client: MongoClient;
  private db: Db | null = null;

  constructor(uri?: string) {
    this.client = new MongoClient(uri || config.MONGODB_URI);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(config.MONGODB_DB);
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.db) return;
    const events = this.db.collection('events');
    await events.createIndex({ eventId: 1 }, { unique: true });
    await events.createIndex({ tenantId: 1, occurredAt: -1 });
    await events.createIndex({ tenantId: 1, type: 1, occurredAt: -1 });
  }

  getDb(): IMongoDb {
    if (!this.db) {
      this.db = this.client.db(config.MONGODB_DB);
    }
    const db = this.db;
    return {
      collection: (name: string): IMongoCollection => {
        const col = db.collection(name);
        return {
          createIndex: (spec, options) => col.createIndex(spec, options),
          insertOne: async (doc) => {
            const res = await col.insertOne(doc as any);
            return { insertedId: res.insertedId };
          },
          find: (filter) => ({
            sort: (spec) => ({
              limit: async (n) => (await col.find(filter).sort(spec).limit(n).toArray()) as unknown as MongoEventDoc[],
            }),
            toArray: async () => (await col.find(filter).toArray()) as unknown as MongoEventDoc[],
          }),
          aggregate: (pipeline) => ({
            toArray: async () => col.aggregate(pipeline).toArray(),
          }),
        };
      },
    };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/**
 * In-memory MongoDB mock collection for tests
 */
export class MemoryMongoCollection implements IMongoCollection {
  public docs: MongoEventDoc[] = [];
  public uniqueEventIds: Set<string> = new Set();

  async createIndex(_spec: any, _options?: any): Promise<string> {
    return 'index_created';
  }

  async insertOne(doc: MongoEventDoc): Promise<{ insertedId: any }> {
    if (this.uniqueEventIds.has(doc.eventId)) {
      const err: any = new Error(`E11000 duplicate key error collection: events index: eventId_1 dup key: { eventId: "${doc.eventId}" }`);
      err.code = 11000;
      throw err;
    }

    this.uniqueEventIds.add(doc.eventId);
    const stored = {
      ...doc,
      _id: `obj_${Math.random().toString(36).substring(2, 9)}`,
      occurredAt: doc.occurredAt instanceof Date ? doc.occurredAt : new Date(doc.occurredAt),
    };
    this.docs.push(stored);
    return { insertedId: stored._id };
  }

  find(filter: any = {}) {
    let filtered = [...this.docs];

    if (filter.tenantId) {
      filtered = filtered.filter((d) => d.tenantId === filter.tenantId);
    }
    if (filter.studentId) {
      filtered = filtered.filter((d) => d.studentId === filter.studentId);
    }
    if (filter.occurredAt && filter.occurredAt.$lt) {
      const beforeTime = new Date(filter.occurredAt.$lt).getTime();
      filtered = filtered.filter((d) => new Date(d.occurredAt).getTime() < beforeTime);
    }

    return {
      sort: (spec: any) => ({
        limit: async (n: number) => {
          let sorted = [...filtered];
          if (spec.occurredAt === -1) {
            sorted.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
          }
          return sorted.slice(0, n);
        },
      }),
      toArray: async () => filtered,
    };
  }

  aggregate(pipeline: any[]) {
    return {
      toArray: async () => {
        // Implementation of §4.8 duplicate and rejection rate aggregation:
        // Returns duplicate eventId count and rejection rate per tenant
        const tenants = Array.from(new Set(this.docs.map((d) => d.tenantId)));
        return tenants.map((tenantId) => {
          const tenantDocs = this.docs.filter((d) => d.tenantId === tenantId);
          const succeeded = tenantDocs.filter((d) => d.type === 'attempt.succeeded').length;
          const rejected = tenantDocs.filter((d) => d.type === 'attempt.rejected').length;
          const total = succeeded + rejected;
          const rejectionRate = total > 0 ? Math.round((rejected / total) * 1000) / 1000 : 0;

          return {
            tenantId,
            duplicateSuccessEvents: 0,
            rejected,
            succeeded,
            rejectionRate,
          };
        });
      },
    };
  }
}

export class MemoryMongoClient implements IMongoClient {
  private eventsCollection = new MemoryMongoCollection();

  getDb(): IMongoDb {
    return {
      collection: (_name: string) => this.eventsCollection,
    };
  }

  async close(): Promise<void> {}
}

let activeMongoClient: IMongoClient | null = null;

export function getMongoClient(): IMongoClient {
  if (!activeMongoClient) {
    if (config.USE_MEMORY_DB || process.env.USE_MEMORY_DB === 'true' || process.env.NODE_ENV === 'test') {
      activeMongoClient = new MemoryMongoClient();
    } else {
      activeMongoClient = new RealMongoClient();
    }
  }
  return activeMongoClient;
}

export function setMongoClient(client: IMongoClient): void {
  activeMongoClient = client;
}
