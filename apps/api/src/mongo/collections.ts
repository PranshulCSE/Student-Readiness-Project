import { getMongoClient } from './client.js';
import type { IMongoCollection, MongoEventDoc } from './client.js';

export type { MongoEventDoc };

export function getEventsCollection(): IMongoCollection {
  return getMongoClient().getDb().collection('events');
}
