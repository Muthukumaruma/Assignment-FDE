import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureVectorIndex } from '../src/db/vectorIndex.js';
import { startMemoryDb, stopMemoryDb } from './helpers.js';

describe('ensureVectorIndex', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);

  it('creates the chunks collection before trying to create the search index (and never throws)', async () => {
    await mongoose.connection.db!.dropCollection('chunks').catch(() => undefined);
    await expect(ensureVectorIndex()).resolves.toBeUndefined();
    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
    expect(names).toContain('chunks');
  });
});
