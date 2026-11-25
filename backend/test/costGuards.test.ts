import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { fakeDeps } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const JOB = (n: number) => ({ kind: 'job', text: `Role ${n} — Co\nRequirements\nGo` });

describe('cost guards on LLM-backed document endpoints', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(clearDb);

  it('caps a user at 10 jobs', async () => {
    const { agent } = await registerAndLogin(createApp(fakeDeps()), 'cap@x.com');
    for (let i = 1; i <= 10; i++) expect((await agent.post('/api/documents').send(JOB(i))).status).toBe(201);
    const res = await agent.post('/api/documents').send(JOB(11));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/up to 10 jobs/);
  });

  it('loads sample data only into an empty workspace', async () => {
    const { agent } = await registerAndLogin(createApp(fakeDeps()), 'sample@x.com');
    expect((await agent.post('/api/documents/sample')).status).toBe(201);
    const again = await agent.post('/api/documents/sample');
    expect(again.status).toBe(409);
  });

  it('rate-limits uploads, sample loads and re-scoring per user', async () => {
    const app = createApp(fakeDeps(), { costLimitPerWindow: 3 });
    const { agent } = await registerAndLogin(app, 'rl@x.com');
    const job = await agent.post('/api/documents').send(JOB(1)); // 1
    await agent.post(`/api/documents/${job.body.id}/analyze`); // 2
    await agent.post(`/api/documents/${job.body.id}/analyze`); // 3
    const blocked = await agent.post(`/api/documents/${job.body.id}/analyze`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many/i);
    // reads are not limited
    expect((await agent.get('/api/documents')).status).toBe(200);
    // other users have their own budget
    const other = await registerAndLogin(app, 'rl2@x.com');
    expect((await other.agent.post('/api/documents').send(JOB(1))).status).toBe(201);
  });
});
