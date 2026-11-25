import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { LlmTrace } from '../src/models/LlmTrace.js';
import { User } from '../src/models/User.js';
import { fakeDeps } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

async function loginAdmin(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/google').send({
    credential: JSON.stringify({ sub: 'g-admin', email: 'admin@example.com', name: 'Admin', emailVerified: true }),
  });
  return { agent, id: res.body.id as string };
}

describe('admin + metrics', () => {
  const app = createApp(fakeDeps());
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(clearDb);

  it('normal users get 403 on every admin route', async () => {
    const { agent } = await registerAndLogin(app, 'u@x.com');
    expect((await agent.get('/api/admin/users')).status).toBe(403);
    expect((await agent.get('/api/admin/usage')).status).toBe(403);
    expect((await agent.patch('/api/admin/users/abc/role').send({ role: 'admin' })).status).toBe(403);
  });

  it('admin lists users with document counts and can change roles', async () => {
    const { user } = await registerAndLogin(app, 'u@x.com');
    const admin = await loginAdmin(app);
    const list = await admin.agent.get('/api/admin/users');
    expect(list.status).toBe(200);
    expect(list.body.map((u: { email: string }) => u.email).sort()).toEqual(['admin@example.com', 'u@x.com']);
    expect(list.body[0]).toHaveProperty('docCount');
    const patch = await admin.agent.patch(`/api/admin/users/${user.id}/role`).send({ role: 'admin' });
    expect(patch.status).toBe(200);
    expect((await User.findById(user.id))?.role).toBe('admin');
  });

  it('admin cannot demote themselves', async () => {
    const admin = await loginAdmin(app);
    const res = await admin.agent.patch(`/api/admin/users/${admin.id}/role`).send({ role: 'user' });
    expect(res.status).toBe(400);
  });

  it('usage aggregates totals, per-user cost and latency percentiles', async () => {
    const { user } = await registerAndLogin(app, 'u@x.com');
    const admin = await loginAdmin(app);
    await LlmTrace.insertMany(
      Array.from({ length: 10 }, (_, i) => ({
        userId: user.id, requestId: `r${i}`, op: i < 5 ? 'chat' : 'embed', model: 'gpt-4o-mini',
        promptTokens: 100, completionTokens: 10, latencyMs: (i + 1) * 100, costUsd: 0.001,
      })),
    );
    const res = await admin.agent.get('/api/admin/usage');
    expect(res.body.totals).toMatchObject({ calls: 10, promptTokens: 1000, completionTokens: 100 });
    expect(res.body.totals.costUsd).toBeCloseTo(0.01, 6);
    expect(res.body.latency).toEqual({ p50: 500, p95: 1000 });
    expect(res.body.byUser).toEqual([expect.objectContaining({ email: 'u@x.com', calls: 10 })]);
    expect(res.body.byOp).toMatchObject({ chat: { calls: 5 }, embed: { calls: 5 } });
  });

  it('GET /api/metrics returns only the current user\'s usage', async () => {
    const a = await registerAndLogin(app, 'a@x.com');
    const b = await registerAndLogin(app, 'b@x.com');
    await LlmTrace.create({ userId: a.user.id, requestId: 'x', op: 'chat', model: 'm', latencyMs: 10, costUsd: 0.5 });
    expect((await b.agent.get('/api/metrics')).body.totals.calls).toBe(0);
    expect((await a.agent.get('/api/metrics')).body.totals.calls).toBe(1);
  });
});
