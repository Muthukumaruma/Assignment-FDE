import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentModel } from '../src/models/Document.js';
import { User } from '../src/models/User.js';
import { startMemoryDb, stopMemoryDb } from './helpers.js';

describe('models', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);

  it('rejects a second user with the same email (case-insensitive)', async () => {
    await User.create({ email: 'a@x.com', name: 'A' });
    await expect(User.create({ email: 'A@X.com', name: 'A2' })).rejects.toThrow(/duplicate key/);
  });

  it('defaults role to user', async () => {
    const u = await User.create({ email: 'b@x.com', name: 'B' });
    expect(u.role).toBe('user');
  });

  it('requires kind and label on documents', async () => {
    const u = await User.create({ email: 'c@x.com', name: 'C' });
    await expect(DocumentModel.create({ userId: u._id, title: 't', rawText: 'x' })).rejects.toThrow(/kind|label/);
  });
});
