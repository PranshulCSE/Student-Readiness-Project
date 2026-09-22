import { getMongoClient, IMongoCollection, MongoEventDoc } from './client.js';

export { MongoEventDoc };

export function getEventsCollection(): IMongoCollection {
  return getMongoClient().getDb().collection('events');
}
